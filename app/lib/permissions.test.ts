import { describe, expect, it } from "vitest";
import * as permissions from "./permissions";
import {
  ASSIGNABLE_ROLES,
  CAPABILITY_CHECKS,
  ROLES,
  canApproveResults,
  canDeletePatient,
  canEditTestCatalogue,
  canEnterResults,
  canExportData,
  canImportData,
  canManageInventoryItems,
  canOrderTests,
  canRecordSampleCollection,
  canRegisterPatient,
  internAllowedPath,
  accountsAllowedPath,
  landingPathForRole,
  type Role,
} from "./permissions";

const CHECKS = {
  canRegisterPatient: permissions.canRegisterPatient,
  canViewPatients: permissions.canViewPatients,
  canViewOwnRegisteredPatients: permissions.canViewOwnRegisteredPatients,
  canOrderTests: permissions.canOrderTests,
  canRecordSampleCollection: permissions.canRecordSampleCollection,
  canEnterResults: permissions.canEnterResults,
  canApproveResults: permissions.canApproveResults,
  canAmendResult: permissions.canAmendResult,
  canSendBackForCorrection: permissions.canSendBackForCorrection,
  canRejectSample: permissions.canRejectSample,
  canCancelOrder: permissions.canCancelOrder,
  canModifyOthersUnreleasedResult: permissions.canModifyOthersUnreleasedResult,
  canCorrectPatientRecord: permissions.canCorrectPatientRecord,
  canRecordCriticalNotification: permissions.canRecordCriticalNotification,
  canEditTestCatalogue: permissions.canEditTestCatalogue,
  canViewDashboard: permissions.canViewDashboard,
  canViewTestValueRollup: permissions.canViewTestValueRollup,
  canExportData: permissions.canExportData,
  canManageStaff: permissions.canManageStaff,
  canViewJoinCode: permissions.canViewJoinCode,
  canEditClinicProfile: permissions.canEditClinicProfile,
  canImportData: permissions.canImportData,
  canImportStaffPreApprovals: permissions.canImportStaffPreApprovals,
  canDeletePatient: permissions.canDeletePatient,
  canExecuteErasure: permissions.canExecuteErasure,
  canViewInventory: permissions.canViewInventory,
  canRecordStockMovement: permissions.canRecordStockMovement,
  canManageInventoryItems: permissions.canManageInventoryItems,
  canRecordSpecimenMovement: permissions.canRecordSpecimenMovement,
} as const;

type Capability = keyof typeof CHECKS;

/**
 * Product matrix. Written out in full — do not import expected flags from
 * permissions.ts. Flipping one cell in the implementation must fail this file.
 */
const EXPECTED: Record<Role, Record<Capability, boolean>> = {
  owner: {
    canRegisterPatient: true,
    canViewPatients: true,
    canViewOwnRegisteredPatients: true,
    canOrderTests: true,
    canRecordSampleCollection: true,
    canEnterResults: true,
    canApproveResults: true,
    canAmendResult: true,
    canSendBackForCorrection: true,
    canRejectSample: true,
    canCancelOrder: true,
    canModifyOthersUnreleasedResult: true,
    canCorrectPatientRecord: true,
    canRecordCriticalNotification: true,
    canEditTestCatalogue: true,
    canViewDashboard: true,
    canViewTestValueRollup: true,
    canExportData: true,
    canManageStaff: true,
    canViewJoinCode: true,
    canEditClinicProfile: true,
    canImportData: true,
    canImportStaffPreApprovals: true,
    canDeletePatient: true,
    canExecuteErasure: true,
    canViewInventory: true,
    canRecordStockMovement: true,
    canManageInventoryItems: true,
    canRecordSpecimenMovement: true,
  },
  clinic_admin: {
    canRegisterPatient: false,
    canViewPatients: true,
    canViewOwnRegisteredPatients: true,
    canOrderTests: false,
    canRecordSampleCollection: false,
    canEnterResults: false,
    canApproveResults: false,
    canAmendResult: false,
    canSendBackForCorrection: false,
    canRejectSample: false,
    canCancelOrder: false,
    canModifyOthersUnreleasedResult: false,
    canCorrectPatientRecord: false,
    canRecordCriticalNotification: false,
    canEditTestCatalogue: false,
    canViewDashboard: true,
    canViewTestValueRollup: true,
    canExportData: true,
    canManageStaff: true,
    canViewJoinCode: true,
    canEditClinicProfile: true,
    canImportData: false,
    canImportStaffPreApprovals: true,
    canDeletePatient: true,
    canExecuteErasure: false,
    canViewInventory: true,
    canRecordStockMovement: false,
    canManageInventoryItems: false,
    canRecordSpecimenMovement: false,
  },
  lab_manager: {
    canRegisterPatient: true,
    canViewPatients: true,
    canViewOwnRegisteredPatients: true,
    canOrderTests: true,
    canRecordSampleCollection: true,
    canEnterResults: true,
    canApproveResults: true,
    canAmendResult: true,
    canSendBackForCorrection: true,
    canRejectSample: true,
    canCancelOrder: true,
    canModifyOthersUnreleasedResult: true,
    canCorrectPatientRecord: true,
    canRecordCriticalNotification: true,
    canEditTestCatalogue: true,
    canViewDashboard: true,
    canViewTestValueRollup: false,
    canExportData: true,
    canManageStaff: false,
    canViewJoinCode: false,
    canEditClinicProfile: false,
    canImportData: true,
    canImportStaffPreApprovals: false,
    canDeletePatient: true,
    canExecuteErasure: false,
    canViewInventory: true,
    canRecordStockMovement: true,
    canManageInventoryItems: true,
    canRecordSpecimenMovement: true,
  },
  lab_supervisor: {
    canRegisterPatient: true,
    canViewPatients: true,
    canViewOwnRegisteredPatients: true,
    canOrderTests: true,
    canRecordSampleCollection: true,
    canEnterResults: true,
    canApproveResults: true,
    canAmendResult: true,
    canSendBackForCorrection: true,
    canRejectSample: true,
    canCancelOrder: true,
    canModifyOthersUnreleasedResult: true,
    canCorrectPatientRecord: true,
    canRecordCriticalNotification: true,
    canEditTestCatalogue: true,
    canViewDashboard: true,
    canViewTestValueRollup: false,
    canExportData: false,
    canManageStaff: false,
    canViewJoinCode: false,
    canEditClinicProfile: false,
    canImportData: false,
    canImportStaffPreApprovals: false,
    canDeletePatient: false,
    canExecuteErasure: false,
    canViewInventory: true,
    canRecordStockMovement: true,
    canManageInventoryItems: false,
    canRecordSpecimenMovement: true,
  },
  technician: {
    canRegisterPatient: true,
    canViewPatients: true,
    canViewOwnRegisteredPatients: true,
    canOrderTests: true,
    canRecordSampleCollection: true,
    canEnterResults: true,
    canApproveResults: false,
    canAmendResult: false,
    canSendBackForCorrection: false,
    canRejectSample: true,
    canCancelOrder: true,
    canModifyOthersUnreleasedResult: false,
    canCorrectPatientRecord: false,
    canRecordCriticalNotification: true,
    canEditTestCatalogue: false,
    canViewDashboard: false,
    canViewTestValueRollup: false,
    canExportData: false,
    canManageStaff: false,
    canViewJoinCode: false,
    canEditClinicProfile: false,
    canImportData: false,
    canImportStaffPreApprovals: false,
    canDeletePatient: false,
    canExecuteErasure: false,
    canViewInventory: true,
    canRecordStockMovement: false,
    canManageInventoryItems: false,
    canRecordSpecimenMovement: true,
  },
  technician_assistant: {
    canRegisterPatient: true,
    canViewPatients: true,
    canViewOwnRegisteredPatients: true,
    canOrderTests: false,
    canRecordSampleCollection: true,
    canEnterResults: false,
    canApproveResults: false,
    canAmendResult: false,
    canSendBackForCorrection: false,
    canRejectSample: true,
    canCancelOrder: false,
    canModifyOthersUnreleasedResult: false,
    canCorrectPatientRecord: false,
    canRecordCriticalNotification: false,
    canEditTestCatalogue: false,
    canViewDashboard: false,
    canViewTestValueRollup: false,
    canExportData: false,
    canManageStaff: false,
    canViewJoinCode: false,
    canEditClinicProfile: false,
    canImportData: false,
    canImportStaffPreApprovals: false,
    canDeletePatient: false,
    canExecuteErasure: false,
    canViewInventory: true,
    canRecordStockMovement: false,
    canManageInventoryItems: false,
    canRecordSpecimenMovement: true,
  },
  intern: {
    canRegisterPatient: true,
    canViewPatients: false,
    canViewOwnRegisteredPatients: true,
    canOrderTests: false,
    canRecordSampleCollection: false,
    canEnterResults: false,
    canApproveResults: false,
    canAmendResult: false,
    canSendBackForCorrection: false,
    canRejectSample: false,
    canCancelOrder: false,
    canModifyOthersUnreleasedResult: false,
    canCorrectPatientRecord: false,
    canRecordCriticalNotification: false,
    canEditTestCatalogue: false,
    canViewDashboard: false,
    canViewTestValueRollup: false,
    canExportData: false,
    canManageStaff: false,
    canViewJoinCode: false,
    canEditClinicProfile: false,
    canImportData: false,
    canImportStaffPreApprovals: false,
    canDeletePatient: false,
    canExecuteErasure: false,
    canViewInventory: false,
    canRecordStockMovement: false,
    canManageInventoryItems: false,
    canRecordSpecimenMovement: false,
  },
  storekeeper: {
    canRegisterPatient: false,
    canViewPatients: false,
    canViewOwnRegisteredPatients: false,
    canOrderTests: false,
    canRecordSampleCollection: false,
    canEnterResults: false,
    canApproveResults: false,
    canAmendResult: false,
    canSendBackForCorrection: false,
    canRejectSample: false,
    canCancelOrder: false,
    canModifyOthersUnreleasedResult: false,
    canCorrectPatientRecord: false,
    canRecordCriticalNotification: false,
    canEditTestCatalogue: false,
    canViewDashboard: false,
    canViewTestValueRollup: false,
    canExportData: false,
    canManageStaff: false,
    canViewJoinCode: false,
    canEditClinicProfile: false,
    canImportData: false,
    canImportStaffPreApprovals: false,
    canDeletePatient: false,
    canExecuteErasure: false,
    canViewInventory: true,
    canRecordStockMovement: true,
    canManageInventoryItems: true,
    canRecordSpecimenMovement: true,
  },
  accounts: {
    canRegisterPatient: false,
    canViewPatients: false,
    canViewOwnRegisteredPatients: false,
    canOrderTests: false,
    canRecordSampleCollection: false,
    canEnterResults: false,
    canApproveResults: false,
    canAmendResult: false,
    canSendBackForCorrection: false,
    canRejectSample: false,
    canCancelOrder: false,
    canModifyOthersUnreleasedResult: false,
    canCorrectPatientRecord: false,
    canRecordCriticalNotification: false,
    canEditTestCatalogue: false,
    canViewDashboard: false,
    canViewTestValueRollup: true,
    canExportData: false,
    canManageStaff: false,
    canViewJoinCode: false,
    canEditClinicProfile: false,
    canImportData: false,
    canImportStaffPreApprovals: false,
    canDeletePatient: false,
    canExecuteErasure: false,
    canViewInventory: false,
    canRecordStockMovement: false,
    canManageInventoryItems: false,
    canRecordSpecimenMovement: false,
  },
  pending: {
    canRegisterPatient: false,
    canViewPatients: false,
    canViewOwnRegisteredPatients: false,
    canOrderTests: false,
    canRecordSampleCollection: false,
    canEnterResults: false,
    canApproveResults: false,
    canAmendResult: false,
    canSendBackForCorrection: false,
    canRejectSample: false,
    canCancelOrder: false,
    canModifyOthersUnreleasedResult: false,
    canCorrectPatientRecord: false,
    canRecordCriticalNotification: false,
    canEditTestCatalogue: false,
    canViewDashboard: false,
    canViewTestValueRollup: false,
    canExportData: false,
    canManageStaff: false,
    canViewJoinCode: false,
    canEditClinicProfile: false,
    canImportData: false,
    canImportStaffPreApprovals: false,
    canDeletePatient: false,
    canExecuteErasure: false,
    canViewInventory: false,
    canRecordStockMovement: false,
    canManageInventoryItems: false,
    canRecordSpecimenMovement: false,
  },
};

const CLINICAL_CAPABILITIES = [
  "canRegisterPatient",
  "canOrderTests",
  "canRecordSampleCollection",
  "canEnterResults",
  "canApproveResults",
  "canEditTestCatalogue",
  "canImportData",
] as const satisfies readonly Capability[];

const SUPERVISOR_DIFFERS_FROM_MANAGER: Capability[] = [
  "canExportData",
  "canImportData",
  "canDeletePatient",
  "canManageInventoryItems",
];

describe("capability matrix", () => {
  it("ROLES keys match the product matrix and the implementation registry", () => {
    expect(Object.keys(EXPECTED).sort()).toEqual([...ROLES].sort());
    expect(Object.keys(EXPECTED.owner).sort()).toEqual(Object.keys(CAPABILITY_CHECKS).sort());
    expect(Object.keys(CHECKS).sort()).toEqual(Object.keys(CAPABILITY_CHECKS).sort());
  });

  it.each(ROLES)("%s matches every written capability cell", (role) => {
    const expected = EXPECTED[role];
    const actual = Object.fromEntries(
      Object.entries(CHECKS).map(([name, check]) => [name, check(role)])
    );
    expect(actual).toEqual(expected);
  });

  it("legacy admin is not a role and has no capabilities", () => {
    for (const check of Object.values(CHECKS)) {
      expect(check("admin")).toBe(false);
    }
  });

  it("null and empty roles have no capabilities", () => {
    for (const check of Object.values(CHECKS)) {
      expect(check(null)).toBe(false);
      expect(check("")).toBe(false);
    }
  });
});

describe("product rules", () => {
  it("clinic_admin is false for every clinical capability", () => {
    for (const name of CLINICAL_CAPABILITIES) {
      expect(CHECKS[name]("clinic_admin"), name).toBe(false);
    }
  });

  it("lab_supervisor matches lab_manager except export, import, delete, and item master", () => {
    for (const name of Object.keys(CHECKS) as Capability[]) {
      if (SUPERVISOR_DIFFERS_FROM_MANAGER.includes(name)) {
        expect(CHECKS[name]("lab_supervisor"), name).not.toBe(CHECKS[name]("lab_manager"));
        continue;
      }
      expect(CHECKS[name]("lab_supervisor"), name).toBe(CHECKS[name]("lab_manager"));
    }
  });

  it("intern can register and see their own patients only", () => {
    for (const [name, check] of Object.entries(CHECKS)) {
      const allowed = name === "canRegisterPatient" || name === "canViewOwnRegisteredPatients";
      expect(check("intern"), name).toBe(allowed);
    }
  });

  it("technician_assistant cannot order tests or enter results (Q1)", () => {
    expect(canRegisterPatient("technician_assistant")).toBe(true);
    expect(permissions.canViewPatients("technician_assistant")).toBe(true);
    expect(canRecordSampleCollection("technician_assistant")).toBe(true);
    expect(permissions.canRecordSpecimenMovement("technician_assistant")).toBe(true);
    expect(permissions.canViewInventory("technician_assistant")).toBe(true);
    expect(permissions.canRejectSample("technician_assistant")).toBe(true);
    expect(canOrderTests("technician_assistant")).toBe(false);
    expect(canEnterResults("technician_assistant")).toBe(false);
    expect(canApproveResults("technician_assistant")).toBe(false);
    expect(permissions.canSendBackForCorrection("technician_assistant")).toBe(false);
    expect(canEditTestCatalogue("technician_assistant")).toBe(false);
    expect(permissions.canViewDashboard("technician_assistant")).toBe(false);
    expect(canExportData("technician_assistant")).toBe(false);
    expect(permissions.canManageStaff("technician_assistant")).toBe(false);
    expect(canDeletePatient("technician_assistant")).toBe(false);
    expect(permissions.canRecordStockMovement("technician_assistant")).toBe(false);
    expect(canManageInventoryItems("technician_assistant")).toBe(false);
  });

  it("owner is true for every unary capability", () => {
    for (const [name, check] of Object.entries(CHECKS)) {
      expect(check("owner"), name).toBe(true);
    }
  });

  it("only owner, lab_manager, and lab_supervisor can approve", () => {
    const allowed = new Set(["owner", "lab_manager", "lab_supervisor"]);
    for (const role of ROLES) {
      expect(canApproveResults(role)).toBe(allowed.has(role));
    }
  });

  it("clinic_admin cannot import patient data; lab_manager can", () => {
    expect(canImportData("clinic_admin")).toBe(false);
    expect(canImportData("lab_manager")).toBe(true);
    expect(permissions.canImportStaffPreApprovals("clinic_admin")).toBe(true);
  });

  it("erasure is owner-only", () => {
    expect(permissions.canExecuteErasure("owner")).toBe(true);
    expect(permissions.canExecuteErasure("clinic_admin")).toBe(false);
    expect(permissions.canExecuteErasure("lab_manager")).toBe(false);
  });

  it("ASSIGNABLE_ROLES never contains owner", () => {
    expect(ASSIGNABLE_ROLES).not.toContain("owner");
  });

  it("accounts sees the rollup only — never patients, orders, or results", () => {
    for (const [name, check] of Object.entries(CHECKS)) {
      expect(check("accounts"), name).toBe(name === "canViewTestValueRollup");
    }
    expect(permissions.canViewPatients("accounts")).toBe(false);
    expect(permissions.canOrderTests("accounts")).toBe(false);
    expect(permissions.canEnterResults("accounts")).toBe(false);
    expect(permissions.canApproveResults("accounts")).toBe(false);
    expect(permissions.canViewInventory("accounts")).toBe(false);
  });
});

describe("landingPathForRole", () => {
  it("routes each role to its product landing", () => {
    expect(landingPathForRole("owner")).toBe("/owner");
    expect(landingPathForRole("clinic_admin")).toBe("/patients");
    expect(landingPathForRole("clinic_admin", "c1")).toBe("/owner/clinics/c1/staff");
    expect(landingPathForRole("lab_manager")).toBe("/dashboard");
    expect(landingPathForRole("lab_supervisor")).toBe("/dashboard");
    expect(landingPathForRole("technician")).toBe("/patients");
    expect(landingPathForRole("technician_assistant")).toBe("/patients");
    expect(landingPathForRole("intern")).toBe("/register");
    expect(landingPathForRole("storekeeper")).toBe("/inventory");
    expect(landingPathForRole("accounts")).toBe("/accounts");
    expect(landingPathForRole("pending")).toBe("/patients");
    expect(landingPathForRole(null)).toBe("/patients");
  });

  it("intern may open register, profile, their patients, and a print page", () => {
    expect(internAllowedPath("/register")).toBe(true);
    expect(internAllowedPath("/profile")).toBe(true);
    expect(internAllowedPath("/patients")).toBe(true);
    expect(internAllowedPath("/patients/abc/print")).toBe(true);
    expect(internAllowedPath("/orders")).toBe(false);
    expect(internAllowedPath("/review")).toBe(false);
    expect(internAllowedPath("/owner/clinics/c1/audit")).toBe(false);
  });

  it("accounts may open the rollup and profile only", () => {
    expect(accountsAllowedPath("/accounts")).toBe(true);
    expect(accountsAllowedPath("/profile")).toBe(true);
    expect(accountsAllowedPath("/patients")).toBe(false);
    expect(accountsAllowedPath("/orders")).toBe(false);
    expect(accountsAllowedPath("/dashboard")).toBe(false);
  });
});
