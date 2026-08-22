/** Inclusive calendar-day cap. Wider pulls time out, attach too much PHI, and burn Spark reads. */
export const MAX_EXPORT_RANGE_DAYS = 90;

export const MAX_EXPORTS_PER_HOUR = 5;

/** Safety stop so a dense clinic cannot hang the route after the date cap. */
export const MAX_EXPORT_ROWS = 8000;

export const RANGE_CAP_MESSAGE =
  `Date range cannot exceed ${MAX_EXPORT_RANGE_DAYS} days. Wider exports time out on the server, attach a large amount of patient information to email, and burn Firestore Spark reads.`;

export const EXPORT_DENIED_MESSAGE =
  "Excel export is not available for this role. Ask a clinic admin, lab manager, or the owner if a report is needed.";

export const REPORT_TYPES = ["patients", "orders", "results", "inventory"] as const;

export type ReportType = (typeof REPORT_TYPES)[number];

export const REPORT_TYPE_LABELS: Record<ReportType, string> = {
  patients: "Patients",
  orders: "Orders",
  results: "Results",
  inventory: "Inventory movements",
};

export type RecentExport = {
  at: string;
  reportType: ReportType;
  startDate: string;
  endDate: string;
  rowCount: number;
  recipient: string;
};

export const EXPORT_DELIVERIES = ["download", "email"] as const;

export type ExportDelivery = (typeof EXPORT_DELIVERIES)[number];

export type ParsedExportRequest = {
  startDate: string;
  endDate: string;
  reportType: ReportType;
  startIso: string;
  endExclusiveIso: string;
  dayCount: number;
  delivery: ExportDelivery;
};

export function isReportType(value: unknown): value is ReportType {
  return typeof value === "string" && (REPORT_TYPES as readonly string[]).includes(value);
}

export function parseYmd(value: unknown): string | null {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const parsed = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== value) return null;
  return value;
}

export function inclusiveRangeDays(startDate: string, endDate: string): number {
  const start = Date.parse(`${startDate}T00:00:00.000Z`);
  const end = Date.parse(`${endDate}T00:00:00.000Z`);
  return Math.round((end - start) / 86_400_000) + 1;
}

/**
 * Reads startDate, endDate, reportType only. clinicId and any recipient email
 * on the body are ignored — those come from the verified token / user record.
 */
export function parseExportRequest(body: Record<string, unknown>): ParsedExportRequest | { error: string } {
  const startDate = parseYmd(body.startDate);
  const endDate = parseYmd(body.endDate);
  if (!startDate || !endDate) {
    return { error: "Start and end dates must be YYYY-MM-DD." };
  }
  if (startDate > endDate) {
    return { error: "Start date must be on or before the end date." };
  }
  const dayCount = inclusiveRangeDays(startDate, endDate);
  if (dayCount > MAX_EXPORT_RANGE_DAYS) {
    return { error: RANGE_CAP_MESSAGE };
  }
  if (!isReportType(body.reportType)) {
    return { error: "Choose a report type: patients, orders, results, or inventory." };
  }
  const start = new Date(`${startDate}T00:00:00.000Z`);
  const endExclusive = new Date(start);
  endExclusive.setUTCDate(endExclusive.getUTCDate() + dayCount);
  const delivery: ExportDelivery = body.delivery === "email" ? "email" : "download";
  return {
    startDate,
    endDate,
    reportType: body.reportType,
    startIso: start.toISOString(),
    endExclusiveIso: endExclusive.toISOString(),
    dayCount,
    delivery,
  };
}

/**
 * Staff: membership/claim clinic. Owner: all clinics (token has no clinicId;
 * acting clinic is session-only and is never accepted from the client).
 */
export function clinicScopeForExport(role: string | null, identityClinicId: string | null):
  | { clinicId: string | null; allClinics: boolean }
  | { error: string } {
  if (role === "owner") return { clinicId: null, allClinics: true };
  if (!identityClinicId) return { error: "This account is not assigned to a clinic." };
  return { clinicId: identityClinicId, allClinics: false };
}

export function toExcelDate(value: unknown): Date | string {
  if (typeof value !== "string" || !value.trim()) return "";
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed;
}

function asString(value: unknown): string {
  if (typeof value === "string") return value;
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return "";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function testNames(value: unknown): string {
  if (!Array.isArray(value)) return "";
  return value
    .map((item) => {
      const rec = asRecord(item);
      return asString(rec.name) || asString(rec.code);
    })
    .filter(Boolean)
    .join("; ");
}

function actorCell(value: unknown): string {
  if (!value) return "";
  if (typeof value === "string") return value;
  const rec = asRecord(value);
  if (typeof rec.username === "string" && rec.username.trim()) return rec.username;
  if (typeof rec.email === "string" && rec.email.trim()) return rec.email;
  if (typeof rec.uid === "string") return rec.uid;
  return "";
}

export function patientExportRows(docs: { id: string; data: Record<string, unknown> }[]): unknown[][] {
  return docs
    .filter((doc) => doc.data.deleted !== true)
    .map((doc) => {
      const d = doc.data;
      return [
        asString(d.clinicId),
        doc.id,
        asString(d.labId),
        asString(d.name),
        asString(d.preferredName),
        asString(d.sex),
        toExcelDate(d.dob),
        asString(d.phone),
        asString(d.address),
        asString(d.nationalId),
        asString(d.nextOfKin),
        asString(d.referringClinician),
        asString(d.reasonForVisit),
        d.consentGiven === true ? "Yes" : "",
        toExcelDate(d.createdAt),
      ];
    });
}

export const PATIENT_HEADERS = [
  "Clinic ID",
  "Record ID",
  "Lab ID",
  "Name",
  "Preferred name",
  "Sex",
  "Date of birth",
  "Phone",
  "Address",
  "National ID",
  "Next of kin",
  "Referring clinician",
  "Reason for visit",
  "Consent",
  "Registered",
];

export function orderExportRows(docs: { id: string; data: Record<string, unknown> }[]): unknown[][] {
  return docs
    .filter((doc) => doc.data.patientDeleted !== true)
    .map((doc) => {
      const d = doc.data;
      return [
        asString(d.clinicId),
        doc.id,
        asString(d.patientLabId),
        asString(d.patientName),
        asString(d.status),
        testNames(d.tests),
        toExcelDate(d.createdAt),
        toExcelDate(d.sampleCollectedAt),
        asString(d.resultsEnteredBy),
        toExcelDate(d.resultsEnteredAt),
        asString(d.reviewedBy),
        toExcelDate(d.reviewedAt),
      ];
    });
}

export const ORDER_HEADERS = [
  "Clinic ID",
  "Order ID",
  "Lab ID",
  "Patient",
  "Status",
  "Tests",
  "Ordered",
  "Sample collected",
  "Results entered by",
  "Results entered",
  "Reviewed by",
  "Reviewed",
];

export function resultExportRows(docs: { id: string; data: Record<string, unknown> }[]): unknown[][] {
  const rows: unknown[][] = [];
  for (const doc of docs) {
    if (doc.data.patientDeleted === true) continue;
    const d = doc.data;
    const tests = Array.isArray(d.tests) ? d.tests : [];
    const names = new Map<string, string>();
    for (const item of tests) {
      const rec = asRecord(item);
      const code = asString(rec.code);
      if (code) names.set(code, asString(rec.name) || code);
    }
    const results = asRecord(d.results);
    for (const [testCode, params] of Object.entries(results)) {
      const paramMap = asRecord(params);
      const entries = Object.entries(paramMap);
      if (entries.length === 0) {
        rows.push([
          asString(d.clinicId),
          doc.id,
          asString(d.patientLabId),
          asString(d.patientName),
          asString(d.status),
          testCode,
          names.get(testCode) || testCode,
          "",
          "",
          asString(d.resultsEnteredBy),
          toExcelDate(d.resultsEnteredAt),
          asString(d.reviewedBy),
          toExcelDate(d.reviewedAt),
        ]);
        continue;
      }
      for (const [param, value] of entries) {
        rows.push([
          asString(d.clinicId),
          doc.id,
          asString(d.patientLabId),
          asString(d.patientName),
          asString(d.status),
          testCode,
          names.get(testCode) || testCode,
          param,
          asString(value),
          asString(d.resultsEnteredBy),
          toExcelDate(d.resultsEnteredAt),
          asString(d.reviewedBy),
          toExcelDate(d.reviewedAt),
        ]);
      }
    }
  }
  return rows;
}

export const RESULT_HEADERS = [
  "Clinic ID",
  "Order ID",
  "Lab ID",
  "Patient",
  "Status",
  "Test code",
  "Test name",
  "Parameter",
  "Value",
  "Entered by",
  "Entered",
  "Reviewed by",
  "Reviewed",
];

export function inventoryExportRows(docs: { id: string; data: Record<string, unknown> }[]): unknown[][] {
  return docs.map((doc) => {
    const d = doc.data;
    return [
      asString(d.clinicId),
      doc.id,
      asString(d.itemName),
      asString(d.lotNumber),
      toExcelDate(d.expiryDate),
      asString(d.type),
      asString(d.direction),
      typeof d.quantity === "number" ? d.quantity : asString(d.quantity),
      asString(d.packingUnit),
      asString(d.baseUnit),
      toExcelDate(d.occurredAt),
      actorCell(d.actor),
      asString(d.department),
      asString(d.issuedTo),
      asString(d.reason),
      asString(d.note),
    ];
  });
}

export const INVENTORY_HEADERS = [
  "Clinic ID",
  "Movement ID",
  "Item",
  "Lot",
  "Expiry",
  "Type",
  "Direction",
  "Quantity",
  "Packing unit",
  "Base unit",
  "Occurred",
  "Recorded by",
  "Department",
  "Issued to",
  "Reason",
  "Note",
];

export function exportFilename(reportType: ReportType, startDate: string, endDate: string): string {
  return `labflow-${reportType}-${startDate}-to-${endDate}.xlsx`;
}

export function parseRecentExports(value: unknown): RecentExport[] {
  if (!Array.isArray(value)) return [];
  const out: RecentExport[] = [];
  for (const item of value) {
    const rec = asRecord(item);
    if (!isReportType(rec.reportType)) continue;
    const startDate = parseYmd(rec.startDate);
    const endDate = parseYmd(rec.endDate);
    if (!startDate || !endDate) continue;
    if (typeof rec.at !== "string" || typeof rec.recipient !== "string") continue;
    const rowCount = typeof rec.rowCount === "number" ? rec.rowCount : Number(rec.rowCount);
    if (!Number.isFinite(rowCount)) continue;
    out.push({
      at: rec.at,
      reportType: rec.reportType,
      startDate,
      endDate,
      rowCount,
      recipient: rec.recipient,
    });
  }
  return out.slice(0, 10);
}
