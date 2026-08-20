/**
 * Role capabilities from PRD v0.2 section 3.3 (permissions matrix).
 * Note: `admin` is not a role in v0.2 — it was split into `clinic_admin`
 * (administration) and `lab_manager` (laboratory judgement).
 */

export const ROLES = [
  "owner",
  "clinic_admin",
  "lab_manager",
  "technician",
  "storekeeper",
  "pending",
] as const;

export type Role = (typeof ROLES)[number];

/** Management dashboard and statistics — PRD 3.3, 5.2. */
export function canViewDashboard(role: string | null | undefined) {
  return role === "owner" || role === "clinic_admin" || role === "lab_manager";
}

/** Recording that a sample was physically taken — PRD 5.4. */
export function canRecordSampleCollection(role: string | null | undefined) {
  return role === "owner" || role === "lab_manager" || role === "technician";
}
