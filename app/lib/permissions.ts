/**
 * Role capabilities from PRD v0.2 section 3.3 (permissions matrix), extended
 * 21 August 2026 with `lab_supervisor`, `intern`, and `technician_assistant`.
 *
 * `admin` is not a role — it was split into `clinic_admin` (administration)
 * and `lab_manager` (laboratory judgement). Do not gate anything on `"admin"`.
 */

export const ROLES = [
  "owner",
  "clinic_admin",
  "lab_manager",
  "lab_supervisor",
  "technician",
  "technician_assistant",
  "intern",
  "storekeeper",
  "pending",
] as const;

export type Role = (typeof ROLES)[number];

/** Roles an administrator may assign. `owner` is never offered — PRD 3.5. */
export const ASSIGNABLE_ROLES = [
  "clinic_admin",
  "lab_manager",
  "lab_supervisor",
  "technician",
  "technician_assistant",
  "intern",
  "storekeeper",
] as const;

export type AssignableRole = (typeof ASSIGNABLE_ROLES)[number];

export function isAssignableRole(role: string | null | undefined): role is AssignableRole {
  return ASSIGNABLE_ROLES.includes(role as AssignableRole);
}

/**
 * Display wording, kept in one place so the label can change without touching
 * the stored value. `storekeeper` follows the PRD, which names both the role
 * and section 6 "Storekeeper"; "Stockkeeper" is the same role by another name.
 */
export const ROLE_LABELS: Record<string, string> = {
  owner: "Owner",
  clinic_admin: "Clinic Admin",
  lab_manager: "Lab Manager",
  lab_supervisor: "Lab Supervisor",
  technician: "Technician",
  technician_assistant: "Technician Assistant",
  intern: "Intern",
  storekeeper: "Storekeeper",
  pending: "Pending",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  return ROLE_LABELS[role] ?? role;
}

export function isIntern(role: string | null | undefined) {
  return role === "intern";
}

/**
 * technician_assistant: the founder did not specify this role. It is treated as
 * identical to `technician` — bench work (patients, orders, results entry,
 * sample collection) with no result approval, catalogue editing, staff
 * management, dashboard, or export.
 */
export function isTechnicianBench(role: string | null | undefined) {
  return role === "technician" || role === "technician_assistant";
}

/** Laboratory judgement roles: manager and supervisor share clinical authority. */
export function isLaboratoryLead(role: string | null | undefined) {
  return role === "lab_manager" || role === "lab_supervisor";
}

/** Management dashboard and statistics — PRD 3.3, 5.2. Supervisor included. */
export function canViewDashboard(role: string | null | undefined) {
  return role === "owner" || role === "clinic_admin" || isLaboratoryLead(role);
}

/** Recording that a sample was physically taken — PRD 5.4. */
export function canRecordSampleCollection(role: string | null | undefined) {
  return role === "owner" || isLaboratoryLead(role) || isTechnicianBench(role);
}

/**
 * Approve / release results, or send them back for correction.
 * PRD 3.3 / 3.4: owner and laboratory leads only. `clinic_admin` must not
 * approve — administration is separated from laboratory judgement.
 */
export function canApproveResults(role: string | null | undefined) {
  return role === "owner" || isLaboratoryLead(role);
}

/** Edit test catalogue (units, ranges, prices) — same laboratory judgement as approval. */
export function canEditCatalogue(role: string | null | undefined) {
  return role === "owner" || isLaboratoryLead(role);
}

/**
 * Excel export of reports — PRD 3.3. `lab_supervisor` matches `lab_manager`
 * except this flag, which is false. Export UI is not built yet; keep the
 * helper so it cannot be granted by accident later.
 */
export function canExportReports(role: string | null | undefined) {
  return role === "owner" || role === "clinic_admin" || role === "lab_manager";
}

/** Approve/reject staff and assign roles within a clinic — PRD 3.3. */
export function canManageStaff(role: string | null | undefined) {
  return role === "owner" || role === "clinic_admin";
}

export function isStorekeeper(role: string | null | undefined) {
  return role === "storekeeper";
}

/**
 * Patient directory, orders list, and print. Interns may register a patient
 * but must not browse the patient table afterwards.
 */
export function canBrowsePatients(role: string | null | undefined) {
  if (!role || role === "pending" || isIntern(role) || isStorekeeper(role)) return false;
  return true;
}

export function canBrowseOrders(role: string | null | undefined) {
  return canBrowsePatients(role);
}

/** "View stock balances" is granted to every role in the PRD 3.3 matrix except intern. */
export function canViewInventory(role: string | null | undefined) {
  return (
    role === "owner" ||
    role === "clinic_admin" ||
    isLaboratoryLead(role) ||
    isTechnicianBench(role) ||
    role === "storekeeper"
  );
}

/** "Record stock in / out" — PRD 3.3 grants this to owner, lab_manager, storekeeper. Supervisor matches manager. */
export function canRecordStockMovement(role: string | null | undefined) {
  return role === "owner" || isLaboratoryLead(role) || role === "storekeeper";
}

/**
 * Maintaining the item master (products, packaging, minimum stock levels).
 * Not a separate line in the PRD matrix; it is treated as part of keeping the
 * stock record, so it follows "record stock in / out".
 */
export function canManageInventoryItems(role: string | null | undefined) {
  return canRecordStockMovement(role);
}

/**
 * Logging specimens into and out of the laboratory. Not in the PRD matrix
 * either; granted to the roles that physically handle specimens. `clinic_admin`
 * is excluded to keep administration out of the laboratory (PRD 3.4).
 */
export function canRecordSpecimenMovement(role: string | null | undefined) {
  return (
    role === "owner" ||
    isLaboratoryLead(role) ||
    isTechnicianBench(role) ||
    role === "storekeeper"
  );
}

/** Where a role should land after sign-in, so each role sees its own workspace first. */
export function landingPathForRole(role: string | null | undefined): string {
  if (isIntern(role)) return "/register";
  if (isStorekeeper(role)) return "/inventory";
  if (canViewDashboard(role)) return "/dashboard";
  return "/patients";
}

/**
 * Paths an intern may open. Anything else, including URL guessing, must send
 * them back to registration. Profile is identity only, not a patient table.
 */
export function internAllowedPath(pathname: string): boolean {
  return pathname === "/register" || pathname === "/profile";
}

/** Capability redirect for roles that must not fall through ProtectedRoute. */
export function capabilityRedirect(
  role: string | null | undefined,
  pathname: string
): string | null {
  if (isIntern(role) && !internAllowedPath(pathname)) {
    return "/register";
  }
  return null;
}
