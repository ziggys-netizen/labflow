import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  AUDIT_MISSING_INDEX_NOTICE,
  auditLoadFailureMessage,
  auditRowsInRange,
  classifyReadFailure,
  firestoreErrorCode,
  type AuditLogRecord,
} from "./auditTypes";

function firestoreError(code: string, message: string) {
  return Object.assign(new Error(message), { code, name: "FirebaseError" });
}

const INDEX_ERROR = firestoreError(
  "failed-precondition",
  "The query requires an index. You can create it here: https://console.firebase.google.com/v1/r/project/x/firestore/indexes?create_composite=abc"
);

describe("classifyReadFailure", () => {
  it("recognises the live database missing an index", () => {
    expect(classifyReadFailure(INDEX_ERROR)).toBe("missing-index");
  });

  it("accepts the code with or without the firestore/ prefix", () => {
    expect(
      classifyReadFailure(firestoreError("firestore/failed-precondition", "The query requires an index. …"))
    ).toBe("missing-index");
    expect(firestoreErrorCode(firestoreError("firestore/permission-denied", "x"))).toBe("permission-denied");
  });

  it("does not treat every failed precondition as a missing index", () => {
    const other = firestoreError("failed-precondition", "The Firestore client is offline and persistence is unavailable");
    expect(classifyReadFailure(other)).toBe("unknown");
  });

  it("does not match the phrase unless it opens the message", () => {
    const quoted = firestoreError("failed-precondition", "Retry: The query requires an index");
    expect(classifyReadFailure(quoted)).toBe("unknown");
  });

  it("sorts the other common failures into ones a person can act on", () => {
    expect(classifyReadFailure(firestoreError("permission-denied", "Missing or insufficient permissions."))).toBe("permission");
    expect(classifyReadFailure(firestoreError("unavailable", "Failed to get documents from server."))).toBe("offline");
    expect(classifyReadFailure(firestoreError("deadline-exceeded", "Deadline exceeded"))).toBe("offline");
    expect(classifyReadFailure(new Error("something else"))).toBe("unknown");
    expect(classifyReadFailure(null)).toBe("unknown");
  });
});

describe("auditLoadFailureMessage", () => {
  it("names the reason instead of a bare 'could not load'", () => {
    expect(auditLoadFailureMessage("permission")).toMatch(/do not have access/);
    expect(auditLoadFailureMessage("offline")).toMatch(/Check the connection/);
    expect(auditLoadFailureMessage("missing-index")).toMatch(/index/);
  });

  it("carries the error code when the reason is not one it knows", () => {
    expect(auditLoadFailureMessage("unknown", "resource-exhausted")).toContain("resource-exhausted");
  });

  it("always says what to do next", () => {
    for (const kind of ["permission", "offline", "missing-index", "unknown"] as const) {
      const text = auditLoadFailureMessage(kind, "x");
      expect(text.length).toBeGreaterThan(20);
    }
    expect(auditLoadFailureMessage("offline")).toMatch(/Retry/);
    expect(auditLoadFailureMessage("unknown", "x")).toMatch(/Retry/);
  });

  it("tells the degraded page how to get the fast route back", () => {
    expect(AUDIT_MISSING_INDEX_NOTICE).toMatch(/firebase deploy --only firestore:indexes/);
  });
});

function row(id: string, at: string): AuditLogRecord {
  return {
    id,
    clinicId: "c1",
    actorUid: "u1",
    actorEmail: null,
    actorRole: "owner",
    actorShift: null,
    actingAsOwner: true,
    offRoster: false,
    action: "patient.view",
    targetCollection: "patients",
    targetId: "p1",
    targetLabel: "LF-20260918-4A7C",
    at,
    detail: null,
  } as AuditLogRecord;
}

describe("auditRowsInRange", () => {
  const rows = [
    row("a", "2026-09-01T10:00:00.000Z"),
    row("b", "2026-09-10T10:00:00.000Z"),
    row("c", "2026-09-19T10:00:00.000Z"),
    row("d", "2026-08-01T10:00:00.000Z"),
  ];

  it("keeps the range inclusive at both ends, newest first, as the indexed query does", () => {
    const out = auditRowsInRange(rows, "2026-09-01T10:00:00.000Z", "2026-09-19T10:00:00.000Z");
    expect(out.map((r) => r.id)).toEqual(["c", "b", "a"]);
  });

  it("treats a missing bound as open", () => {
    expect(auditRowsInRange(rows, undefined, "2026-09-05T00:00:00.000Z").map((r) => r.id)).toEqual(["a", "d"]);
    expect(auditRowsInRange(rows).map((r) => r.id)).toEqual(["c", "b", "a", "d"]);
  });

  it("does not change the rows it was given", () => {
    const before = rows.map((r) => r.id);
    auditRowsInRange(rows, "2026-09-02T00:00:00.000Z");
    expect(rows.map((r) => r.id)).toEqual(before);
  });
});

/**
 * Every query in the app that needs a composite index must have one in the
 * file that `firebase deploy --only firestore:indexes` publishes. If one goes
 * missing from the file it can never reach the live database, and a page
 * breaks with "The query requires an index".
 */
describe("firestore.indexes.json keeps every composite index the code relies on", () => {
  type Field = { fieldPath: string; order?: string; arrayConfig?: string };
  const file = JSON.parse(readFileSync(join(process.cwd(), "firestore.indexes.json"), "utf8")) as {
    indexes: { collectionGroup: string; queryScope: string; fields: Field[] }[];
  };

  function has(collection: string, fields: [string, "ASCENDING" | "DESCENDING"][]) {
    return file.indexes.some(
      (ix) =>
        ix.collectionGroup === collection &&
        ix.fields.length === fields.length &&
        fields.every(([path, order], i) => ix.fields[i]?.fieldPath === path && ix.fields[i]?.order === order)
    );
  }

  const REQUIRED: [string, [string, "ASCENDING" | "DESCENDING"][], string][] = [
    ["auditLogs", [["clinicId", "ASCENDING"], ["at", "DESCENDING"]], "audit log page (audit.ts)"],
    ["patients", [["clinicId", "ASCENDING"], ["createdAt", "DESCENDING"]], "Excel export: patients"],
    ["orders", [["clinicId", "ASCENDING"], ["createdAt", "DESCENDING"]], "Excel export: orders"],
    ["orders", [["clinicId", "ASCENDING"], ["resultsEnteredAt", "DESCENDING"]], "Excel export: results"],
    ["inventoryMovements", [["clinicId", "ASCENDING"], ["occurredAt", "DESCENDING"]], "Excel export: stock"],
    ["preApprovals", [["status", "ASCENDING"], ["expiresAt", "ASCENDING"]], "pre-approval expiry sweep"],
  ];

  for (const [collection, fields, usedBy] of REQUIRED) {
    it(`${collection} (${fields.map(([f, o]) => `${f} ${o.slice(0, 3).toLowerCase()}`).join(", ")}) for the ${usedBy}`, () => {
      expect(has(collection, fields)).toBe(true);
    });
  }
});
