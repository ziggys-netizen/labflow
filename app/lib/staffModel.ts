import { ClinicMembership } from "./membership";
import { ASSIGNABLE_ROLES, roleLabel } from "./permissions";

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

export function makeApproverStamp(
  user: {
    uid?: string;
    email?: string | null;
  } | null,
  username: string | null
): ApproverStamp {
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
