import { AssignableRole, isAssignableRole, isShift, roleRequiresShift, Shift } from "./permissions";

export const PREAPPROVAL_DAYS = 90;

export const PREAPPROVAL_STATUSES = ["pending", "consumed", "lapsed"] as const;
export type PreApprovalStatus = (typeof PREAPPROVAL_STATUSES)[number];

export interface PreApproval {
  id: string;
  clinicId: string;
  email: string;
  role: AssignableRole;
  shift: Shift | null;
  createdAt: string;
  createdByUid: string | null;
  createdByEmail: string | null;
  expiresAt: string;
  status: PreApprovalStatus;
  consumedByUid: string | null;
  consumedAt: string | null;
}

export interface PreApprovalInputRow {
  email: string;
  role: string;
  shift: string;
}

export function normalizeStaffEmail(email: string | null | undefined) {
  return (email || "").trim().toLowerCase();
}

export function preApprovalExpiry(from = new Date()) {
  return new Date(from.getTime() + PREAPPROVAL_DAYS * 24 * 60 * 60 * 1000).toISOString();
}

export function parsePreApprovalRole(value: string): AssignableRole | null {
  const trimmed = value.trim().toLowerCase().replace(/\s+/g, "_");
  if (!trimmed || trimmed === "owner") return null;
  if (isAssignableRole(trimmed)) return trimmed;
  return null;
}

export function parsePreApprovalShift(value: string): Shift | null {
  const trimmed = value.trim().toLowerCase().replace(/\s+/g, "_");
  if (!trimmed) return null;
  if (isShift(trimmed)) return trimmed;
  return null;
}

export function isEmailAddress(email: string) {
  return email.includes("@") && email.length > 3;
}

export function validatePreApprovalDraft(input: {
  email: string;
  role: string;
  shift?: string | null;
}): { email: string; role: AssignableRole; shift: Shift | null } {
  const email = normalizeStaffEmail(input.email);
  if (!email || !isEmailAddress(email)) {
    throw new Error("Enter a valid email address.");
  }
  const roleRaw = input.role.trim().toLowerCase().replace(/\s+/g, "_");
  if (roleRaw === "owner") {
    throw new Error("The owner role cannot be pre-approved.");
  }
  const role = parsePreApprovalRole(input.role);
  if (!role) {
    throw new Error("Choose a valid staff role. The owner role cannot be pre-approved.");
  }
  if (roleRequiresShift(role)) {
    const shift = parsePreApprovalShift(String(input.shift || ""));
    if (!shift) throw new Error("Shift Supervisor requires a shift.");
    return { email, role, shift };
  }
  return { email, role, shift: null };
}

function cellToString(value: unknown) {
  if (value == null) return "";
  if (typeof value === "string") return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  if (value instanceof Date && !Number.isNaN(value.getTime())) return value.toISOString();
  return String(value).trim();
}

function headerKey(header: string) {
  return header.trim().toLowerCase().replace(/[^a-z0-9]+/g, "_");
}

function pickColumn(headers: string[], ...needles: string[]) {
  for (const header of headers) {
    const key = headerKey(header);
    if (needles.some((needle) => key === needle || key.includes(needle))) return header;
  }
  return null;
}

export function parsePreApprovalRows(text: string): PreApprovalInputRow[] {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  const rows: PreApprovalInputRow[] = [];
  for (const line of lines) {
    const parts = line.split(/[,;\t]/).map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length < 2) continue;
    const header = `${parts[0]} ${parts[1]}`.toLowerCase();
    if (header.includes("email") && header.includes("role")) continue;
    rows.push({
      email: parts[0],
      role: parts[1],
      shift: parts[2] || "",
    });
  }
  return rows;
}

export function mapPreApprovalSheet(
  headers: string[],
  records: Record<string, string>[]
): PreApprovalInputRow[] {
  const emailHeader = pickColumn(headers, "email", "e_mail");
  const roleHeader = pickColumn(headers, "role", "intended_role");
  const shiftHeader = pickColumn(headers, "shift");
  if (!emailHeader || !roleHeader) {
    throw new Error("The spreadsheet needs Email and Role columns.");
  }
  return records.map((record) => ({
    email: record[emailHeader] || "",
    role: record[roleHeader] || "",
    shift: shiftHeader ? record[shiftHeader] || "" : "",
  }));
}

export async function parsePreApprovalSpreadsheet(file: File): Promise<PreApprovalInputRow[]> {
  const name = file.name.toLowerCase();
  if (!name.endsWith(".xlsx") && !name.endsWith(".xlsm") && !name.endsWith(".csv")) {
    throw new Error("Choose an .xlsx, .xlsm, or .csv file.");
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
  const headers = matrix[headerIndex].map((cell, index) => cellToString(cell) || `Column ${index + 1}`);
  const records: Record<string, string>[] = [];
  for (let index = headerIndex + 1; index < matrix.length; index += 1) {
    const source = matrix[index] || [];
    const values: Record<string, string> = {};
    let hasValue = false;
    headers.forEach((header, columnIndex) => {
      const value = cellToString(source[columnIndex]);
      values[header] = value;
      if (value !== "") hasValue = true;
    });
    if (hasValue) records.push(values);
  }
  if (records.length === 0) throw new Error("The first worksheet has headers but no data rows.");
  return mapPreApprovalSheet(headers, records);
}

export function preApprovalFromData(
  id: string,
  data: Record<string, unknown>
): PreApproval | null {
  const role = parsePreApprovalRole(String(data.role || ""));
  if (!role) return null;
  const consumedAt =
    (typeof data.consumedAt === "string" && data.consumedAt) ||
    (typeof data.usedAt === "string" && data.usedAt) ||
    null;
  const statusRaw = typeof data.status === "string" ? data.status : "";
  let status: PreApprovalStatus = "pending";
  if (statusRaw === "consumed" || statusRaw === "lapsed" || statusRaw === "pending") {
    status = statusRaw;
  } else if (consumedAt) {
    status = "consumed";
  }
  return {
    id,
    clinicId: typeof data.clinicId === "string" ? data.clinicId : "",
    email: normalizeStaffEmail(typeof data.email === "string" ? data.email : ""),
    role,
    shift: parsePreApprovalShift(typeof data.shift === "string" ? data.shift : ""),
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    createdByUid: typeof data.createdByUid === "string" ? data.createdByUid : null,
    createdByEmail: typeof data.createdByEmail === "string" ? data.createdByEmail : null,
    expiresAt: typeof data.expiresAt === "string" ? data.expiresAt : "",
    status,
    consumedByUid:
      (typeof data.consumedByUid === "string" && data.consumedByUid) ||
      (typeof data.usedByUid === "string" && data.usedByUid) ||
      null,
    consumedAt,
  };
}

export function expiresAtMs(expiresAt: string | undefined) {
  const ms = Date.parse(String(expiresAt || ""));
  return Number.isFinite(ms) ? ms : NaN;
}

export function isPendingUnexpired(
  data: {
    status?: unknown;
    consumedAt?: unknown;
    consumedByUid?: unknown;
    usedAt?: unknown;
    expiresAt?: unknown;
  },
  now = Date.now()
) {
  if (data.consumedAt || data.consumedByUid || data.usedAt) return false;
  const status = String(data.status || "pending");
  if (status !== "pending") return false;
  const expires = expiresAtMs(typeof data.expiresAt === "string" ? data.expiresAt : "");
  return Number.isFinite(expires) && expires > now;
}
