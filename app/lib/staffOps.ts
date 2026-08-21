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
import { AssignableRole, isAssignableRole } from "./permissions";

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
  status: "approved" | "rejected";
  makeActive: boolean;
  stamp: ApproverStamp;
}) {
  const { row, targetClinicId, nextRole, status, makeActive, stamp } = options;
  const existing = row.memberships.find((m) => m.clinicId === targetClinicId);
  const clinicIds = [...new Set([...row.memberships.map((m) => m.clinicId), targetClinicId])];

  const updates: Record<string, unknown> = {
    [`clinicRoles.${targetClinicId}`]: {
      role: nextRole,
      status,
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
