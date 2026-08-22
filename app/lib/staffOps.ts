import {
  collection,
  deleteField,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { isOwner as roleIsOwner, loadClinicNames } from "./clinicScope";
import { resolveIdentity, ClinicMembership } from "./membership";
import {
  ASSIGNABLE_ROLES,
  AssignableRole,
  Shift,
  isShift,
  roleLabel,
  roleRequiresShift,
} from "./permissions";
import { syncCustomClaims } from "./authApi";

const NO_CLINIC = "__none__";

export const OWNER_NOT_ASSIGNABLE = "The owner account cannot be assigned to a clinic.";

export interface StaffRow {
  uid: string;
  name: string | null;
  username: string | null;
  email: string | null;
  createdAt: string | null;
  isOwnerAccount: boolean;
  memberships: ClinicMembership[];
  activeClinicId: string | null;
}

export interface PendingEntry {
  row: StaffRow;
  membership: ClinicMembership | null;
}

export interface ApproverStamp {
  approvedByUid: string | null;
  approvedByUsername: string | null;
  approvedByEmail: string | null;
  approvedAt: string;
}

export function makeApproverStamp(user: {
  uid?: string;
  email?: string | null;
} | null, username: string | null): ApproverStamp {
  return {
    approvedByUid: user?.uid ?? null,
    approvedByUsername: username ?? null,
    approvedByEmail: user?.email ?? null,
    approvedAt: new Date().toISOString(),
  };
}

export function staffAssignmentGuard(
  row: StaffRow,
  targetClinicId: string,
  options: { owner: boolean; actorClinicId: string | null }
): string | null {
  if (row.isOwnerAccount) return OWNER_NOT_ASSIGNABLE;
  if (!targetClinicId) return "Select a clinic before assigning a role.";
  if (!options.owner && targetClinicId !== options.actorClinicId) {
    return "You can only manage your own clinic.";
  }
  return null;
}

export async function writeStaffMembership(options: {
  row: StaffRow;
  targetClinicId: string;
  nextRole: AssignableRole;
  shift?: Shift | null;
  status: "approved" | "rejected";
  makeActive: boolean;
  stamp: ApproverStamp;
}) {
  const { row, targetClinicId, nextRole, status, makeActive, stamp } = options;
  if (status === "approved" && roleRequiresShift(nextRole) && !isShift(options.shift)) {
    throw new Error("A shift is required for Shift Supervisor.");
  }
  const shift: Shift | null = roleRequiresShift(nextRole) && isShift(options.shift) ? options.shift : null;
  const existing = row.memberships.find((m) => m.clinicId === targetClinicId);
  const clinicIds = [...new Set([...row.memberships.map((m) => m.clinicId), targetClinicId])];

  const updates: Record<string, unknown> = {
    [`clinicRoles.${targetClinicId}`]: {
      role: nextRole,
      status,
      shift,
      createdAt: existing?.createdAt ?? row.createdAt ?? stamp.approvedAt,
      ...stamp,
    },
    clinicIds,
  };
  if (makeActive) {
    updates.role = nextRole;
    updates.clinicId = targetClinicId;
    updates.status = status;
    updates.activeClinicId = targetClinicId;
    updates.approvedBy = stamp.approvedByEmail;
    updates.approvedByUid = stamp.approvedByUid;
    updates.approvedByUsername = stamp.approvedByUsername;
    updates.approvedAt = stamp.approvedAt;
  }
  await updateDoc(doc(db, "users", row.uid), updates);
  await syncCustomClaims(row.uid);
  notifyStaffChanged();
}

export async function removeStaffAssignment(options: {
  row: StaffRow;
  membership: ClinicMembership;
}) {
  const { row, membership } = options;
  const remaining = row.memberships.filter((m) => m.clinicId !== membership.clinicId);
  const updates: Record<string, unknown> = {
    [`clinicRoles.${membership.clinicId}`]: deleteField(),
    clinicIds: remaining.map((m) => m.clinicId),
  };
  if (row.activeClinicId === membership.clinicId) {
    const fallback = remaining.find((m) => m.status === "approved") ?? remaining[0] ?? null;
    updates.clinicId = fallback?.clinicId ?? null;
    updates.activeClinicId = fallback?.clinicId ?? null;
    updates.role = fallback?.role ?? "pending";
    updates.status = fallback?.status ?? "pending";
  }
  await updateDoc(doc(db, "users", row.uid), updates);
  await syncCustomClaims(row.uid);
  notifyStaffChanged();
}

export async function loadStaffRows(options: {
  role: string | null;
  clinicId: string | null;
}): Promise<{ rows: StaffRow[]; clinicNames: Record<string, string> }> {
  const owner = roleIsOwner(options.role);
  const primary = owner
    ? await getDocs(collection(db, "users"))
    : await getDocs(
        query(collection(db, "users"), where("clinicId", "==", options.clinicId || NO_CLINIC))
      );
  const secondary = owner
    ? null
    : await getDocs(
        query(
          collection(db, "users"),
          where("clinicIds", "array-contains", options.clinicId || NO_CLINIC)
        )
      );

  const seen = new Map<string, StaffRow>();
  for (const snap of [primary, secondary]) {
    if (!snap) continue;
    for (const d of snap.docs) {
      if (seen.has(d.id)) continue;
      const data = d.data();
      const identity = resolveIdentity(data);
      seen.set(d.id, {
        uid: d.id,
        name: identity.name,
        username: identity.username,
        email: identity.email,
        createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
        isOwnerAccount: data.role === "owner",
        memberships: identity.memberships,
        activeClinicId: identity.clinicId,
      });
    }
  }

  const rows = [...seen.values()].sort((a, b) =>
    (a.username || a.name || a.email || a.uid).localeCompare(
      b.username || b.name || b.email || b.uid
    )
  );
  const clinicNames = await loadClinicNames(
    options.role,
    rows.flatMap((r) => r.memberships.map((m) => m.clinicId))
  );
  return { rows, clinicNames };
}

export function pendingEntries(
  rows: StaffRow[],
  scopedMemberships: Map<string, ClinicMembership[]>,
  options: { owner: boolean; scopeClinicId?: string | null }
): PendingEntry[] {
  const entries: PendingEntry[] = [];
  for (const row of rows) {
    if (row.isOwnerAccount) continue;
    const scoped = scopedMemberships.get(row.uid) ?? [];
    const waiting = scoped.filter((m) => m.status === "pending");
    if (waiting.length > 0) {
      for (const membership of waiting) {
        if (options.scopeClinicId && membership.clinicId !== options.scopeClinicId) continue;
        entries.push({ row, membership });
      }
    } else if (options.owner && row.memberships.length === 0) {
      entries.push({ row, membership: null });
    }
  }
  return entries;
}

export function membershipsInScope(
  rows: StaffRow[],
  options: { owner: boolean; clinicId: string | null; scopeClinicId?: string | null }
): Map<string, ClinicMembership[]> {
  const scopeId = options.scopeClinicId || (!options.owner ? options.clinicId : null);
  return new Map(
    rows.map((row) => [
      row.uid,
      scopeId ? row.memberships.filter((m) => m.clinicId === scopeId) : row.memberships,
    ])
  );
}

const staffChangedListeners = new Set<() => void>();

export function subscribeStaffChanged(listener: () => void) {
  staffChangedListeners.add(listener);
  return () => {
    staffChangedListeners.delete(listener);
  };
}

export function notifyStaffChanged() {
  for (const listener of staffChangedListeners) listener();
}

export async function loadPendingApprovalCount(): Promise<number> {
  const { rows } = await loadStaffRows({ role: "owner", clinicId: null });
  const scoped = membershipsInScope(rows, { owner: true, clinicId: null });
  return pendingEntries(rows, scoped, { owner: true }).length;
}

/** Approved memberships only; owner accounts are not clinic staff. */
export function staffCountsByClinic(rows: StaffRow[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const row of rows) {
    if (row.isOwnerAccount) continue;
    for (const membership of row.memberships) {
      if (membership.status !== "approved") continue;
      counts[membership.clinicId] = (counts[membership.clinicId] ?? 0) + 1;
    }
  }
  return counts;
}

export interface RoleStaffGroup {
  role: string;
  label: string;
  members: { row: StaffRow; membership: ClinicMembership }[];
}

export function groupStaffByRole(
  members: { row: StaffRow; membership: ClinicMembership }[]
): RoleStaffGroup[] {
  const byRole = new Map<string, { row: StaffRow; membership: ClinicMembership }[]>();
  for (const item of members) {
    const bucket = byRole.get(item.membership.role) ?? [];
    bucket.push(item);
    byRole.set(item.membership.role, bucket);
  }
  const ordered: RoleStaffGroup[] = [];
  for (const role of ASSIGNABLE_ROLES) {
    const group = byRole.get(role);
    if (group?.length) {
      ordered.push({ role, label: roleLabel(role), members: group });
      byRole.delete(role);
    }
  }
  for (const [role, group] of byRole) {
    if (role === "owner") continue;
    ordered.push({ role, label: roleLabel(role), members: group });
  }
  return ordered;
}
