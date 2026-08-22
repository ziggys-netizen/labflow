/**
 * Role capabilities — single source of truth.
 *
 * Pages must call these predicates. Do not compare role strings in UI except
 * `role === "owner"` for the Owner nav link. `admin` is not a role.
 *
 * `technician_assistant` is not a technician: register patients, view patients,
 * record sample collection, record specimen movement, view inventory. They do
 * not order tests, enter results, approve, or manage catalogue/staff/stock.
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

/** Roles an administrator may assign. `owner` is never offered. */
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

export const SHIFTS = ["morning", "afternoon", "night"] as const;

export type Shift = (typeof SHIFTS)[number];

export function isAssignableRole(role: string | null | undefined): role is AssignableRole {
  return ASSIGNABLE_ROLES.includes(role as AssignableRole);
}

export function isShift(value: string | null | undefined): value is Shift {
  return SHIFTS.includes(value as Shift);
}

export function roleRequiresShift(role: string | null | undefined) {
  return role === "lab_supervisor";
}

export const ROLE_LABELS: Record<Role, string> = {
  owner: "Platform Owner",
  clinic_admin: "Clinic Administrator",
  lab_manager: "Lab Manager",
  lab_supervisor: "Shift Supervisor",
  technician: "Technician",
  technician_assistant: "Technician Assistant",
  intern: "Intern",
  storekeeper: "Storekeeper",
  pending: "Pending",
};

export const SHIFT_LABELS: Record<Shift, string> = {
  morning: "Morning",
  afternoon: "Afternoon",
  night: "Night",
};

export function roleLabel(role: string | null | undefined): string {
  if (!role) return "—";
  return ROLE_LABELS[role as Role] ?? role;
}

export function shiftLabel(shift: string | null | undefined): string {
  if (!shift || !isShift(shift)) return "";
  return SHIFT_LABELS[shift];
}

/** e.g. "Shift Supervisor — Night". Other roles omit the shift. */
export function roleDisplay(role: string | null | undefined, shift?: string | null): string {
  const label = roleLabel(role);
  if (roleRequiresShift(role) && shift && isShift(shift)) {
    return `${label} — ${shiftLabel(shift)}`;
  }
  return label;
}

function allows(role: string | null | undefined, ...allowed: Role[]): boolean {
  return !!role && (allowed as readonly string[]).includes(role);
}

export function canRegisterPatient(role: string | null | undefined) {
  return allows(
    role,
    "owner",
    "lab_manager",
    "lab_supervisor",
    "technician",
    "technician_assistant",
    "intern"
  );
}

export function canViewPatients(role: string | null | undefined) {
  return allows(
    role,
    "owner",
    "clinic_admin",
    "lab_manager",
    "lab_supervisor",
    "technician",
    "technician_assistant"
  );
}

export function canOrderTests(role: string | null | undefined) {
  // technician_assistant is excluded — collection only, no ordering.
  return allows(role, "owner", "lab_manager", "lab_supervisor", "technician");
}

export function canRecordSampleCollection(role: string | null | undefined) {
  return allows(
    role,
    "owner",
    "lab_manager",
    "lab_supervisor",
    "technician",
    "technician_assistant"
  );
}

export function canEnterResults(role: string | null | undefined) {
  // technician_assistant is excluded — they may open an order to collect a
  // sample, but results stay read-only.
  return allows(role, "owner", "lab_manager", "lab_supervisor", "technician");
}

export function canApproveResults(role: string | null | undefined) {
  return allows(role, "owner", "lab_manager", "lab_supervisor");
}

export function canSendBackForCorrection(role: string | null | undefined) {
  return canApproveResults(role);
}

export function canEditTestCatalogue(role: string | null | undefined) {
  return allows(role, "owner", "lab_manager", "lab_supervisor");
}

export function canViewDashboard(role: string | null | undefined) {
  return allows(role, "owner", "clinic_admin", "lab_manager", "lab_supervisor");
}

/** lab_supervisor matches lab_manager except this flag. */
export function canExportData(role: string | null | undefined) {
  return allows(role, "owner", "clinic_admin", "lab_manager");
}

export function canManageStaff(role: string | null | undefined) {
  return allows(role, "owner", "clinic_admin");
}

/**
 * Nested clinic profile/staff pages under `/owner/clinics/[id]`.
 * Owner: any clinic. clinic_admin: only the clinic currently active on their account.
 */
export function canAccessClinicWorkspace(
  role: string | null | undefined,
  actorClinicId: string | null | undefined,
  targetClinicId: string | null | undefined
) {
  if (!targetClinicId) return false;
  if (role === "owner") return true;
  return role === "clinic_admin" && actorClinicId === targetClinicId;
}

export function canViewJoinCode(role: string | null | undefined) {
  return allows(role, "owner", "clinic_admin");
}

export function canEditClinicProfile(role: string | null | undefined) {
  return allows(role, "owner", "clinic_admin");
}

export function canImportData(role: string | null | undefined) {
  return allows(role, "owner", "clinic_admin");
}

export function canDeletePatient(role: string | null | undefined) {
  return allows(role, "owner", "clinic_admin", "lab_manager", "lab_supervisor");
}

export function canViewInventory(role: string | null | undefined) {
  return allows(
    role,
    "owner",
    "clinic_admin",
    "lab_manager",
    "lab_supervisor",
    "technician",
    "technician_assistant",
    "storekeeper"
  );
}

export function canRecordStockMovement(role: string | null | undefined) {
  return allows(role, "owner", "lab_manager", "lab_supervisor", "storekeeper");
}

export function canManageInventoryItems(role: string | null | undefined) {
  return allows(role, "owner", "lab_manager", "lab_supervisor", "storekeeper");
}

export function canRecordSpecimenMovement(role: string | null | undefined) {
  return allows(
    role,
    "owner",
    "lab_manager",
    "lab_supervisor",
    "technician",
    "technician_assistant",
    "storekeeper"
  );
}

export function landingPathForRole(
  role: string | null | undefined,
  clinicId?: string | null
): string {
  switch (role) {
    case "owner":
      return "/owner";
    case "clinic_admin":
      return clinicId ? `/owner/clinics/${clinicId}/staff` : "/patients";
    case "lab_manager":
    case "lab_supervisor":
      return "/dashboard";
    case "technician":
    case "technician_assistant":
      return "/patients";
    case "intern":
      return "/register";
    case "storekeeper":
      return "/inventory";
    default:
      return "/patients";
  }
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
  if (role === "intern" && !internAllowedPath(pathname)) {
    return "/register";
  }
  return null;
}

export const CAPABILITY_CHECKS: Record<string, (role: string | null | undefined) => boolean> = {
  canRegisterPatient,
  canViewPatients,
  canOrderTests,
  canRecordSampleCollection,
  canEnterResults,
  canApproveResults,
  canSendBackForCorrection,
  canEditTestCatalogue,
  canViewDashboard,
  canExportData,
  canManageStaff,
  canViewJoinCode,
  canEditClinicProfile,
  canImportData,
  canDeletePatient,
  canViewInventory,
  canRecordStockMovement,
  canManageInventoryItems,
  canRecordSpecimenMovement,
};

/**
 * Development-only dump of every role × every unary capability. Call from a
 * client module that actually loads (AuthProvider) so it appears in the
 * browser console — do not leave this unused.
 */
export function logPermissionsMatrix() {
  if (process.env.NODE_ENV !== "development") return;
  if (typeof window === "undefined") return;
  const table: Record<string, Record<string, boolean>> = {};
  for (const role of ROLES) {
    const row: Record<string, boolean> = {};
    for (const [name, check] of Object.entries(CAPABILITY_CHECKS)) {
      row[name] = check(role);
    }
    table[role] = row;
  }
  console.info("LabFlow permissions matrix (development)");
  console.table(table);
}
