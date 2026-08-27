import { describe, expect, it } from "vitest";
import {
  PRODUCT_RETENTION_BASIS_DEFAULT,
  PRODUCT_RETENTION_PERIOD_DEFAULT,
  RETENTION_BASIS_REQUIRED,
  RETENTION_CLINIC_MUST_SET,
  RETENTION_CONTROLLER_PROCESSOR,
  RETENTION_ENFORCEMENT_LATER,
  RETENTION_NO_GAMBIAN_RULE,
  RETENTION_NOT_SET_LABEL,
  RETENTION_PERIOD_REQUIRED,
  RETENTION_PURGE_ENFORCEMENT,
  RETENTION_SETUP_INCOMPLETE,
  clinicRetentionIsRecorded,
  clinicRetentionValidationError,
  clinicRetentionWriteFields,
  clinicSetupComplete,
  parseRetentionFromData,
  retentionDisplay,
} from "./clinicRetention";

describe("product default", () => {
  it("ships no retention period or basis", () => {
    expect(PRODUCT_RETENTION_PERIOD_DEFAULT).toBeNull();
    expect(PRODUCT_RETENTION_BASIS_DEFAULT).toBeNull();
  });

  it("does not treat a missing clinic document as a chosen period", () => {
    const parsed = parseRetentionFromData({ name: "Harbor Lab" });
    expect(parsed).toEqual({ retentionPeriod: "", retentionBasis: "" });
    expect(clinicRetentionIsRecorded(parsed)).toBe(false);
    expect(clinicSetupComplete(parsed)).toBe(false);
    expect(retentionDisplay(parsed.retentionPeriod)).toBe(RETENTION_NOT_SET_LABEL);
    expect(retentionDisplay(parsed.retentionBasis)).toBe(RETENTION_NOT_SET_LABEL);
  });

  it("does not coerce a numeric field into a period", () => {
    const parsed = parseRetentionFromData({
      retentionPeriod: 10,
      retentionBasis: 5,
    });
    expect(parsed.retentionPeriod).toBe("");
    expect(parsed.retentionBasis).toBe("");
    expect(clinicRetentionIsRecorded(parsed)).toBe(false);
  });

  it("does not apply MRCG research windows as a clinical default", () => {
    const blob = [
      PRODUCT_RETENTION_PERIOD_DEFAULT,
      PRODUCT_RETENTION_BASIS_DEFAULT,
      RETENTION_NO_GAMBIAN_RULE,
      RETENTION_CLINIC_MUST_SET,
      RETENTION_CONTROLLER_PROCESSOR,
      RETENTION_ENFORCEMENT_LATER,
      RETENTION_SETUP_INCOMPLETE,
    ]
      .join(" ")
      .toLowerCase();
    expect(blob).not.toMatch(/mrcg/);
    expect(blob).not.toMatch(/\b1\s*year/);
    expect(blob).not.toMatch(/\b2\s*years/);
    expect(blob).not.toMatch(/\b5\s*years/);
  });
});

describe("setup validation", () => {
  it("requires both period and basis", () => {
    expect(clinicRetentionValidationError("", "")).toBe(RETENTION_PERIOD_REQUIRED);
    expect(clinicRetentionValidationError("   ", "clinic policy")).toBe(RETENTION_PERIOD_REQUIRED);
    expect(clinicRetentionValidationError("duration of clinical need", "")).toBe(
      RETENTION_BASIS_REQUIRED
    );
    expect(clinicRetentionValidationError("duration of clinical need", "   ")).toBe(
      RETENTION_BASIS_REQUIRED
    );
    expect(
      clinicRetentionValidationError(
        "duration of clinical need",
        "No Gambian statute names a period; this clinic recorded its own policy."
      )
    ).toBeNull();
  });

  it("records a clinic-written period and basis without filling a default", () => {
    const fields = clinicRetentionWriteFields(
      "  duration of clinical need  ",
      "  Responsible person recorded this clinic policy.  "
    );
    expect(fields).toEqual({
      retentionPeriod: "duration of clinical need",
      retentionBasis: "Responsible person recorded this clinic policy.",
    });
    expect(clinicRetentionIsRecorded(fields)).toBe(true);
    expect(clinicSetupComplete(fields)).toBe(true);
  });

  it("rejects a write that would silently store empty fields", () => {
    expect(() => clinicRetentionWriteFields("", "basis")).toThrow(RETENTION_PERIOD_REQUIRED);
    expect(() => clinicRetentionWriteFields("period", "")).toThrow(RETENTION_BASIS_REQUIRED);
  });

  it("treats only one of the two fields as incomplete setup", () => {
    expect(
      clinicSetupComplete({
        retentionPeriod: "duration of clinical need",
        retentionBasis: "",
      })
    ).toBe(false);
    expect(
      clinicSetupComplete({
        retentionPeriod: "",
        retentionBasis: "clinic policy",
      })
    ).toBe(false);
  });
});

describe("copy", () => {
  it("states that no Gambian rule prescribes a period and the clinic must set its own", () => {
    expect(RETENTION_NO_GAMBIAN_RULE).toMatch(/no gambian rule/i);
    expect(RETENTION_NO_GAMBIAN_RULE).toMatch(/does not set one/i);
    expect(RETENTION_CLINIC_MUST_SET).toMatch(/must set its own period/i);
    expect(RETENTION_CLINIC_MUST_SET).toMatch(/basis/i);
  });

  it("names the clinic as controller and LabFlow as processor", () => {
    expect(RETENTION_CONTROLLER_PROCESSOR).toMatch(/clinic is the data controller/i);
    expect(RETENTION_CONTROLLER_PROCESSOR).toMatch(/labflow is a processor/i);
    expect(RETENTION_CONTROLLER_PROCESSOR).toMatch(/does not choose a number/i);
  });

  it("grandfathers missing values as Not set and records that purge is later", () => {
    expect(RETENTION_NOT_SET_LABEL).toBe("Not set");
    expect(RETENTION_SETUP_INCOMPLETE).toMatch(/not set/i);
    expect(RETENTION_SETUP_INCOMPLETE).toMatch(/will not fill a number/i);
    expect(RETENTION_PURGE_ENFORCEMENT).toBe("later");
    expect(RETENTION_ENFORCEMENT_LATER).toMatch(/not built yet/i);
  });
});

describe("parseRetentionFromData", () => {
  it("reads a clinic-recorded pair and trims whitespace", () => {
    expect(
      parseRetentionFromData({
        retentionPeriod: "  duration of clinical need ",
        retentionBasis: " clinic policy ",
      })
    ).toEqual({
      retentionPeriod: "duration of clinical need",
      retentionBasis: "clinic policy",
    });
  });
});
