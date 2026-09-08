import { describe, expect, it } from "vitest";
import { ROLES, type Role } from "./permissions";
import {
  CAPABILITIES,
  SURFACES,
  can,
  primaryNavSurfaces,
  requireSurface,
  surfaceById,
  type Capability,
} from "./surfaces";

/**
 * I3 surface matrix. Written out in full — do not derive from implementation.
 * ● / ◐ both mean the surface is visible (route + nav when primary). – is hidden.
 */
const SURFACE_VISIBLE: Record<
  Exclude<Role, "pending">,
  Record<(typeof SURFACES)[number]["id"], boolean>
> = {
  owner: {
    dashboard: true,
    patients: true,
    orders: true,
    review: true,
    store: true,
    accounts: true,
    settings: true,
    recycleBin: true,
    owner: true,
    patientHistory: true,
  },
  clinic_admin: {
    dashboard: true,
    patients: true,
    orders: false,
    review: false,
    store: true,
    accounts: true,
    settings: true,
    recycleBin: true,
    owner: false,
    patientHistory: false,
  },
  lab_manager: {
    dashboard: true,
    patients: true,
    orders: true,
    review: true,
    store: true,
    accounts: false,
    settings: true,
    recycleBin: true,
    owner: false,
    patientHistory: true,
  },
  lab_supervisor: {
    dashboard: true,
    patients: true,
    orders: true,
    review: true,
    store: false,
    accounts: false,
    settings: false,
    recycleBin: false,
    owner: false,
    patientHistory: true,
  },
  technician: {
    dashboard: true,
    patients: true,
    orders: true,
    review: false,
    store: false,
    accounts: false,
    settings: false,
    recycleBin: false,
    owner: false,
    patientHistory: false,
  },
  technician_assistant: {
    dashboard: true,
    patients: true,
    orders: true,
    review: false,
    store: false,
    accounts: false,
    settings: false,
    recycleBin: false,
    owner: false,
    patientHistory: false,
  },
  intern: {
    dashboard: true,
    patients: true,
    orders: false,
    review: false,
    store: false,
    accounts: false,
    settings: false,
    recycleBin: false,
    owner: false,
    patientHistory: false,
  },
  storekeeper: {
    dashboard: true,
    patients: false,
    orders: false,
    review: false,
    store: true,
    accounts: false,
    settings: false,
    recycleBin: false,
    owner: false,
    patientHistory: false,
  },
  accounts: {
    dashboard: true,
    patients: false,
    orders: false,
    review: false,
    store: false,
    accounts: true,
    settings: false,
    recycleBin: false,
    owner: false,
    patientHistory: false,
  },
};

describe("SURFACES declaration", () => {
  it("lists every capability used by a surface", () => {
    const used = new Set(SURFACES.map((s) => s.capability));
    expect([...used].sort()).toEqual([...CAPABILITIES].sort());
  });

  it("keeps recycle bin and patient history out of primary nav", () => {
    expect(surfaceById("recycleBin").primaryNav).toBe(false);
    expect(surfaceById("patientHistory").primaryNav).toBe(false);
  });

  it("requireSurface matches can() for the same SURFACES entry", () => {
    for (const surface of SURFACES) {
      const require = requireSurface(surface.id);
      for (const role of ROLES) {
        expect(require(role)).toBe(can(role, surface.capability));
      }
    }
  });
});

describe("I3 surface visibility", () => {
  const roles = Object.keys(SURFACE_VISIBLE) as Array<keyof typeof SURFACE_VISIBLE>;

  it.each(roles)("%s matches every surface cell", (role) => {
    const expected = SURFACE_VISIBLE[role];
    for (const surface of SURFACES) {
      expect(can(role, surface.capability), surface.id).toBe(expected[surface.id]);
    }
  });

  it("pending has no surfaces", () => {
    for (const surface of SURFACES) {
      expect(can("pending", surface.capability), surface.id).toBe(false);
    }
  });

  it("technician primary nav is Dashboard, Patients, Orders only", () => {
    expect(primaryNavSurfaces("technician").map((s) => s.id)).toEqual([
      "dashboard",
      "patients",
      "orders",
    ]);
  });

  it("intern primary nav has Patients and Dashboard but not Orders", () => {
    const ids = primaryNavSurfaces("intern").map((s) => s.id);
    expect(ids).toContain("dashboard");
    expect(ids).toContain("patients");
    expect(ids).not.toContain("orders");
  });

  it("tech_assistant keeps Orders in nav (partial: collect only at action layer)", () => {
    expect(primaryNavSurfaces("technician_assistant").map((s) => s.id)).toEqual([
      "dashboard",
      "patients",
      "orders",
    ]);
  });
});

describe("capability catalogue", () => {
  it("every Capability has a can() predicate", () => {
    for (const capability of CAPABILITIES) {
      expect(typeof can("owner", capability as Capability)).toBe("boolean");
    }
  });
});
