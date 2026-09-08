/**
 * Three layers of access (do not conflate them):
 *
 * 1. Navigation filtering — usability only. Keeps a person's screen to their
 *    own work. It is not an access boundary.
 * 2. Route guards — prevent entry to a surface URL. Nav and guards both read
 *    the same capability from the same SURFACES entry via `can` /
 *    `requireSurface` / `primaryNavSurfaces`.
 * 3. Firestore rules — the only real boundary, because a determined user can
 *    call the database without the application at all.
 */

import type { RouteRequire } from "./authState";
import {
  canAccessClinicSettings,
  canApproveResults,
  canDeletePatient,
  canEditTestCatalogue,
  canViewDashboard,
  canViewInventory,
  canViewOrders,
  canViewOwnRegisteredPatients,
  canViewPatients,
  canViewTestValueRollup,
} from "./permissions";

export const CAPABILITIES = [
  "view:ownWork",
  "view:patients",
  "view:orders",
  "release:results",
  "view:inventory",
  "view:testValue",
  "edit:catalogue",
  "manage:clinic",
  "restore:records",
  "platform:owner",
  "view:patientHistory",
] as const;

export type Capability = (typeof CAPABILITIES)[number];

export type SurfaceId =
  | "dashboard"
  | "patients"
  | "orders"
  | "review"
  | "store"
  | "accounts"
  | "catalogue"
  | "clinicAdmin"
  | "recycleBin"
  | "owner"
  | "patientHistory";

export type Surface = {
  id: SurfaceId;
  path: string;
  label: string;
  capability: Capability;
  /** When false, keep out of primary nav (route + deep links still gated). */
  primaryNav?: boolean;
};

export const SURFACES: readonly Surface[] = [
  { id: "dashboard", path: "/dashboard", label: "Dashboard", capability: "view:ownWork" },
  { id: "patients", path: "/patients", label: "Patients", capability: "view:patients" },
  { id: "orders", path: "/orders", label: "Orders", capability: "view:orders" },
  { id: "review", path: "/review", label: "Review", capability: "release:results" },
  { id: "store", path: "/inventory", label: "Store", capability: "view:inventory" },
  { id: "accounts", path: "/accounts", label: "Test value", capability: "view:testValue" },
  { id: "catalogue", path: "/settings/catalogue", label: "Catalogue", capability: "edit:catalogue" },
  { id: "clinicAdmin", path: "/settings/clinic", label: "Clinic admin", capability: "manage:clinic" },
  {
    id: "recycleBin",
    path: "/patients/deleted",
    label: "Recycle bin",
    capability: "restore:records",
    primaryNav: false,
  },
  { id: "owner", path: "/owner", label: "Owner", capability: "platform:owner" },
  {
    id: "patientHistory",
    path: "/patients/:patientId/history",
    label: "Patient history",
    capability: "view:patientHistory",
    primaryNav: false,
  },
] as const;

const CAPABILITY_PREDICATES: Record<Capability, (role: string | null | undefined) => boolean> = {
  "view:ownWork": canViewDashboard,
  "view:patients": (role) => canViewPatients(role) || canViewOwnRegisteredPatients(role),
  "view:orders": canViewOrders,
  "release:results": canApproveResults,
  "view:inventory": canViewInventory,
  "view:testValue": canViewTestValueRollup,
  "edit:catalogue": canEditTestCatalogue,
  "manage:clinic": canAccessClinicSettings,
  "restore:records": canDeletePatient,
  "platform:owner": (role) => role === "owner",
  "view:patientHistory": canApproveResults,
};

/** Single capability check used by nav filtering and route guards. */
export function can(role: string | null | undefined, capability: Capability): boolean {
  return CAPABILITY_PREDICATES[capability](role);
}

export function surfaceById(id: SurfaceId): Surface {
  const surface = SURFACES.find((entry) => entry.id === id);
  if (!surface) throw new Error(`Unknown surface: ${id}`);
  return surface;
}

/** ProtectedRoute `require` derived from the same SURFACES entry nav uses. */
export function requireSurface(id: SurfaceId): RouteRequire {
  const { capability } = surfaceById(id);
  return (role) => can(role, capability);
}

/** Primary nav rows for a role — one filter, no ad hoc role branches. */
export function primaryNavSurfaces(role: string | null | undefined): Surface[] {
  return SURFACES.filter((surface) => surface.primaryNav !== false && can(role, surface.capability));
}
