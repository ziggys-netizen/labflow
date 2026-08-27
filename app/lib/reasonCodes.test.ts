import { describe, expect, it } from "vitest";
import {
  AMENDMENT_CODES,
  BREAK_GLASS_CODES,
  SAMPLE_REJECTION_CODES,
  SELF_RELEASE_CODES,
  formatJustification,
  justificationError,
  justificationReady,
} from "./reasonCodes";

describe("justificationReady", () => {
  it("requires a listed code and free text only for Other", () => {
    expect(justificationReady(SAMPLE_REJECTION_CODES, "haemolysed", "")).toBe(true);
    expect(justificationReady(SAMPLE_REJECTION_CODES, "other", "")).toBe(false);
    expect(justificationReady(SAMPLE_REJECTION_CODES, "other", "dropped")).toBe(true);
    expect(justificationReady(SAMPLE_REJECTION_CODES, "made_up", "")).toBe(false);
  });
});

describe("justificationError", () => {
  it("names the missing code or the Other note", () => {
    expect(justificationError(AMENDMENT_CODES, "", "")).toBe("Choose a reason.");
    expect(justificationError(SELF_RELEASE_CODES, "other", "  ")).toBe(
      "Describe the reason when you choose Other."
    );
    expect(justificationError(SELF_RELEASE_CODES, "sole_approver_on_duty", "")).toBeNull();
  });
});

describe("break-glass codes", () => {
  it("includes roster incorrect so a wrong roster is visible as a staffing signal", () => {
    expect(BREAK_GLASS_CODES.map((item) => item.code)).toEqual([
      "covering_absent_colleague",
      "urgent_sample",
      "overrunning_shift",
      "called_in",
      "roster_incorrect",
      "other",
    ]);
    expect(justificationReady(BREAK_GLASS_CODES, "roster_incorrect", "")).toBe(true);
    expect(justificationReady(BREAK_GLASS_CODES, "other", "")).toBe(false);
  });
});

describe("formatJustification", () => {
  it("keeps the code label and optional note, never a patient name requirement", () => {
    expect(formatJustification(SAMPLE_REJECTION_CODES, "clotted", "")).toBe("Clotted");
    expect(formatJustification(SAMPLE_REJECTION_CODES, "other", "tube cracked")).toBe(
      "Other — tube cracked"
    );
  });
});
