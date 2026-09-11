import { describe, expect, it } from "vitest";
import { AUDIT_ACTIONS } from "../auditTypes";
import { ACCEPTABLE_USE } from "./acceptableUse";
import {
  TERMS_ACCEPTANCE_KEYS,
  TERMS_ACCEPTANCES,
  parseTermsAcceptance,
  termsAcceptAuditWrite,
  termsAcceptanceDocId,
  termsAcceptanceHasIdentityFields,
  termsAcceptancePayload,
} from "./termsAcceptance";

describe("termsAcceptanceDocId", () => {
  it("is {uid}_{documentId}_{version} so the same version is idempotent", () => {
    expect(termsAcceptanceDocId("uid-1", "acceptable-use", "1.0")).toBe(
      "uid-1_acceptable-use_1.0"
    );
    expect(termsAcceptanceDocId("uid-1", ACCEPTABLE_USE.id, ACCEPTABLE_USE.version)).toBe(
      termsAcceptanceDocId("uid-1", "acceptable-use", "1.0")
    );
    expect(termsAcceptanceDocId("uid-1", "acceptable-use", "1.1")).not.toBe(
      termsAcceptanceDocId("uid-1", "acceptable-use", "1.0")
    );
    expect(termsAcceptanceDocId("uid-2", "acceptable-use", "1.0")).not.toBe(
      termsAcceptanceDocId("uid-1", "acceptable-use", "1.0")
    );
  });
});

describe("termsAcceptancePayload", () => {
  it("writes only uid, clinic, document, version, and the two timestamps", () => {
    const payload = termsAcceptancePayload({
      uid: "uid-1",
      clinicId: "clinicA",
      recordedAt: "2026-09-08T00:00:00.000Z",
    });
    expect(Object.keys(payload).sort()).toEqual([...TERMS_ACCEPTANCE_KEYS].sort());
    expect(payload.uid).toBe("uid-1");
    expect(payload.clinicId).toBe("clinicA");
    expect(payload.documentId).toBe("acceptable-use");
    expect(payload.version).toBe("1.0");
    expect(payload.recordedAt).toBe("2026-09-08T00:00:00.000Z");
    expect(payload.acceptedAt).toEqual(expect.objectContaining({ _methodName: "serverTimestamp" }));
    expect(termsAcceptanceHasIdentityFields(payload as unknown as Record<string, unknown>)).toBe(
      false
    );
    expect(payload).not.toHaveProperty("name");
    expect(payload).not.toHaveProperty("email");
    expect(payload).not.toHaveProperty("displayName");
  });

  it("refuses to build a payload without a resolved version", () => {
    expect(() =>
      termsAcceptancePayload({
        uid: "uid-1",
        clinicId: "clinicA",
        version: "",
      })
    ).toThrow(/without a resolved version/);
  });
});

describe("parseTermsAcceptance", () => {
  it("keeps the stored shape and drops name or email if a doc ever carried them", () => {
    const parsed = parseTermsAcceptance("uid-1_acceptable-use_1.0", {
      uid: "uid-1",
      clinicId: "clinicA",
      documentId: "acceptable-use",
      version: "1.0",
      acceptedAt: "2026-09-04T12:00:00.000Z",
      recordedAt: "2026-09-04T12:00:00.000Z",
      name: "should never be stored",
      email: "tech@clinic.test",
    });
    expect(parsed).toEqual({
      id: "uid-1_acceptable-use_1.0",
      uid: "uid-1",
      clinicId: "clinicA",
      documentId: "acceptable-use",
      version: "1.0",
      acceptedAt: "2026-09-04T12:00:00.000Z",
      recordedAt: "2026-09-04T12:00:00.000Z",
    });
    expect(parsed).not.toHaveProperty("name");
    expect(parsed).not.toHaveProperty("email");
  });
});

describe("terms.accept audit", () => {
  it("targets the terms document id and version, not a person name", () => {
    expect(AUDIT_ACTIONS).toContain("terms.accept");
    const entry = termsAcceptAuditWrite({
      clinicId: "clinicA",
      actor: {
        uid: "uid-1",
        email: "tech@clinic.test",
        role: "technician",
        shift: null,
        actingAsOwner: false,
      },
    });
    expect(entry.action).toBe("terms.accept");
    expect(entry.targetCollection).toBe(TERMS_ACCEPTANCES);
    expect(entry.targetId).toBe("acceptable-use");
    expect(entry.targetLabel).toBe("acceptable-use · 1.0");
    expect(entry.detail).toEqual({ documentId: "acceptable-use", version: "1.0" });
    expect(JSON.stringify(entry.detail)).not.toContain("tech@clinic.test");
    expect(JSON.stringify(entry.targetLabel).toLowerCase()).not.toContain("name");
  });
});
