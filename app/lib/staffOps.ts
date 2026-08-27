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
import { AssignableRole, Shift, isShift, roleRequiresShift } from "./permissions";
import { syncCustomClaims } from "./authApi";
import {
  type ApproverStamp,
  type StaffRow,
  membershipsInScope,
  pendingEntries,
} from "./staffModel";

export {
  OWNER_NOT_ASSIGNABLE,
  groupStaffByRole,
  makeApproverStamp,
  membershipsInScope,
  pendingEntries,
  staffAssignmentGuard,
  staffCountsByClinic,
  type ApproverStamp,
  type PendingEntry,
  type RoleStaffGroup,
  type StaffRow,
} from "./staffModel";

const NO_CLINIC = "__none__";

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

export async function loadPendingApprovalCount(): Promise<number> {
  const { rows } = await loadStaffRows({ role: "owner", clinicId: null });
  const scoped = membershipsInScope(rows, { owner: true, clinicId: null });
  return pendingEntries(rows, scoped, { owner: true }).length;
}
