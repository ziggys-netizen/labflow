/**
 * Role capabilities — single source of truth for actions.
 *
 * Surface visibility (nav + route entry) lives in `surfaces.ts` and must stay
 * aligned with these predicates. Do not compare role strings in UI except
 * `role === "owner"` where a predicate is not enough. `admin` is not a role.
 *
 * `technician_assistant` is not a technician: register patients, view patients,
 * see/collect on orders. They do not create orders, enter results, approve,
 * manage catalogue/staff/stock, or open Store.
 *
 * `accounts` reads daily test-value rollups only. Never patients, orders, or
 * results — totals must not become a clinical access path.
 */

import { isTermsReadablePath } from "./legal/termsGate";

export const ROLES = [
  "owner",
  "clinic_admin",
  "lab_manager",
  "lab_supervisor",
  "technician",
  "technician_assistant",
  "intern",
  "storekeeper",
  "accounts",
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
  "accounts",
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
  accounts: "Accounts officer",
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

/** Technician landing on /dashboard is the work board, not the patient list. */
export function isTechnicianBoardRole(role: string | null | undefined) {
  return allows(role, "technician", "technician_assistant");
}

/**
 * Lab manager landing on /dashboard is the line board.
 * Supervisor shares that landing. Owner and clinic_admin do not — they
 * keep the clinic picker / staff home.
 */
export function isManagerBoardRole(role: string | null | undefined) {
  return allows(role, "lab_manager", "lab_supervisor");
}

/** Storekeeper landing on /inventory is the store board, not the full filter desk. */
export function isStorekeeperBoardRole(role: string | null | undefined) {
  return allows(role, "storekeeper");
}

/** Intern landing on /register is the reception board; register stays primary. */
export function isReceptionBoardRole(role: string | null | undefined) {
  return allows(role, "intern");
}

/** Accounts own-work dashboard is the rollup hand-off, not clinic stats. */
export function isAccountsBoardRole(role: string | null | undefined) {
  return allows(role, "accounts");
}

/**
 * Manager queue deep-links under /dashboard/queues/*. Clinic-stats dashboard
 * roles (owner, clinic_admin) share these URLs with the line board.
 */
export function canViewClinicQueuePages(role: string | null | undefined) {
  return allows(role, "owner", "clinic_admin", "lab_manager", "lab_supervisor");
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
  // Catalogue surface (`edit:catalogue` /settings/catalogue). Clinic admin is separate.
  return allows(role, "owner", "lab_manager");
}

/**
 * Own-work / role dashboard. Every clinic role gets the Dashboard surface;
 * what they see on it is role-specific (line board, tech board, clinic stats).
 */
export function canViewDashboard(role: string | null | undefined) {
  return allows(
    role,
    "owner",
    "clinic_admin",
    "lab_manager",
    "lab_supervisor",
    "technician",
    "technician_assistant",
    "intern",
    "storekeeper",
    "accounts"
  );
}

/** Orders list / open-order surface. tech_assistant is partial (collect only). */
export function canViewOrders(role: string | null | undefined) {
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

/**
 * Clinic admin surface (/settings/clinic): owner, clinic_admin.
 * Catalogue is `canEditTestCatalogue` / `/settings/catalogue` (owner, lab_manager).
 * lab_supervisor reaches neither settings surface.
 */
export function canAccessClinicSettings(role: string | null | undefined) {
  return allows(role, "owner", "clinic_admin");
}

/**
 * Day's test counts and catalogue value. Aggregate only — no patient drill-down.
 * Lab roles that release still write the rollup; they use the clinical dashboard.
 */
export function canViewTestValueRollup(role: string | null | undefined) {
  return allows(role, "owner", "clinic_admin", "accounts");
}

/** lab_supervisor matches lab_manager except this flag. */
export function canExportData(role: string | null | undefined) {
  return allows(role, "owner", "clinic_admin", "lab_manager");
}

export function canManageStaff(role: string | null | undefined) {
  return allows(role, "owner", "clinic_admin");
}

export function isClinicAdmin(role: string | null | undefined) {
  return role === "clinic_admin";
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

/** Patient/clinical spreadsheet import. clinic_admin may still import staff pre-approvals. */
export function canImportData(role: string | null | undefined) {
  return allows(role, "owner", "lab_manager");
}

export function canImportStaffPreApprovals(role: string | null | undefined) {
  return allows(role, "owner", "clinic_admin");
}

export function canDeletePatient(role: string | null | undefined) {
  return allows(role, "owner", "clinic_admin", "lab_manager");
}

export function canRejectSample(role: string | null | undefined) {
  return allows(
    role,
    "owner",
    "lab_manager",
    "lab_supervisor",
    "technician",
    "technician_assistant"
  );
}

export function canAmendResult(role: string | null | undefined) {
  return canApproveResults(role);
}

export function canCancelOrder(role: string | null | undefined) {
  return canOrderTests(role);
}

export function canExecuteErasure(role: string | null | undefined) {
  return role === "owner";
}

/** Alter another person's unreleased result. Own unreleased edits stay with entry. */
export function canModifyOthersUnreleasedResult(role: string | null | undefined) {
  return allows(role, "owner", "lab_manager", "lab_supervisor");
}

export function canViewOwnRegisteredPatients(role: string | null | undefined) {
  return allows(
    role,
    "owner",
    "clinic_admin",
    "lab_manager",
    "lab_supervisor",
    "technician",
    "technician_assistant",
    "intern"
  );
}

export function canCorrectPatientRecord(role: string | null | undefined) {
  return allows(role, "owner", "lab_manager", "lab_supervisor");
}

export function canRecordCriticalNotification(role: string | null | undefined) {
  return allows(role, "owner", "lab_manager", "lab_supervisor", "technician");
}

export function canViewInventory(role: string | null | undefined) {
  // Store surface: technician / tech_assistant / lab_supervisor are hidden.
  return allows(role, "owner", "clinic_admin", "lab_manager", "storekeeper");
}

export function canRecordStockMovement(role: string | null | undefined) {
  return allows(role, "owner", "lab_manager", "storekeeper");
}

export function canManageInventoryItems(role: string | null | undefined) {
  return allows(role, "owner", "lab_manager", "storekeeper");
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
      return "/dashboard";
    case "intern":
      return "/register";
    case "storekeeper":
      return "/inventory";
    case "accounts":
      return "/accounts";
    default:
      return "/patients";
  }
}

/**
 * Paths an intern may open. Anything else, including URL guessing, must send
 * them back to registration. Profile is identity only, not a patient table.
 */
export function internAllowedPath(pathname: string): boolean {
  if (isTermsReadablePath(pathname)) return true;
  if (
    pathname === "/register" ||
    pathname === "/profile" ||
    pathname === "/patients" ||
    pathname === "/dashboard"
  ) {
    return true;
  }
  return pathname.startsWith("/patients/") && pathname.endsWith("/print");
}

/** Accounts officers: rollup page, own-work dashboard, identity, and legal documents. */
export function accountsAllowedPath(pathname: string): boolean {
  return (
    pathname === "/accounts" ||
    pathname === "/dashboard" ||
    pathname === "/profile" ||
    isTermsReadablePath(pathname)
  );
}

/** Capability redirect for roles that must not fall through ProtectedRoute. */
export function capabilityRedirect(
  role: string | null | undefined,
  pathname: string
): string | null {
  if (role === "intern" && !internAllowedPath(pathname)) {
    return "/register";
  }
  if (role === "accounts" && !accountsAllowedPath(pathname)) {
    return "/accounts";
  }
  return null;
}

export const CAPABILITY_CHECKS: Record<string, (role: string | null | undefined) => boolean> = {
  canRegisterPatient,
  canViewPatients,
  canViewOwnRegisteredPatients,
  canOrderTests,
  canRecordSampleCollection,
  canEnterResults,
  canApproveResults,
  canAmendResult,
  canSendBackForCorrection,
  canRejectSample,
  canCancelOrder,
  canModifyOthersUnreleasedResult,
  canCorrectPatientRecord,
  canRecordCriticalNotification,
  canEditTestCatalogue,
  canViewDashboard,
  canViewOrders,
  canAccessClinicSettings,
  canViewTestValueRollup,
  canExportData,
  canManageStaff,
  canViewJoinCode,
  canEditClinicProfile,
  canImportData,
  canImportStaffPreApprovals,
  canDeletePatient,
  canExecuteErasure,
  canViewInventory,
  canRecordStockMovement,
  canManageInventoryItems,
  canRecordSpecimenMovement,
};

/**
 * Development-only dump of every role ├ù every unary capability. Call from a
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
