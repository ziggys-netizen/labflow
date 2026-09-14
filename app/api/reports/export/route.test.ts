import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The email copy path of POST /api/reports/export, run for real with the
 * trusted-server edges faked: auth, Firestore, the audit writer and Resend.
 */

const hoisted = vi.hoisted(() => ({
  runTransaction: vi.fn(),
  collection: vi.fn(),
  send: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("@/app/lib/apiAuth", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/app/lib/apiAuth")>();
  return {
    ...actual,
    requireCapability: vi.fn(async () => ({
      token: { uid: "owner-uid", email: "owner@example.com" },
      identity: { shift: null },
      role: "owner",
      clinicId: null,
      email: "owner@example.com",
    })),
  };
});

vi.mock("@/app/lib/rosterServer", () => ({
  requireRosterAccess: vi.fn(async () => ({ offRoster: false })),
}));

vi.mock("@/app/lib/auditAdmin", () => ({ logAudit: hoisted.logAudit }));

vi.mock("@/app/lib/firebaseAdmin", () => {
  const query = {
    where: () => query,
    orderBy: () => query,
    limit: () => query,
    startAfter: () => query,
    get: async () => ({ empty: true, docs: [], size: 0 }),
  };
  const docRef = {
    get: async () => ({ data: () => undefined }),
    set: async () => undefined,
  };
  hoisted.collection.mockImplementation(() => ({ ...query, doc: () => docRef }));
  hoisted.runTransaction.mockImplementation(async (fn: (tx: unknown) => unknown) =>
    fn({ get: async () => ({ data: () => undefined }), set: () => undefined })
  );
  return {
    getAdminDb: () => ({ collection: hoisted.collection, runTransaction: hoisted.runTransaction }),
    isAdminCredentialError: () => false,
  };
});

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: hoisted.send };
  },
}));

import { POST } from "./route";

function exportRequest(delivery: "email" | "download") {
  return new Request("https://labflow.test/api/reports/export", {
    method: "POST",
    headers: { "content-type": "application/json", authorization: "Bearer test" },
    body: JSON.stringify({ startDate: "2026-09-01", endDate: "2026-09-07", reportType: "patients", delivery }),
  });
}

const saved = { key: process.env.RESEND_API_KEY, from: process.env.RESEND_FROM };

beforeEach(() => {
  hoisted.runTransaction.mockClear();
  hoisted.collection.mockClear();
  hoisted.send.mockReset();
  hoisted.logAudit.mockReset();
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.restoreAllMocks();
  if (saved.key === undefined) delete process.env.RESEND_API_KEY;
  else process.env.RESEND_API_KEY = saved.key;
  if (saved.from === undefined) delete process.env.RESEND_FROM;
  else process.env.RESEND_FROM = saved.from;
});

describe("email copy with mail not configured", () => {
  beforeEach(() => {
    delete process.env.RESEND_API_KEY;
    delete process.env.RESEND_FROM;
  });

  it("says so with a 500, not a 503", async () => {
    const res = await POST(exportRequest("email"));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toContain("RESEND_API_KEY");
  });

  it("uses none of the hourly quota and reads no clinical data", async () => {
    await POST(exportRequest("email"));
    expect(hoisted.runTransaction).not.toHaveBeenCalled();
    expect(hoisted.collection).not.toHaveBeenCalledWith("patients");
    expect(hoisted.send).not.toHaveBeenCalled();
  });

  it("leaves Download working", async () => {
    const res = await POST(exportRequest("download"));
    expect(res.status).toBe(200);
    expect(res.headers.get("Content-Type")).toContain("spreadsheetml");
    expect(hoisted.runTransaction).toHaveBeenCalledTimes(1);
  });
});

describe("email copy with mail configured", () => {
  beforeEach(() => {
    process.env.RESEND_API_KEY = "re_test_key";
    process.env.RESEND_FROM = "LabFlow Reports <reports@example.com>";
  });

  it("sends to the signed-in account's own address with the workbook attached", async () => {
    hoisted.send.mockResolvedValue({ data: { id: "email-1" }, error: null });
    const res = await POST(exportRequest("email"));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.recipient).toBe("owner@example.com");
    expect(hoisted.send).toHaveBeenCalledTimes(1);
    const message = hoisted.send.mock.calls[0][0];
    expect(message.to).toBe("owner@example.com");
    expect(message.from).toBe("LabFlow Reports <reports@example.com>");
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments[0].filename).toMatch(/\.xlsx$/);
    expect(Buffer.isBuffer(message.attachments[0].content)).toBe(true);
    expect(hoisted.logAudit).toHaveBeenCalledWith(
      expect.objectContaining({
        action: "report.exported",
        detail: expect.objectContaining({ delivery: "email", recipient: "owner@example.com" }),
      })
    );
  });

  it("ignores any recipient the browser tries to supply", async () => {
    hoisted.send.mockResolvedValue({ data: { id: "email-2" }, error: null });
    const req = new Request("https://labflow.test/api/reports/export", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: "Bearer test" },
      body: JSON.stringify({
        startDate: "2026-09-01",
        endDate: "2026-09-07",
        reportType: "patients",
        delivery: "email",
        recipient: "someone-else@example.com",
        to: "someone-else@example.com",
      }),
    });
    await POST(req);
    expect(hoisted.send.mock.calls[0][0].to).toBe("owner@example.com");
  });

  it("explains an unverified sending domain instead of saying try again", async () => {
    hoisted.send.mockResolvedValue({
      data: null,
      error: {
        name: "validation_error",
        statusCode: 403,
        message: "You can only send testing emails to your own email address (resend-owner@example.com).",
      },
    });
    const res = await POST(exportRequest("email"));
    expect(res.status).toBe(502);
    const { error } = await res.json();
    expect(error).toContain("verified in Resend");
    expect(error).not.toContain("resend-owner@example.com");
    expect(console.error).toHaveBeenCalled();
    expect(hoisted.logAudit).not.toHaveBeenCalled();
  });
});
