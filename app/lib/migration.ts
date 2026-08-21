import type { TestParameter } from "./testCatalog";

export type MigrationDataType = "patients" | "testCatalog" | "historicalOrders";
export type MappingTarget = string | "ignore";
export type DuplicateChoice = "skip" | "update" | "new";

export interface SpreadsheetRow {
  rowNumber: number;
  values: Record<string, string>;
}

export interface ParsedSpreadsheet {
  sheetName: string;
  headers: string[];
  rows: SpreadsheetRow[];
}

export interface MigrationField {
  key: string;
  label: string;
  required?: boolean;
  aliases: string[];
  help: string;
}

export interface ExistingPatientRef {
  id: string;
  labId: string;
  name: string;
  dob: string;
  phone: string;
  nationalId: string;
}

export interface ExistingTestRef {
  id: string;
  code: string;
  name: string;
  parameters: TestParameter[];
}

export interface ExistingOrderRef {
  id: string;
  patientId: string;
  createdAt: string;
  testCodes: string[];
}

export interface ValidationContext {
  now: string;
  existingPatients: ExistingPatientRef[];
  existingTests: ExistingTestRef[];
  existingOrders: ExistingOrderRef[];
}

export interface PatientImportData {
  labId: string;
  name: string;
  preferredName?: string;
  sex: "Female" | "Male" | "Other";
  dob: string;
  phone: string;
  address: string;
  nationalId?: string;
  nextOfKin?: string;
  referringClinician: string;
  reasonForVisit?: string;
  consentGiven: true;
  createdAt: string;
  sampleCollectedAt?: string;
  sampleCollectedBy?: string;
}

export interface TestCatalogImportData {
  code: string;
  name: string;
  category: string;
  parameters: TestParameter[];
  price?: number;
}

export type HistoricalOrderStatus =
  | "pending"
  | "results_entered"
  | "approved"
  | "needs_correction";

export interface HistoricalOrderImportData {
  patientId: string;
  patientName: string;
  patientLabId: string;
  tests: { code: string; name: string }[];
  status: HistoricalOrderStatus;
  createdAt: string;
  sampleCollectedAt?: string;
  sampleCollectedBy?: string;
  results?: Record<string, Record<string, string>>;
  resultsEnteredBy?: string;
  resultsEnteredAt?: string;
  reviewedBy?: string;
  reviewedAt?: string;
  reviewNotes?: string;
}

export type ImportRecord =
  | {
      type: "patients";
      data: PatientImportData;
      providedFields: string[];
      generatedLabId: boolean;
    }
  | {
      type: "testCatalog";
      data: TestCatalogImportData;
      providedFields: string[];
    }
  | {
      type: "historicalOrders";
      data: HistoricalOrderImportData;
      providedFields: string[];
    };

export interface DuplicateDetails {
  reasons: string[];
  existingId?: string;
  canUpdate: boolean;
  canImportNew: boolean;
}

export interface ValidatedImportRow {
  id: string;
  rowNumber: number;
  state: "ready" | "duplicate" | "attention";
  issues: string[];
  warnings: string[];
  record: ImportRecord | null;
  duplicate?: DuplicateDetails;
  choice: DuplicateChoice;
}

export interface ValidationSummary {
  total: number;
  ready: number;
  duplicates: number;
  attention: number;
  skipped: number;
}

const PATIENT_FIELDS: MigrationField[] = [
  {
    key: "labId",
    label: "Lab ID",
    aliases: ["lab id", "laboratory id", "patient lab id", "record number"],
    help: "Optional. A LabFlow-format ID is generated when this is blank.",
  },
  {
    key: "name",
    label: "Full name",
    required: true,
    aliases: ["name", "full name", "patient name"],
    help: "Required. Letters, spaces, apostrophes, periods, and hyphens only.",
  },
  {
    key: "preferredName",
    label: "Preferred / alternate name",
    aliases: ["preferred name", "alternate name", "other name", "nickname"],
    help: "Optional.",
  },
  {
    key: "sex",
    label: "Sex",
    required: true,
    aliases: ["sex", "gender"],
    help: "Required. Female, Male, Other, F, or M.",
  },
  {
    key: "dob",
    label: "Date of birth",
    required: true,
    aliases: ["dob", "date of birth", "birth date", "birthday"],
    help: "Required. Use an Excel date or ISO date (YYYY-MM-DD).",
  },
  {
    key: "phone",
    label: "Phone",
    required: true,
    aliases: ["phone", "phone number", "mobile", "mobile number", "telephone"],
    help: "Required. Include the country code when it is known.",
  },
  {
    key: "address",
    label: "Address / locality",
    required: true,
    aliases: ["address", "locality", "location", "residence"],
    help: "Required.",
  },
  {
    key: "nationalId",
    label: "National ID",
    aliases: ["national id", "national id number", "identity number", "id number"],
    help: "Optional.",
  },
  {
    key: "nextOfKin",
    label: "Next of kin",
    aliases: ["next of kin", "next of kin details", "emergency contact"],
    help: "Optional.",
  },
  {
    key: "referringClinician",
    label: "Referring clinician",
    required: true,
    aliases: ["referring clinician", "clinician", "doctor", "referrer", "requested by"],
    help: "Required by the current patient registration model.",
  },
  {
    key: "reasonForVisit",
    label: "Reason for visit / notes",
    aliases: ["reason for visit", "clinical notes", "notes", "reason"],
    help: "Optional.",
  },
  {
    key: "consentGiven",
    label: "Consent given",
    required: true,
    aliases: ["consent", "consent given", "patient consent", "consented"],
    help: "Required. Must explicitly contain Yes, True, or 1.",
  },
  {
    key: "createdAt",
    label: "Registration date/time",
    aliases: ["created at", "registered at", "registration date", "date registered"],
    help: "Optional. Import time is used when no historical timestamp is supplied.",
  },
  {
    key: "sampleCollectedAt",
    label: "Sample collected date/time",
    aliases: ["sample collected at", "sample collection time", "collection date"],
    help: "Optional. Only stored when a valid timestamp is supplied.",
  },
  {
    key: "sampleCollectedBy",
    label: "Sample collected by",
    aliases: ["sample collected by", "collected by"],
    help: "Optional. Requires a sample collection timestamp.",
  },
];

const TEST_CATALOG_FIELDS: MigrationField[] = [
  {
    key: "code",
    label: "Test code",
    required: true,
    aliases: ["code", "test code", "test id", "short code"],
    help: "Required. This is the catalogue identifier and is normalized to uppercase.",
  },
  {
    key: "name",
    label: "Test name",
    required: true,
    aliases: ["name", "test name", "assay", "analysis"],
    help: "Required.",
  },
  {
    key: "category",
    label: "Category",
    required: true,
    aliases: ["category", "department", "section", "discipline"],
    help: "Required. No category is invented for blank rows.",
  },
  {
    key: "price",
    label: "Price",
    aliases: ["price", "cost", "amount", "fee"],
    help: "Optional. Must be a non-negative number.",
  },
  {
    key: "parameterName",
    label: "Single parameter name",
    aliases: ["parameter", "parameter name", "analyte", "result name"],
    help: "Use for a one-parameter definition, or map Parameters JSON instead.",
  },
  {
    key: "unit",
    label: "Single parameter unit",
    aliases: ["unit", "units"],
    help: "Optional. Blank values remain blank.",
  },
  {
    key: "referenceRange",
    label: "Single parameter reference range",
    aliases: ["reference range", "normal range", "range", "reference interval"],
    help: "Optional. Blank values remain blank.",
  },
  {
    key: "parametersJson",
    label: "Parameters JSON",
    aliases: ["parameters json", "parameter json", "parameters"],
    help:
      'For multiple parameters, supply a JSON array such as [{"name":"Hb","unit":"g/dL","referenceRange":"12-16"}].',
  },
];

const HISTORICAL_ORDER_FIELDS: MigrationField[] = [
  {
    key: "patientLabId",
    label: "Patient Lab ID",
    aliases: ["patient lab id", "lab id", "laboratory id"],
    help: "Map at least one patient identifier. It must resolve inside this clinic.",
  },
  {
    key: "patientNationalId",
    label: "Patient National ID",
    aliases: ["patient national id", "national id", "national id number"],
    help: "Map at least one patient identifier. It must resolve inside this clinic.",
  },
  {
    key: "patientPhone",
    label: "Patient phone",
    aliases: ["patient phone", "phone", "phone number", "mobile"],
    help: "Map at least one patient identifier. It must resolve inside this clinic.",
  },
  {
    key: "testCodes",
    label: "Test code(s)",
    required: true,
    aliases: ["test codes", "test code", "tests", "ordered tests"],
    help: "Required. Separate multiple catalogue codes with commas, semicolons, or pipes.",
  },
  {
    key: "createdAt",
    label: "Order date/time",
    required: true,
    aliases: ["order date", "ordered at", "created at", "order time"],
    help: "Required. A missing historical order timestamp is never invented.",
  },
  {
    key: "status",
    label: "Order status",
    required: true,
    aliases: ["status", "order status", "result status"],
    help: "Required. Pending, Results entered, Approved, or Needs correction.",
  },
  {
    key: "sampleCollectedAt",
    label: "Sample collected date/time",
    aliases: ["sample collected at", "sample collection time", "collection date"],
    help: "Optional.",
  },
  {
    key: "sampleCollectedBy",
    label: "Sample collected by",
    aliases: ["sample collected by", "collected by"],
    help: "Optional. Requires a sample collection timestamp.",
  },
  {
    key: "resultParameter",
    label: "Single result parameter",
    aliases: ["result parameter", "parameter", "analyte"],
    help: "Optional. Supported only when the row has one test code.",
  },
  {
    key: "resultValue",
    label: "Single result value",
    aliases: ["result value", "value", "result"],
    help: "Optional. Must be mapped together with Single result parameter.",
  },
  {
    key: "resultsJson",
    label: "Results JSON",
    aliases: ["results json", "result json"],
    help:
      'Optional. Use {"FBC":{"Haemoglobin (Hb)":"12.5"}}; a flat object is accepted for one test.',
  },
  {
    key: "resultsEnteredBy",
    label: "Results entered by",
    aliases: ["results entered by", "entered by", "resulted by"],
    help: "Required for non-pending result statuses.",
  },
  {
    key: "resultsEnteredAt",
    label: "Results entered date/time",
    aliases: ["results entered at", "resulted at", "result date"],
    help: "Required for non-pending result statuses.",
  },
  {
    key: "reviewedBy",
    label: "Reviewed by",
    aliases: ["reviewed by", "approved by", "verified by"],
    help: "Required for Approved and Needs correction.",
  },
  {
    key: "reviewedAt",
    label: "Reviewed date/time",
    aliases: ["reviewed at", "approved at", "verified at"],
    help: "Required for Approved and Needs correction.",
  },
  {
    key: "reviewNotes",
    label: "Review notes",
    aliases: ["review notes", "review comment", "correction notes"],
    help: "Optional.",
  },
];

export const MIGRATION_FIELDS: Record<MigrationDataType, MigrationField[]> = {
  patients: PATIENT_FIELDS,
  testCatalog: TEST_CATALOG_FIELDS,
  historicalOrders: HISTORICAL_ORDER_FIELDS,
};

export const MIGRATION_DATA_LABELS: Record<MigrationDataType, string> = {
  patients: "Patients",
  testCatalog: "Test catalogue",
  historicalOrders: "Historical orders & results",
};

const RESERVED_TENANT_HEADERS = new Set([
  "clinicid",
  "clinicidentifier",
  "tenantid",
  "facilityid",
  "organisationid",
  "organizationid",
]);

export function isReservedTenantHeader(header: string) {
  return RESERVED_TENANT_HEADERS.has(normalizeHeader(header));
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function normalizeText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function normalizeName(value: string) {
  return normalizeText(value)
    .split(" ")
    .map((part) =>
      part.length > 0 ? part.charAt(0).toUpperCase() + part.slice(1).toLowerCase() : part
    )
    .join(" ");
}

function normalizePhone(value: string) {
  const trimmed = value.trim();
  const international = trimmed.startsWith("+") || trimmed.startsWith("00");
  const digits = trimmed.replace(/\D/g, "");
  return international ? `+${digits.replace(/^00/, "")}` : digits;
}

function phoneKey(value: string) {
  return value.replace(/\D/g, "");
}

function mapKey(value: string) {
  return normalizeText(value).toLowerCase();
}

function cellToString(value: unknown) {
  if (value === null || value === undefined) return "";
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? "" : value.toISOString();
  }
  return String(value).trim();
}

export async function parseSpreadsheet(file: File): Promise<ParsedSpreadsheet> {
  const extension = file.name.split(".").pop()?.toLowerCase();
  if (!extension || !["xlsx", "xls", "csv"].includes(extension)) {
    throw new Error("Choose an .xlsx, .xls, or .csv file.");
  }

  const XLSX = await import("@e965/xlsx");
  const bytes = await file.arrayBuffer();
  const workbook = XLSX.read(bytes, { type: "array", cellDates: true });
  const sheetName = workbook.SheetNames[0];
  if (!sheetName) throw new Error("The spreadsheet has no worksheets.");

  const sheet = workbook.Sheets[sheetName];
  const matrix = XLSX.utils.sheet_to_json<unknown[]>(sheet, {
    header: 1,
    defval: "",
    raw: true,
    blankrows: false,
  }) as unknown[][];

  const headerIndex = matrix.findIndex((row) => row.some((cell) => cellToString(cell) !== ""));
  if (headerIndex < 0) throw new Error("The first worksheet is empty.");

  const rawHeaders = matrix[headerIndex];
  const seen = new Map<string, number>();
  const headers = rawHeaders.map((cell, index) => {
    const base = cellToString(cell) || `Column ${index + 1}`;
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });

  const rows: SpreadsheetRow[] = [];
  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const source = matrix[index];
    const values: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, columnIndex) => {
      const value = cellToString(source[columnIndex]);
      values[header] = value;
      if (value !== "") hasValue = true;
    });
    if (hasValue) rows.push({ rowNumber: index + 1, values });
  }

  if (rows.length === 0) throw new Error("The first worksheet has headers but no data rows.");
  return { sheetName, headers, rows };
}

export function createAutoMapping(
  headers: string[],
  dataType: MigrationDataType
): Record<string, MappingTarget> {
  const mapping: Record<string, MappingTarget> = {};
  const fields = MIGRATION_FIELDS[dataType];
  const used = new Set<string>();

  for (const header of headers) {
    const normalized = normalizeHeader(header);
    if (isReservedTenantHeader(header)) {
      mapping[header] = "ignore";
      continue;
    }
    const match = fields.find((field) => {
      if (used.has(field.key)) return false;
      const candidates = [field.key, field.label, ...field.aliases].map(normalizeHeader);
      return candidates.includes(normalized);
    });
    mapping[header] = match?.key || "ignore";
    if (match) used.add(match.key);
  }
  return mapping;
}

export function validateMapping(
  mapping: Record<string, MappingTarget>,
  dataType: MigrationDataType
): string[] {
  const mapped = new Set(Object.values(mapping).filter((value) => value !== "ignore"));
  const errors = MIGRATION_FIELDS[dataType]
    .filter((field) => field.required && !mapped.has(field.key))
    .map((field) => `Map a column to ${field.label}.`);

  if (dataType === "testCatalog" && !mapped.has("parameterName") && !mapped.has("parametersJson")) {
    errors.push("Map either Single parameter name or Parameters JSON.");
  }
  if (
    dataType === "historicalOrders" &&
    !["patientLabId", "patientNationalId", "patientPhone"].some((field) => mapped.has(field))
  ) {
    errors.push("Map at least one patient identifier.");
  }
  return errors;
}

function mappedValues(
  row: SpreadsheetRow,
  mapping: Record<string, MappingTarget>
): Record<string, string> {
  const values: Record<string, string> = {};
  for (const [header, target] of Object.entries(mapping)) {
    if (target !== "ignore") values[target] = row.values[header] || "";
  }
  return values;
}

function providedFields(values: Record<string, string>) {
  return Object.entries(values)
    .filter(([, value]) => value.trim() !== "")
    .map(([key]) => key);
}

function parseDateOnly(value: string): string | null {
  const normalized = value.trim();
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(normalized);
  if (!match) return null;
  const candidate = `${match[1]}-${match[2]}-${match[3]}`;
  const date = new Date(`${candidate}T00:00:00.000Z`);
  return Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== candidate
    ? null
    : candidate;
}

function parseTimestamp(value: string): string | null {
  const normalized = value.trim();
  if (!normalized) return null;
  const isoLike = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(normalized)
    ? normalized.replace(" ", "T")
    : normalized;
  const date = new Date(isoLike);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function parseExplicitConsent(value: string): boolean | null {
  const normalized = normalizeHeader(value);
  if (["yes", "true", "1", "y", "consented", "consentgiven"].includes(normalized)) return true;
  if (["no", "false", "0", "n", "declined"].includes(normalized)) return false;
  return null;
}

function normalizeSex(value: string): PatientImportData["sex"] | null {
  const normalized = normalizeHeader(value);
  if (normalized === "female" || normalized === "f") return "Female";
  if (normalized === "male" || normalized === "m") return "Male";
  if (normalized === "other") return "Other";
  return null;
}

function normalizeStatus(value: string): HistoricalOrderStatus | null {
  const normalized = normalizeHeader(value);
  if (["pending", "ordered"].includes(normalized)) return "pending";
  if (["resultsentered", "awaitingreview", "submitted"].includes(normalized)) {
    return "results_entered";
  }
  if (["approved", "released", "approvedreleased"].includes(normalized)) return "approved";
  if (["needscorrection", "returned", "returnedforcorrection"].includes(normalized)) {
    return "needs_correction";
  }
  return null;
}

function isFuture(value: string, now: string) {
  return new Date(value).getTime() > new Date(now).getTime() + 5 * 60 * 1000;
}

function pushIndex(map: Map<string, string[]>, key: string, id: string) {
  if (!key) return;
  const values = map.get(key) || [];
  if (!values.includes(id)) values.push(id);
  map.set(key, values);
}

function sourceRowsByKey(
  records: { rowNumber: number; key: string }[]
): Map<string, number[]> {
  const result = new Map<string, number[]>();
  for (const record of records) {
    if (!record.key) continue;
    result.set(record.key, [...(result.get(record.key) || []), record.rowNumber]);
  }
  return result;
}

function allocateLabId(used: Set<string>, now: string, rowNumber: number): string | null {
  const datePart = now.slice(0, 10).replace(/-/g, "");
  const start = ((new Date(now).getTime() + rowNumber * 7919) % 9000) + 1000;
  for (let offset = 0; offset < 9000; offset += 1) {
    const suffix = 1000 + ((start - 1000 + offset) % 9000);
    const candidate = `LF-${datePart}-${suffix}`;
    if (!used.has(mapKey(candidate))) {
      used.add(mapKey(candidate));
      return candidate;
    }
  }
  return null;
}

function validatePatients(
  rows: SpreadsheetRow[],
  mapping: Record<string, MappingTarget>,
  context: ValidationContext
): ValidatedImportRow[] {
  const namePattern = /^[a-zA-Z\s\-'.]{2,100}$/;
  const nationalIdPattern = /^[a-zA-Z0-9\-]{4,30}$/;
  const existingLabIds = new Set(context.existingPatients.map((patient) => mapKey(patient.labId)));
  const allocatedLabIds = new Set(existingLabIds);
  for (const row of rows) {
    const suppliedLabId = mappedValues(row, mapping).labId;
    if (suppliedLabId) allocatedLabIds.add(mapKey(suppliedLabId));
  }

  const prepared = rows.map((row) => {
    const values = mappedValues(row, mapping);
    const issues: string[] = [];
    const warnings: string[] = [];
    const fields = providedFields(values);

    const name = normalizeName(values.name || "");
    if (!namePattern.test(name)) issues.push("Full name is missing or invalid.");

    const preferredName = values.preferredName ? normalizeName(values.preferredName) : "";
    if (preferredName && !namePattern.test(preferredName)) {
      issues.push("Preferred name is invalid.");
    }

    const sex = normalizeSex(values.sex || "");
    if (!sex) issues.push("Sex must be Female, Male, Other, F, or M.");

    const dob = parseDateOnly(values.dob || "");
    if (!dob) issues.push("Date of birth must be a valid ISO or Excel date.");
    if (dob && dob > context.now.slice(0, 10)) issues.push("Date of birth is in the future.");

    const phone = normalizePhone(values.phone || "");
    const phoneDigits = phoneKey(phone);
    if (phoneDigits.length < 6 || phoneDigits.length > 15) {
      issues.push("Phone must contain 6 to 15 digits.");
    }

    const address = normalizeText(values.address || "");
    if (address.length < 2) issues.push("Address is required.");

    const nationalId = normalizeText(values.nationalId || "");
    if (nationalId && !nationalIdPattern.test(nationalId)) {
      issues.push("National ID must contain 4 to 30 letters, numbers, or hyphens.");
    }

    const referringClinician = normalizeName(values.referringClinician || "");
    if (!namePattern.test(referringClinician)) {
      issues.push("Referring clinician is missing or invalid.");
    }

    const consent = parseExplicitConsent(values.consentGiven || "");
    if (consent !== true) issues.push("Explicit patient consent must be Yes, True, or 1.");

    let createdAt = context.now;
    if (values.createdAt) {
      const parsed = parseTimestamp(values.createdAt);
      if (!parsed) issues.push("Registration date/time is invalid.");
      else {
        createdAt = parsed;
        if (isFuture(createdAt, context.now)) issues.push("Registration date/time is in the future.");
      }
    } else {
      warnings.push("Registration date/time is blank; import time will be stored.");
    }

    const sampleCollectedAt = values.sampleCollectedAt
      ? parseTimestamp(values.sampleCollectedAt)
      : null;
    if (values.sampleCollectedAt && !sampleCollectedAt) {
      issues.push("Sample collection date/time is invalid.");
    }
    if (sampleCollectedAt && isFuture(sampleCollectedAt, context.now)) {
      issues.push("Sample collection date/time is in the future.");
    }
    if (values.sampleCollectedBy && !sampleCollectedAt) {
      issues.push("Sample collected by requires a valid sample collection timestamp.");
    }

    let labId = normalizeText(values.labId || "");
    const generatedLabId = !labId;
    if (!labId) {
      labId = allocateLabId(allocatedLabIds, context.now, row.rowNumber) || "";
      if (!labId) issues.push("No unique Lab ID could be generated.");
    }

    const data: PatientImportData | null =
      issues.length > 0 || !sex || !dob || consent !== true
        ? null
        : {
            labId,
            name,
            ...(preferredName ? { preferredName } : {}),
            sex,
            dob,
            phone,
            address,
            ...(nationalId ? { nationalId } : {}),
            ...(values.nextOfKin ? { nextOfKin: normalizeText(values.nextOfKin) } : {}),
            referringClinician,
            ...(values.reasonForVisit
              ? { reasonForVisit: normalizeText(values.reasonForVisit) }
              : {}),
            consentGiven: true,
            createdAt,
            ...(sampleCollectedAt ? { sampleCollectedAt } : {}),
            ...(values.sampleCollectedBy
              ? { sampleCollectedBy: normalizeText(values.sampleCollectedBy) }
              : {}),
          };

    return {
      row,
      issues,
      warnings,
      record: data
        ? ({
            type: "patients",
            data,
            providedFields: fields,
            generatedLabId,
          } satisfies ImportRecord)
        : null,
    };
  });

  const existingIndexes = {
    labId: new Map<string, string[]>(),
    nationalId: new Map<string, string[]>(),
    phone: new Map<string, string[]>(),
    nameDob: new Map<string, string[]>(),
  };
  for (const patient of context.existingPatients) {
    pushIndex(existingIndexes.labId, mapKey(patient.labId), patient.id);
    pushIndex(existingIndexes.nationalId, mapKey(patient.nationalId), patient.id);
    pushIndex(existingIndexes.phone, phoneKey(patient.phone), patient.id);
    pushIndex(
      existingIndexes.nameDob,
      `${mapKey(patient.name)}|${patient.dob}`,
      patient.id
    );
  }

  const validPatients = prepared
    .filter((item) => item.record?.type === "patients")
    .map((item) => ({
      rowNumber: item.row.rowNumber,
      data: item.record!.data as PatientImportData,
    }));
  const sourceIndexes = {
    labId: sourceRowsByKey(
      validPatients.map((item) => ({ rowNumber: item.rowNumber, key: mapKey(item.data.labId) }))
    ),
    nationalId: sourceRowsByKey(
      validPatients.map((item) => ({
        rowNumber: item.rowNumber,
        key: mapKey(item.data.nationalId || ""),
      }))
    ),
    phone: sourceRowsByKey(
      validPatients.map((item) => ({
        rowNumber: item.rowNumber,
        key: phoneKey(item.data.phone),
      }))
    ),
    nameDob: sourceRowsByKey(
      validPatients.map((item) => ({
        rowNumber: item.rowNumber,
        key: `${mapKey(item.data.name)}|${item.data.dob}`,
      }))
    ),
  };

  return prepared.map((item) => {
    if (!item.record || item.record.type !== "patients") {
      return {
        id: `row-${item.row.rowNumber}`,
        rowNumber: item.row.rowNumber,
        state: "attention",
        issues: item.issues,
        warnings: item.warnings,
        record: null,
        choice: "skip",
      };
    }

    const patient = item.record.data;
    const checks = [
      {
        label: "Lab ID",
        key: mapKey(patient.labId),
        existing: existingIndexes.labId,
        source: sourceIndexes.labId,
      },
      {
        label: "National ID",
        key: mapKey(patient.nationalId || ""),
        existing: existingIndexes.nationalId,
        source: sourceIndexes.nationalId,
      },
      {
        label: "Phone",
        key: phoneKey(patient.phone),
        existing: existingIndexes.phone,
        source: sourceIndexes.phone,
      },
      {
        label: "Name + date of birth",
        key: `${mapKey(patient.name)}|${patient.dob}`,
        existing: existingIndexes.nameDob,
        source: sourceIndexes.nameDob,
      },
    ];
    const matches = new Set<string>();
    const reasons: string[] = [];
    let sourceDuplicate = false;
    let unsafeLabId = false;

    for (const check of checks) {
      if (!check.key) continue;
      const existing = check.existing.get(check.key) || [];
      existing.forEach((id) => matches.add(id));
      if (existing.length > 0) reasons.push(`${check.label} matches an existing patient.`);
      const sourceRows = check.source.get(check.key) || [];
      if (sourceRows.length > 1) {
        sourceDuplicate = true;
        reasons.push(`${check.label} is repeated in spreadsheet rows ${sourceRows.join(", ")}.`);
      }
      if (check.label === "Lab ID" && (existing.length > 0 || sourceRows.length > 1)) {
        unsafeLabId = true;
      }
    }

    if (reasons.length === 0) {
      return {
        id: `row-${item.row.rowNumber}`,
        rowNumber: item.row.rowNumber,
        state: "ready",
        issues: [],
        warnings: item.warnings,
        record: item.record,
        choice: "new",
      };
    }

    const existingIds = [...matches];
    return {
      id: `row-${item.row.rowNumber}`,
      rowNumber: item.row.rowNumber,
      state: "duplicate",
      issues: [],
      warnings: item.warnings,
      record: item.record,
      duplicate: {
        reasons: [...new Set(reasons)],
        existingId: existingIds.length === 1 ? existingIds[0] : undefined,
        canUpdate: existingIds.length === 1 && !sourceDuplicate,
        canImportNew: !unsafeLabId,
      },
      choice: "skip",
    };
  });
}

function parseParameters(
  values: Record<string, string>,
  issues: string[],
  warnings: string[]
): TestParameter[] | null {
  if (values.parametersJson && values.parameterName) {
    issues.push("Map either Parameters JSON or a single parameter, not both.");
    return null;
  }
  if (values.parametersJson) {
    try {
      const parsed: unknown = JSON.parse(values.parametersJson);
      if (!Array.isArray(parsed) || parsed.length === 0) {
        issues.push("Parameters JSON must be a non-empty array.");
        return null;
      }
      const parameters: TestParameter[] = [];
      for (const value of parsed) {
        if (typeof value !== "object" || value === null || Array.isArray(value)) {
          issues.push("Each Parameters JSON entry must be an object.");
          return null;
        }
        const item = value as Record<string, unknown>;
        const name = normalizeText(cellToString(item.name));
        if (!name) {
          issues.push("Every parameter needs a name.");
          return null;
        }
        parameters.push({
          name,
          unit: normalizeText(cellToString(item.unit)),
          referenceRange: normalizeText(cellToString(item.referenceRange)),
        });
      }
      if (new Set(parameters.map((parameter) => mapKey(parameter.name))).size !== parameters.length) {
        issues.push("Parameter names must be unique within a test.");
        return null;
      }
      if (parameters.some((parameter) => !parameter.unit || !parameter.referenceRange)) {
        warnings.push("One or more parameter units or reference ranges will remain blank.");
      }
      return parameters;
    } catch {
      issues.push("Parameters JSON is not valid JSON.");
      return null;
    }
  }

  const name = normalizeText(values.parameterName || "");
  if (!name) {
    issues.push("A parameter name or Parameters JSON is required.");
    return null;
  }
  const unit = normalizeText(values.unit || "");
  const referenceRange = normalizeText(values.referenceRange || "");
  if (!unit || !referenceRange) {
    warnings.push("The parameter unit or reference range will remain blank.");
  }
  return [{ name, unit, referenceRange }];
}

function validateTestCatalog(
  rows: SpreadsheetRow[],
  mapping: Record<string, MappingTarget>,
  context: ValidationContext
): ValidatedImportRow[] {
  const prepared = rows.map((row) => {
    const values = mappedValues(row, mapping);
    const issues: string[] = [];
    const warnings: string[] = [];
    const code = normalizeText(values.code || "").toUpperCase();
    if (!/^[A-Z0-9][A-Z0-9_-]{0,31}$/.test(code)) {
      issues.push("Test code is missing or contains unsupported characters.");
    }
    const name = normalizeText(values.name || "");
    if (!name) issues.push("Test name is required.");
    const category = normalizeText(values.category || "");
    if (!category) issues.push("Category is required.");

    let price: number | undefined;
    if (values.price) {
      price = Number(values.price.replace(/,/g, ""));
      if (!Number.isFinite(price) || price < 0) issues.push("Price must be a non-negative number.");
    }
    const parameters = parseParameters(values, issues, warnings);
    const data: TestCatalogImportData | null =
      issues.length === 0 && parameters
        ? {
            code,
            name,
            category,
            parameters,
            ...(price !== undefined ? { price } : {}),
          }
        : null;
    return {
      row,
      issues,
      warnings,
      record: data
        ? ({
            type: "testCatalog",
            data,
            providedFields: providedFields(values),
          } satisfies ImportRecord)
        : null,
    };
  });

  const existingByCode = new Map<string, string[]>();
  context.existingTests.forEach((test) => pushIndex(existingByCode, mapKey(test.code), test.id));
  const sourceCodes = sourceRowsByKey(
    prepared
      .filter((item) => item.record?.type === "testCatalog")
      .map((item) => ({
        rowNumber: item.row.rowNumber,
        key: mapKey((item.record!.data as TestCatalogImportData).code),
      }))
  );

  return prepared.map((item) => {
    if (!item.record || item.record.type !== "testCatalog") {
      return {
        id: `row-${item.row.rowNumber}`,
        rowNumber: item.row.rowNumber,
        state: "attention",
        issues: item.issues,
        warnings: item.warnings,
        record: null,
        choice: "skip",
      };
    }
    const codeKey = mapKey(item.record.data.code);
    const existingIds = existingByCode.get(codeKey) || [];
    const repeatedRows = sourceCodes.get(codeKey) || [];
    const reasons: string[] = [];
    if (existingIds.length > 0) reasons.push("Test code matches an existing catalogue entry.");
    if (repeatedRows.length > 1) {
      reasons.push(`Test code is repeated in spreadsheet rows ${repeatedRows.join(", ")}.`);
    }
    if (reasons.length === 0) {
      return {
        id: `row-${item.row.rowNumber}`,
        rowNumber: item.row.rowNumber,
        state: "ready",
        issues: [],
        warnings: item.warnings,
        record: item.record,
        choice: "new",
      };
    }
    return {
      id: `row-${item.row.rowNumber}`,
      rowNumber: item.row.rowNumber,
      state: "duplicate",
      issues: [],
      warnings: [
        ...item.warnings,
        ...(existingIds.length === 1
          ? ["Updating replaces the existing name, category, and complete parameter definition."]
          : []),
      ],
      record: item.record,
      duplicate: {
        reasons,
        existingId: existingIds.length === 1 ? existingIds[0] : undefined,
        canUpdate: existingIds.length === 1 && repeatedRows.length === 1,
        canImportNew: false,
      },
      choice: "skip",
    };
  });
}

function splitTestCodes(value: string) {
  return [...new Set(value.split(/[,;|\n]+/).map((code) => normalizeText(code).toUpperCase()).filter(Boolean))];
}

function canonicalParameterName(test: ExistingTestRef, input: string) {
  return test.parameters.find((parameter) => mapKey(parameter.name) === mapKey(input))?.name;
}

function parseResults(
  values: Record<string, string>,
  tests: ExistingTestRef[],
  issues: string[]
): Record<string, Record<string, string>> | undefined {
  const hasSingleParameter = Boolean(values.resultParameter || values.resultValue);
  if (hasSingleParameter && (!values.resultParameter || !values.resultValue)) {
    issues.push("Single result parameter and value must both be supplied.");
  }
  if (values.resultsJson && hasSingleParameter) {
    issues.push("Use either Results JSON or the single result columns, not both.");
  }

  const result: Record<string, Record<string, string>> = {};
  if (values.resultsJson) {
    try {
      const parsed: unknown = JSON.parse(values.resultsJson);
      if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
        issues.push("Results JSON must be an object.");
        return undefined;
      }
      const source = parsed as Record<string, unknown>;
      const nested =
        tests.length > 1 ||
        Object.keys(source).some((key) => tests.some((test) => mapKey(test.code) === mapKey(key)));
      const byTest: Record<string, unknown> = nested ? source : { [tests[0]?.code || ""]: source };

      for (const [inputCode, rawParameters] of Object.entries(byTest)) {
        const test = tests.find((candidate) => mapKey(candidate.code) === mapKey(inputCode));
        if (!test) {
          issues.push(`Results JSON references unknown or unselected test code "${inputCode}".`);
          continue;
        }
        if (
          typeof rawParameters !== "object" ||
          rawParameters === null ||
          Array.isArray(rawParameters)
        ) {
          issues.push(`Results for ${test.code} must be an object of parameter values.`);
          continue;
        }
        const canonicalValues: Record<string, string> = {};
        for (const [inputParameter, rawValue] of Object.entries(
          rawParameters as Record<string, unknown>
        )) {
          const parameter = canonicalParameterName(test, inputParameter);
          if (!parameter) {
            issues.push(`"${inputParameter}" is not a parameter in test ${test.code}.`);
            continue;
          }
          if (
            typeof rawValue === "object" ||
            rawValue === null ||
            cellToString(rawValue) === ""
          ) {
            issues.push(`Result value for ${test.code} / ${parameter} is empty or invalid.`);
            continue;
          }
          canonicalValues[parameter] = cellToString(rawValue);
        }
        if (Object.keys(canonicalValues).length > 0) result[test.code] = canonicalValues;
      }
    } catch {
      issues.push("Results JSON is not valid JSON.");
    }
  } else if (hasSingleParameter && values.resultParameter && values.resultValue) {
    if (tests.length !== 1) {
      issues.push("Single result columns require exactly one test code.");
    } else {
      const test = tests[0];
      const parameter = canonicalParameterName(test, values.resultParameter);
      if (!parameter) {
        issues.push(`"${values.resultParameter}" is not a parameter in test ${test.code}.`);
      } else {
        result[test.code] = { [parameter]: normalizeText(values.resultValue) };
      }
    }
  }
  return Object.keys(result).length > 0 ? result : undefined;
}

function orderDuplicateKey(patientId: string, createdAt: string, testCodes: string[]) {
  return `${patientId}|${createdAt}|${[...testCodes].sort().join(",")}`;
}

function validateHistoricalOrders(
  rows: SpreadsheetRow[],
  mapping: Record<string, MappingTarget>,
  context: ValidationContext
): ValidatedImportRow[] {
  const patientIndexes = {
    labId: new Map<string, string[]>(),
    nationalId: new Map<string, string[]>(),
    phone: new Map<string, string[]>(),
  };
  const patientById = new Map(context.existingPatients.map((patient) => [patient.id, patient]));
  for (const patient of context.existingPatients) {
    pushIndex(patientIndexes.labId, mapKey(patient.labId), patient.id);
    pushIndex(patientIndexes.nationalId, mapKey(patient.nationalId), patient.id);
    pushIndex(patientIndexes.phone, phoneKey(patient.phone), patient.id);
  }

  const testsByCode = new Map<string, ExistingTestRef[]>();
  for (const test of context.existingTests) {
    testsByCode.set(mapKey(test.code), [...(testsByCode.get(mapKey(test.code)) || []), test]);
  }

  const prepared = rows.map((row) => {
    const values = mappedValues(row, mapping);
    const issues: string[] = [];
    const warnings: string[] = [];
    const suppliedPatientRefs = [
      {
        label: "Patient Lab ID",
        value: values.patientLabId || "",
        key: mapKey(values.patientLabId || ""),
        index: patientIndexes.labId,
      },
      {
        label: "Patient National ID",
        value: values.patientNationalId || "",
        key: mapKey(values.patientNationalId || ""),
        index: patientIndexes.nationalId,
      },
      {
        label: "Patient phone",
        value: values.patientPhone || "",
        key: phoneKey(values.patientPhone || ""),
        index: patientIndexes.phone,
      },
    ].filter((reference) => reference.value.trim() !== "");

    if (suppliedPatientRefs.length === 0) {
      issues.push("At least one patient identifier is required.");
    }
    const patientIds = new Set<string>();
    for (const reference of suppliedPatientRefs) {
      const matches = reference.index.get(reference.key) || [];
      if (matches.length === 0) {
        issues.push(`${reference.label} does not match a patient in this clinic.`);
      } else if (matches.length > 1) {
        issues.push(`${reference.label} matches more than one patient in this clinic.`);
      } else {
        patientIds.add(matches[0]);
      }
    }
    if (patientIds.size > 1) {
      issues.push("The supplied patient identifiers resolve to different patient records.");
    }
    const patient = patientIds.size === 1 ? patientById.get([...patientIds][0]) : undefined;

    const inputCodes = splitTestCodes(values.testCodes || "");
    if (inputCodes.length === 0) issues.push("At least one test code is required.");
    const tests: ExistingTestRef[] = [];
    for (const code of inputCodes) {
      const matches = testsByCode.get(mapKey(code)) || [];
      if (matches.length === 0) {
        issues.push(`Test code ${code} is not in this clinic's catalogue.`);
      } else if (matches.length > 1) {
        issues.push(`Test code ${code} is duplicated in this clinic's catalogue.`);
      } else {
        tests.push(matches[0]);
      }
    }

    const createdAt = parseTimestamp(values.createdAt || "");
    if (!createdAt) issues.push("Order date/time is required and must be valid.");
    if (createdAt && isFuture(createdAt, context.now)) issues.push("Order date/time is in the future.");

    const status = normalizeStatus(values.status || "");
    if (!status) {
      issues.push("Status must be Pending, Results entered, Approved, or Needs correction.");
    }

    const sampleCollectedAt = values.sampleCollectedAt
      ? parseTimestamp(values.sampleCollectedAt)
      : null;
    if (values.sampleCollectedAt && !sampleCollectedAt) {
      issues.push("Sample collection date/time is invalid.");
    }
    if (sampleCollectedAt && isFuture(sampleCollectedAt, context.now)) {
      issues.push("Sample collection date/time is in the future.");
    }
    if (values.sampleCollectedBy && !sampleCollectedAt) {
      issues.push("Sample collected by requires a sample collection timestamp.");
    }

    const results = tests.length === inputCodes.length ? parseResults(values, tests, issues) : undefined;
    const resultsEnteredAt = values.resultsEnteredAt
      ? parseTimestamp(values.resultsEnteredAt)
      : null;
    if (values.resultsEnteredAt && !resultsEnteredAt) {
      issues.push("Results entered date/time is invalid.");
    }
    const reviewedAt = values.reviewedAt ? parseTimestamp(values.reviewedAt) : null;
    if (values.reviewedAt && !reviewedAt) issues.push("Reviewed date/time is invalid.");

    if (status === "pending") {
      if (results || values.resultsEnteredAt || values.resultsEnteredBy) {
        issues.push("Pending orders cannot include entered results or result-entry audit fields.");
      }
      if (values.reviewedAt || values.reviewedBy || values.reviewNotes) {
        issues.push("Pending orders cannot include review fields.");
      }
    }
    if (status && status !== "pending") {
      if (!results) issues.push("This result status requires at least one validated result value.");
      if (!resultsEnteredAt || !values.resultsEnteredBy) {
        issues.push("This result status requires Results entered by and Results entered date/time.");
      }
    }
    if (status === "results_entered" && (values.reviewedAt || values.reviewedBy)) {
      issues.push("Results entered status cannot include completed review audit fields.");
    }
    if (status === "approved" || status === "needs_correction") {
      if (!reviewedAt || !values.reviewedBy) {
        issues.push("Approved and Needs correction statuses require Reviewed by and Reviewed date/time.");
      }
    }
    if (resultsEnteredAt && createdAt && resultsEnteredAt < createdAt) {
      issues.push("Results entered date/time cannot be before the order date/time.");
    }
    if (reviewedAt && resultsEnteredAt && reviewedAt < resultsEnteredAt) {
      issues.push("Reviewed date/time cannot be before results were entered.");
    }
    if (resultsEnteredAt && isFuture(resultsEnteredAt, context.now)) {
      issues.push("Results entered date/time is in the future.");
    }
    if (reviewedAt && isFuture(reviewedAt, context.now)) {
      issues.push("Reviewed date/time is in the future.");
    }

    const data: HistoricalOrderImportData | null =
      issues.length === 0 && patient && createdAt && status
        ? {
            patientId: patient.id,
            patientName: patient.name,
            patientLabId: patient.labId,
            tests: tests.map((test) => ({ code: test.code, name: test.name })),
            status,
            createdAt,
            ...(sampleCollectedAt ? { sampleCollectedAt } : {}),
            ...(values.sampleCollectedBy
              ? { sampleCollectedBy: normalizeText(values.sampleCollectedBy) }
              : {}),
            ...(results ? { results } : {}),
            ...(values.resultsEnteredBy
              ? { resultsEnteredBy: normalizeText(values.resultsEnteredBy) }
              : {}),
            ...(resultsEnteredAt ? { resultsEnteredAt } : {}),
            ...(values.reviewedBy ? { reviewedBy: normalizeText(values.reviewedBy) } : {}),
            ...(reviewedAt ? { reviewedAt } : {}),
            ...(values.reviewNotes ? { reviewNotes: normalizeText(values.reviewNotes) } : {}),
          }
        : null;
    if (status === "pending" && !sampleCollectedAt) {
      warnings.push("This order will appear as Awaiting sample.");
    }
    return {
      row,
      issues,
      warnings,
      record: data
        ? ({
            type: "historicalOrders",
            data,
            providedFields: providedFields(values),
          } satisfies ImportRecord)
        : null,
    };
  });

  const existingByKey = new Map<string, string[]>();
  context.existingOrders.forEach((order) =>
    pushIndex(
      existingByKey,
      orderDuplicateKey(order.patientId, order.createdAt, order.testCodes),
      order.id
    )
  );
  const sourceByKey = sourceRowsByKey(
    prepared
      .filter((item) => item.record?.type === "historicalOrders")
      .map((item) => {
        const data = item.record!.data as HistoricalOrderImportData;
        return {
          rowNumber: item.row.rowNumber,
          key: orderDuplicateKey(
            data.patientId,
            data.createdAt,
            data.tests.map((test) => test.code)
          ),
        };
      })
  );

  return prepared.map((item) => {
    if (!item.record || item.record.type !== "historicalOrders") {
      return {
        id: `row-${item.row.rowNumber}`,
        rowNumber: item.row.rowNumber,
        state: "attention",
        issues: item.issues,
        warnings: item.warnings,
        record: null,
        choice: "skip",
      };
    }
    const key = orderDuplicateKey(
      item.record.data.patientId,
      item.record.data.createdAt,
      item.record.data.tests.map((test) => test.code)
    );
    const existingIds = existingByKey.get(key) || [];
    const repeatedRows = sourceByKey.get(key) || [];
    const reasons: string[] = [];
    if (existingIds.length > 0) {
      reasons.push("Patient, order time, and test codes match an existing order.");
    }
    if (repeatedRows.length > 1) {
      reasons.push(
        `Patient, order time, and test codes repeat in spreadsheet rows ${repeatedRows.join(", ")}.`
      );
    }
    if (reasons.length === 0) {
      return {
        id: `row-${item.row.rowNumber}`,
        rowNumber: item.row.rowNumber,
        state: "ready",
        issues: [],
        warnings: item.warnings,
        record: item.record,
        choice: "new",
      };
    }
    return {
      id: `row-${item.row.rowNumber}`,
      rowNumber: item.row.rowNumber,
      state: "duplicate",
      issues: [],
      warnings: item.warnings,
      record: item.record,
      duplicate: {
        reasons,
        existingId: existingIds.length === 1 ? existingIds[0] : undefined,
        canUpdate: false,
        canImportNew: true,
      },
      choice: "skip",
    };
  });
}

export function validateImportRows(
  dataType: MigrationDataType,
  rows: SpreadsheetRow[],
  mapping: Record<string, MappingTarget>,
  context: ValidationContext
): ValidatedImportRow[] {
  if (dataType === "patients") return validatePatients(rows, mapping, context);
  if (dataType === "testCatalog") return validateTestCatalog(rows, mapping, context);
  return validateHistoricalOrders(rows, mapping, context);
}

export function getValidationSummary(rows: ValidatedImportRow[]): ValidationSummary {
  const importable = rows.filter(
    (row) =>
      row.state === "ready" ||
      (row.state === "duplicate" && (row.choice === "new" || row.choice === "update"))
  ).length;
  return {
    total: rows.length,
    ready: importable,
    duplicates: rows.filter((row) => row.state === "duplicate").length,
    attention: rows.filter((row) => row.state === "attention").length,
    skipped: rows.length - importable,
  };
}
