import { describe, expect, it } from "vitest";
import {
  AUDIT_ACTIONS,
  AUDIT_CSV_COLUMNS,
  actorFromAuth,
  auditLogPayload,
  auditLogsToCsv,
  auditTargetLabel,
  csvCell,
  filterAuditLogs,
  parseAuditLog,
  type AuditLogRecord,
} from "./auditTypes";

function sampleRecord(overrides: Partial<AuditLogRecord> = {}): AuditLogRecord {
  return {
    id: "a1",
    clinicId: "clinicA",
    actorUid: "uid-1",
    actorEmail: "a@lab.test",
    actorRole: "technician",
    actorShift: null,
    actingAsOwner: false,
    action: "patient.register",
    targetCollection: "patients",
    targetId: "p1",
    targetLabel: "Ada Lovelace — LF-20260821-0001",
    at: "2026-08-21T12:00:00.000Z",
    detail: { fields: ["name", "labId"] },
    ...overrides,
  };
}

describe("audit log shape", () => {
  it("writes the Q7 fields and omits detail when none is passed", () => {
    const payload = auditLogPayload({
      clinicId: "clinicA",
      actor: {
        uid: "uid-1",
        email: "a@lab.test",
        role: "lab_supervisor",
        shift: "night",
        actingAsOwner: false,
      },
      action: "order.approved",
      targetCollection: "orders",
      targetId: "o1",
      targetLabel: "Ada Lovelace — LF-1",
    });
    expect(payload.clinicId).toBe("clinicA");
    expect(payload.actorUid).toBe("uid-1");
    expect(payload.actorEmail).toBe("a@lab.test");
    expect(payload.actorRole).toBe("lab_supervisor");
    expect(payload.actorShift).toBe("night");
    expect(payload.actingAsOwner).toBe(false);
    expect(payload.action).toBe("order.approved");
    expect(payload.targetCollection).toBe("orders");
    expect(payload.targetId).toBe("o1");
    expect(payload.targetLabel).toBe("Ada Lovelace — LF-1");
    expect(typeof payload.at).toBe("string");
    expect("detail" in payload).toBe(false);
    expect("joinCode" in payload).toBe(false);
  });

  it("stamps owner actingAsOwner from role", () => {
    const actor = actorFromAuth({ uid: "own", email: "o@lab.test" }, "owner", null);
    expect(actor?.actingAsOwner).toBe(true);
    expect(actor?.shift).toBe(null);
  });

  it("labels patients as name + Lab ID, never a full record", () => {
    expect(auditTargetLabel("Ada Lovelace", "LF-1")).toBe("Ada Lovelace — LF-1");
    expect(auditTargetLabel("Ada", null)).toBe("Ada");
  });
});

describe("audit action vocabulary", () => {
  it("includes required Q7 actions and already-wired S2/S3 names", () => {
    const required = [
      "patient.register",
      "patient.softDelete",
      "patient.restore",
      "order.create",
      "order.sampleCollected",
      "order.resultsEntered",
      "order.approved",
      "order.sentBack",
      "catalogue.update",
      "staff.approve",
      "staff.reject",
      "staff.roleChange",
      "clinic.create",
      "clinic.update",
      "joinCode.regenerate",
      "import.run",
      "legacyRecords.claim",
      "dataQuality.clearCollectionTime",
      "catalogue.seeded",
      "catalogue.reviewed",
      "preApproval.create",
      "order.amended",
      "report.exported",
      "joinCode.failedAttempt",
    ];
    for (const action of required) {
      expect(AUDIT_ACTIONS).toContain(action);
    }
  });
});

describe("audit CSV", () => {
  it("uses the stored-shape columns", () => {
    expect([...AUDIT_CSV_COLUMNS]).toEqual([
      "at",
      "clinicId",
      "action",
      "actorUid",
      "actorEmail",
      "actorRole",
      "actorShift",
      "actingAsOwner",
      "targetCollection",
      "targetId",
      "targetLabel",
      "detail",
    ]);
  });

  it("escapes quotes and commas so the legal export is parseable", () => {
    expect(csvCell('say "hello", world')).toBe('"say ""hello"", world"');
    const csv = auditLogsToCsv([
      sampleRecord({
        targetLabel: 'Ada, "Ada"',
        actorShift: "night",
      }),
    ]);
    expect(csv.split("\r\n")[0]).toBe(AUDIT_CSV_COLUMNS.join(","));
    expect(csv).toContain('"Ada, ""Ada"""');
    expect(csv).toContain("night");
    expect(csv).toContain("technician");
  });
});

describe("audit filters", () => {
  it("filters by action and actor without mixing clinics", () => {
    const rows = [
      sampleRecord(),
      sampleRecord({ id: "a2", action: "order.approved", actorUid: "uid-2" }),
      sampleRecord({ id: "a3", action: "patient.softDelete" }),
    ];
    expect(filterAuditLogs(rows, { action: "order.approved" }).map((r) => r.id)).toEqual(["a2"]);
    expect(filterAuditLogs(rows, { actorUid: "uid-1" }).map((r) => r.id)).toEqual(["a1", "a3"]);
  });

  it("reads stored docs without inventing patient fields in detail", () => {
    const row = parseAuditLog("x", {
      clinicId: "clinicA",
      actorUid: "u",
      actorEmail: "a@lab.test",
      actorRole: "clinic_admin",
      actorShift: null,
      actingAsOwner: false,
      action: "patient.softDelete",
      targetCollection: "patients",
      targetId: "p1",
      targetLabel: "Ada — LF-1",
      at: "2026-08-21T12:00:00.000Z",
      detail: { reason: "duplicate", fields: ["deleted"] },
    });
    expect(row.detail).toEqual({ reason: "duplicate", fields: ["deleted"] });
    expect(row.detail).not.toHaveProperty("phone");
    expect(row.detail).not.toHaveProperty("nationalId");
  });
});
