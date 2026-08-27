import { describe, expect, it } from "vitest";
import {
  PREAPPROVAL_DAYS,
  isPendingUnexpired,
  parsePreApprovalRows,
  preApprovalExpiry,
  validatePreApprovalDraft,
} from "./preApprovals";

describe("pre-approval expiry", () => {
  it("stays at 90 days and is not extended for convenience", () => {
    expect(PREAPPROVAL_DAYS).toBe(90);
    const from = new Date("2026-01-01T00:00:00.000Z");
    expect(preApprovalExpiry(from)).toBe("2026-04-01T00:00:00.000Z");
  });

  it("treats an expired pending row as no longer usable", () => {
    expect(
      isPendingUnexpired(
        {
          status: "pending",
          expiresAt: "2026-01-01T00:00:00.000Z",
        },
        Date.parse("2026-01-02T00:00:00.000Z")
      )
    ).toBe(false);
    expect(
      isPendingUnexpired(
        {
          status: "pending",
          expiresAt: "2026-04-01T00:00:00.000Z",
        },
        Date.parse("2026-01-02T00:00:00.000Z")
      )
    ).toBe(true);
  });
});

describe("validatePreApprovalDraft", () => {
  it("normalises email and rejects the owner role", () => {
    expect(
      validatePreApprovalDraft({ email: "  Awa@Clinic.gm ", role: "technician" })
    ).toEqual({ email: "awa@clinic.gm", role: "technician", shift: null });
    expect(() => validatePreApprovalDraft({ email: "awa@clinic.gm", role: "owner" })).toThrow(
      /owner role cannot be pre-approved/i
    );
  });

  it("requires a shift for Shift Supervisor", () => {
    expect(() =>
      validatePreApprovalDraft({ email: "awa@clinic.gm", role: "lab_supervisor" })
    ).toThrow(/requires a shift/i);
    expect(
      validatePreApprovalDraft({
        email: "awa@clinic.gm",
        role: "lab_supervisor",
        shift: "night",
      }).shift
    ).toBe("night");
  });
});

describe("parsePreApprovalRows", () => {
  it("reads pasted email, role, shift rows and skips a header", () => {
    expect(
      parsePreApprovalRows("email, role, shift\nawa@clinic.gm, technician\nmodou@clinic.gm, lab_supervisor, night")
    ).toEqual([
      { email: "awa@clinic.gm", role: "technician", shift: "" },
      { email: "modou@clinic.gm", role: "lab_supervisor", shift: "night" },
    ]);
  });
});
