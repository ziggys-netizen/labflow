import { describe, expect, it } from "vitest";
import { preApprovalsFromApiPayload, staffApiErrorMessage } from "./staffApiParse";

describe("staffApiErrorMessage", () => {
  it("surfaces 401 instead of failing silently", () => {
    expect(staffApiErrorMessage(401)).toBe("Sign in required.");
    expect(staffApiErrorMessage(401, "Invalid or expired session.")).toBe(
      "Invalid or expired session."
    );
  });

  it("surfaces 503 OIDC / trusted-server failure instead of failing silently", () => {
    expect(staffApiErrorMessage(503)).toMatch(/Trusted server is not configured/);
    expect(staffApiErrorMessage(503, "Trusted server is not configured. See docs/OIDC-SETUP.md.")).toBe(
      "Trusted server is not configured. See docs/OIDC-SETUP.md."
    );
  });

  it("keeps other server messages", () => {
    expect(staffApiErrorMessage(400, "Enter a valid email address.")).toBe(
      "Enter a valid email address."
    );
    expect(staffApiErrorMessage(403)).toBe("Not allowed to manage staff.");
  });
});

describe("preApprovalsFromApiPayload", () => {
  it("reads rows from the trusted-server GET payload", () => {
    const rows = preApprovalsFromApiPayload({
      ok: true,
      rows: [
        {
          id: "p1",
          clinicId: "c1",
          email: "Awa@Clinic.gm",
          role: "technician",
          shift: null,
          createdAt: "2026-08-01T00:00:00.000Z",
          createdByUid: "admin",
          createdByEmail: "admin@clinic.gm",
          expiresAt: "2026-10-30T00:00:00.000Z",
          status: "pending",
          consumedByUid: null,
          consumedAt: null,
        },
      ],
    });
    expect(rows).toHaveLength(1);
    expect(rows[0].id).toBe("p1");
    expect(rows[0].email).toBe("awa@clinic.gm");
    expect(rows[0].role).toBe("technician");
  });

  it("ignores malformed payloads", () => {
    expect(preApprovalsFromApiPayload(null)).toEqual([]);
    expect(preApprovalsFromApiPayload({ rows: [{ role: "technician" }] })).toEqual([]);
  });
});
