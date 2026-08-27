/** One audit log shape for client `logAudit` and Admin SDK `auditAdmin`. */

import { sessionOffRoster } from "./rosterStamp";

export type AuditActor = {
  uid: string;
  email: string | null;
  role: string | null;
  shift: string | null;
  actingAsOwner: boolean;
  offRoster?: boolean;
};

export type AuditLogWrite = {
  clinicId: string | null;
  actor: AuditActor;
  action: string;
  targetCollection: string;
  targetId: string;
  targetLabel: string;
  detail?: Record<string, unknown>;
  offRoster?: boolean;
};

/** Stored `auditLogs/{id}` fields. `detail` is omitted when the writer passed none. */
export type AuditLogRecord = {
  id: string;
  clinicId: string | null;
  actorUid: string;
  actorEmail: string | null;
  actorRole: string | null;
  actorShift: string | null;
  actingAsOwner: boolean;
  offRoster: boolean;
  action: string;
  targetCollection: string;
  targetId: string;
  targetLabel: string;
  at: string;
  detail: Record<string, unknown> | null;
};

/**
 * Viewer filter vocabulary. Includes actions already written (S2/S3) and
 * `dataQuality.clearCollectionTime` for the parallel Q6 writer.
 */
export const AUDIT_ACTIONS = [
  "patient.register",
  "patient.softDelete",
  "patient.restore",
  "order.create",
  "order.sampleCollected",
  "order.resultsEntered",
  "order.approved",
  "order.sentBack",
  "order.amended",
  "order.rejected",
  "order.cancelled",
  "order.selfReleased",
  "order.criticalNotified",
  "order.provisionalPrinted",
  "disclosure.print",
  "patient.correct",
  "patient.erasure",
  "staff.pinReset",
  "staff.pinSet",
  "catalogue.update",
  "catalogue.seeded",
  "catalogue.reviewed",
  "staff.approve",
  "staff.reject",
  "staff.roleChange",
  "clinic.create",
  "clinic.update",
  "joinCode.regenerate",
  "joinCode.failedAttempt",
  "import.run",
  "legacyRecords.claim",
  "dataQuality.clearCollectionTime",
  "preApproval.create",
  "preApproval.revoke",
  "preApproval.consume",
  "preApproval.lapse",
  "report.exported",
  "roster.breakGlass",
  "roster.entryCreate",
  "roster.entryUpdate",
  "roster.entryDelete",
  "roster.exceptionCreate",
  "roster.exceptionDelete",
] as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[number];

export const AUDIT_CSV_COLUMNS = [
  "at",
  "clinicId",
  "action",
  "actorUid",
  "actorEmail",
  "actorRole",
  "actorShift",
  "actingAsOwner",
  "offRoster",
  "targetCollection",
  "targetId",
  "targetLabel",
  "detail",
] as const;

export type AuditCsvColumn = (typeof AUDIT_CSV_COLUMNS)[number];

export function actorFromAuth(
  user: { uid: string; email: string | null } | null,
  role: string | null,
  shift: string | null
): AuditActor | null {
  if (!user) return null;
  return {
    uid: user.uid,
    email: user.email,
    role,
    shift,
    actingAsOwner: role === "owner",
    offRoster: sessionOffRoster() || undefined,
  };
}

/** Lab ID + record type. Never a patient name — erasure must not leave names in the log. */
export function auditTargetLabel(labId?: string | null, recordType?: string | null): string {
  const parts = [
    typeof labId === "string" ? labId.trim() : "",
    typeof recordType === "string" ? recordType.trim() : "",
  ].filter(Boolean);
  return parts.join(" · ") || "[erased]";
}

export function auditLogPayload(entry: AuditLogWrite): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    clinicId: entry.clinicId,
    actorUid: entry.actor.uid,
    actorEmail: entry.actor.email,
    actorRole: entry.actor.role,
    actorShift: entry.actor.shift,
    actingAsOwner: entry.actor.actingAsOwner,
    action: entry.action,
    targetCollection: entry.targetCollection,
    targetId: entry.targetId,
    targetLabel: entry.targetLabel,
    at: new Date().toISOString(),
  };
  if (entry.detail) payload.detail = entry.detail;
  if (entry.offRoster === true || entry.actor.offRoster === true || sessionOffRoster()) {
    payload.offRoster = true;
  }
  return payload;
}

function asString(value: unknown): string | null {
  return typeof value === "string" ? value : null;
}

export function parseAuditLog(id: string, data: Record<string, unknown>): AuditLogRecord {
  const detailRaw = data.detail;
  const detail =
    detailRaw && typeof detailRaw === "object" && !Array.isArray(detailRaw)
      ? (detailRaw as Record<string, unknown>)
      : null;
  return {
    id,
    clinicId: asString(data.clinicId),
    actorUid: asString(data.actorUid) || "",
    actorEmail: asString(data.actorEmail),
    actorRole: asString(data.actorRole),
    actorShift: asString(data.actorShift),
    actingAsOwner: data.actingAsOwner === true,
    offRoster: data.offRoster === true,
    action: asString(data.action) || "",
    targetCollection: asString(data.targetCollection) || "",
    targetId: asString(data.targetId) || "",
    targetLabel: asString(data.targetLabel) || "",
    at: asString(data.at) || "",
    detail,
  };
}

export function csvCell(value: unknown): string {
  const text =
    value == null
      ? ""
      : typeof value === "object"
        ? JSON.stringify(value)
        : String(value);
  if (/[",\n\r]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export function auditLogsToCsv(rows: AuditLogRecord[]): string {
  const header = AUDIT_CSV_COLUMNS.join(",");
  const lines = rows.map((row) =>
    AUDIT_CSV_COLUMNS.map((col) => csvCell(row[col])).join(",")
  );
  return [header, ...lines].join("\r\n");
}

export function filterAuditLogs(
  rows: AuditLogRecord[],
  filters: { action?: string; actorUid?: string }
): AuditLogRecord[] {
  const action = filters.action?.trim() || "";
  const actorUid = filters.actorUid?.trim() || "";
  return rows.filter((row) => {
    if (action && row.action !== action) return false;
    if (actorUid && row.actorUid !== actorUid) return false;
    return true;
  });
}

/** Local calendar day → ISO, for date-range queries on `at`. */
export function localDayStartIso(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 0, 0, 0, 0).toISOString();
}

export function localDayEndIso(dateStr: string): string {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1, 23, 59, 59, 999).toISOString();
}

export function defaultAuditDateFrom(): string {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function defaultAuditDateTo(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
