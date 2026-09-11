import { describe, expect, it } from "vitest";
import { ACCEPTABLE_USE } from "./acceptableUse";
import type { TermsAcceptanceRecord } from "./termsAcceptance";
import {
  OWNER_EXEMPT_FROM_STAFF_TERMS,
  TERMS_DECLINE_MESSAGE,
  TERMS_PATH,
  acceptedVersionForUid,
  canSubmitTermsAcceptance,
  decideTermsTimeout,
  formatTermsEffectiveDate,
  formatTermsUpdateNotice,
  isOwnerExemptFromStaffTerms,
  newestAcceptedVersion,
  requireResolvedTermsVersion,
  staffHasCurrentTerms,
  staffTermsIndicator,
  staffTermsIndicatorLabel,
  termsGateSatisfied,
  termsRecordedCaption,
} from "./termsGate";

function row(uid: string, version: string): TermsAcceptanceRecord {
  return {
    id: `${uid}_acceptable-use_${version}`,
    uid,
    clinicId: "c1",
    documentId: "acceptable-use",
    version,
    acceptedAt: "2026-09-04T12:00:00.000Z",
    recordedAt: "2026-09-04T12:00:00.000Z",
  };
}

describe("owner exemption from staff terms", () => {
  it("is an explicit decision, not an omitted check", () => {
    expect(OWNER_EXEMPT_FROM_STAFF_TERMS).toBe(true);
    expect(isOwnerExemptFromStaffTerms("owner")).toBe(true);
    expect(isOwnerExemptFromStaffTerms("clinic_admin")).toBe(false);
    expect(isOwnerExemptFromStaffTerms(null)).toBe(false);
  });
});

describe("staffHasCurrentTerms", () => {
  it("treats missing or older versions as not current", () => {
    expect(staffHasCurrentTerms(null)).toBe(false);
    expect(staffHasCurrentTerms(undefined)).toBe(false);
    expect(staffHasCurrentTerms("0.9")).toBe(false);
    expect(staffHasCurrentTerms(ACCEPTABLE_USE.version)).toBe(true);
    expect(staffHasCurrentTerms("1.1", "1.0")).toBe(true);
  });
});

describe("terms timeout decision", () => {
  it("cached acceptance + timeout proceeds under that version", () => {
    expect(decideTermsTimeout("0.9")).toEqual({
      outcome: "proceed",
      cachedVersion: "0.9",
    });
    expect(decideTermsTimeout(ACCEPTABLE_USE.version)).toEqual({
      outcome: "proceed",
      cachedVersion: ACCEPTABLE_USE.version,
    });
    expect(
      termsGateSatisfied({
        acceptedVersion: "0.9",
        timeoutGrace: true,
      })
    ).toBe(true);
  });

  it("no cached acceptance + timeout is unreachable (not the terms form)", () => {
    expect(decideTermsTimeout(null)).toEqual({ outcome: "unreachable" });
    expect(decideTermsTimeout(undefined)).toEqual({ outcome: "unreachable" });
    expect(decideTermsTimeout("")).toEqual({ outcome: "unreachable" });
    expect(decideTermsTimeout("   ")).toEqual({ outcome: "unreachable" });
    expect(
      termsGateSatisfied({
        acceptedVersion: null,
        timeoutGrace: true,
      })
    ).toBe(false);
  });

  it("null version never yields a submittable form", () => {
    expect(canSubmitTermsAcceptance(null)).toBe(false);
    expect(canSubmitTermsAcceptance(undefined)).toBe(false);
    expect(canSubmitTermsAcceptance("")).toBe(false);
    expect(canSubmitTermsAcceptance("   ")).toBe(false);
    expect(canSubmitTermsAcceptance(ACCEPTABLE_USE.version)).toBe(true);
    expect(() => requireResolvedTermsVersion(null)).toThrow(
      /without a resolved version/
    );
    expect(() => requireResolvedTermsVersion("")).toThrow(/without a resolved version/);
    expect(requireResolvedTermsVersion(" 1.0 ")).toBe("1.0");
  });
});

describe("formatTermsUpdateNotice", () => {
  it("uses effectiveFrom and whatChanged from the document", () => {
    expect(formatTermsEffectiveDate("2026-09-04")).toBe("4 September 2026");
    expect(formatTermsUpdateNotice()).toBe(
      `These terms were updated on 4 September 2026. What changed: ${ACCEPTABLE_USE.whatChanged}`
    );
  });
});

describe("decline copy", () => {
  it("explains they cannot use LabFlow without accepting", () => {
    expect(TERMS_DECLINE_MESSAGE).toBe(
      "You cannot use LabFlow without accepting these terms. Speak to your clinic administrator if you have questions."
    );
    expect(TERMS_PATH).toBe("/terms");
  });
});

describe("termsRecordedCaption", () => {
  it("takes the version from the document constant", () => {
    expect(termsRecordedCaption()).toBe(
      `TERMS v${ACCEPTABLE_USE.version} · RECORDED WITH YOUR ACCOUNT AND THE TIME`
    );
  });
});

describe("newestAcceptedVersion", () => {
  it("picks the highest version for a uid", () => {
    const records = [row("u1", "1.0"), row("u1", "0.9"), row("u2", "2.0")];
    expect(newestAcceptedVersion(records)).toBe("2.0");
    expect(acceptedVersionForUid(records, "u1")).toBe("1.0");
    expect(acceptedVersionForUid(records, "u2")).toBe("2.0");
    expect(acceptedVersionForUid(records, "missing")).toBeNull();
  });
});

describe("staffTermsIndicator", () => {
  it("marks approved staff who lack the current version", () => {
    expect(
      staffTermsIndicatorLabel(
        staffTermsIndicator({
          uid: "u1",
          state: "approved",
          acceptedVersion: null,
        })
      )
    ).toBe("Not accepted");
    expect(
      staffTermsIndicatorLabel(
        staffTermsIndicator({
          uid: "u1",
          state: "approved",
          acceptedVersion: ACCEPTABLE_USE.version,
        })
      )
    ).toBe("Accepted");
    expect(
      staffTermsIndicator({
        uid: "owner-1",
        state: "approved",
        isOwnerAccount: true,
        acceptedVersion: null,
      })
    ).toBe("not_required");
    expect(
      staffTermsIndicator({
        uid: null,
        state: "pre-approved",
        acceptedVersion: null,
      })
    ).toBe("unavailable");
  });
});
