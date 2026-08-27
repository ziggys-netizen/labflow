import { canReleaseStatus } from "./orderLifecycle";

/**
 * Daily aggregate of tests counted at result release. Catalogue price is the
 * implied value. This is management information, not a book of account —
 * never labelled revenue or income, and it is not an invoice.
 *
 * Accounts officers read this collection only. Documents must not carry
 * patient identifiers, names, order ids, or result values.
 */

export const DAILY_TEST_VALUE_ROLLUPS = "dailyTestValueRollups";

export const VALUE_OF_TESTS_ORDERED_LABEL = "Value of tests ordered";

export const ROLLUP_ALLOWED_KEYS = [
  "clinicId",
  "date",
  "testCount",
  "valueOfTestsOrdered",
  "byTest",
  "updatedAt",
] as const;

export const ROLLUP_LINE_ALLOWED_KEYS = ["code", "name", "count", "value"] as const;

export const ROLLUP_PATIENT_LINKED_KEYS = [
  "patientId",
  "patientLabId",
  "patientName",
  "name",
  "labId",
  "orderId",
  "orderIds",
  "results",
  "phone",
  "nationalId",
  "sex",
  "dob",
] as const;

export type RollupLine = {
  code: string;
  name: string;
  count: number;
  value: number;
};

export type RollupContribution = {
  clinicId: string;
  date: string;
  testCount: number;
  valueOfTestsOrdered: number;
  lines: RollupLine[];
};

export type DailyTestValueRollup = {
  id: string;
  clinicId: string;
  date: string;
  testCount: number;
  valueOfTestsOrdered: number;
  byTest: RollupLine[];
  updatedAt: string | null;
};

export function localDateKey(at: Date = new Date()): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())}`;
}

export function rollupDocumentId(clinicId: string, dateKey: string): string {
  return `${clinicId}_${dateKey}`;
}

export function catalogPriceIndex(
  catalog: { code?: string; name?: string; price?: unknown }[]
): Record<string, { price: number; name: string }> {
  const out: Record<string, { price: number; name: string }> = {};
  for (const row of catalog) {
    const code = typeof row.code === "string" ? row.code.trim() : "";
    if (!code) continue;
    const raw = typeof row.price === "number" ? row.price : Number(row.price);
    const price = Number.isFinite(raw) && raw > 0 ? raw : 0;
    const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : code;
    out[code] = { price, name };
  }
  return out;
}

function asFiniteNumber(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return value;
}

function hasPatientLinkedKey(keys: Iterable<string>): boolean {
  const forbidden = new Set<string>(ROLLUP_PATIENT_LINKED_KEYS);
  for (const key of keys) {
    if (forbidden.has(key)) return true;
  }
  return false;
}

/** True when a payload could identify a patient or an order. */
export function rollupHasPatientLinkedFields(data: Record<string, unknown> | null | undefined): boolean {
  if (!data) return false;
  if (hasPatientLinkedKey(Object.keys(data))) return true;
  const byTest = data.byTest;
  if (byTest && typeof byTest === "object" && !Array.isArray(byTest)) {
    for (const entry of Object.values(byTest as Record<string, unknown>)) {
      if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;
      if (hasPatientLinkedKey(Object.keys(entry as Record<string, unknown>))) return true;
    }
  }
  return false;
}

/**
 * Tests delivered at first release of an order. Rejected / cancelled /
 * unreleased orders contribute nothing. A recollection of an episode that
 * already carried a charge contributes nothing (one patient, one episode,
 * one charge). A recollection after a rejected sample is the delivered test
 * and does count.
 */
export function releasedOrderContribution(input: {
  clinicId: string;
  releasedAt: Date;
  fromStatus: string | null | undefined;
  tests: { code?: string; name?: string }[] | null | undefined;
  recollectionOfOrderId?: string | null;
  episodeAlreadyCharged?: boolean | null;
  valueRollupAppliedAt?: string | null;
  prices: Record<string, { price: number; name: string }>;
}): RollupContribution | null {
  const clinicId = input.clinicId.trim();
  if (!clinicId) return null;
  if (input.valueRollupAppliedAt) return null;
  if (input.fromStatus === "rejected" || input.fromStatus === "cancelled") return null;
  if (!canReleaseStatus(input.fromStatus)) return null;
  if (input.recollectionOfOrderId && input.episodeAlreadyCharged) return null;

  const linesByCode = new Map<string, RollupLine>();
  for (const test of input.tests || []) {
    const code = typeof test.code === "string" ? test.code.trim() : "";
    if (!code) continue;
    const priced = input.prices[code];
    const name =
      typeof test.name === "string" && test.name.trim()
        ? test.name.trim()
        : priced?.name || code;
    const price = priced?.price ?? 0;
    const current = linesByCode.get(code);
    if (current) {
      current.count += 1;
      current.value += price;
      continue;
    }
    linesByCode.set(code, { code, name, count: 1, value: price });
  }

  const lines = [...linesByCode.values()].sort((a, b) => a.code.localeCompare(b.code));
  if (lines.length === 0) return null;

  return {
    clinicId,
    date: localDateKey(input.releasedAt),
    testCount: lines.reduce((sum, line) => sum + line.count, 0),
    valueOfTestsOrdered: lines.reduce((sum, line) => sum + line.value, 0),
    lines,
  };
}

export function rollupMergeFields(
  contribution: RollupContribution,
  updatedAt: string,
  increment: (n: number) => unknown
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    clinicId: contribution.clinicId,
    date: contribution.date,
    testCount: increment(contribution.testCount),
    valueOfTestsOrdered: increment(contribution.valueOfTestsOrdered),
    updatedAt,
  };
  for (const line of contribution.lines) {
    data[`byTest.${line.code}.code`] = line.code;
    data[`byTest.${line.code}.name`] = line.name;
    data[`byTest.${line.code}.count`] = increment(line.count);
    data[`byTest.${line.code}.value`] = increment(line.value);
  }
  return data;
}

function parseLine(code: string, raw: unknown): RollupLine | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const row = raw as Record<string, unknown>;
  const count = asFiniteNumber(row.count);
  const value = asFiniteNumber(row.value);
  if (count === null || value === null) return null;
  const lineCode = typeof row.code === "string" && row.code.trim() ? row.code.trim() : code;
  const name = typeof row.name === "string" && row.name.trim() ? row.name.trim() : lineCode;
  return { code: lineCode, name, count, value };
}

export function parseDailyTestValueRollup(
  id: string,
  data: Record<string, unknown> | undefined
): DailyTestValueRollup | null {
  if (!data) return null;
  const clinicId = typeof data.clinicId === "string" ? data.clinicId : "";
  const date = typeof data.date === "string" ? data.date : "";
  if (!clinicId || !date) return null;
  const testCount = asFiniteNumber(data.testCount) ?? 0;
  const valueOfTestsOrdered = asFiniteNumber(data.valueOfTestsOrdered) ?? 0;
  const byTestRaw = data.byTest;
  const byTest: RollupLine[] = [];
  if (byTestRaw && typeof byTestRaw === "object" && !Array.isArray(byTestRaw)) {
    for (const [code, entry] of Object.entries(byTestRaw as Record<string, unknown>)) {
      const line = parseLine(code, entry);
      if (line) byTest.push(line);
    }
    byTest.sort((a, b) => a.code.localeCompare(b.code));
  }
  return {
    id,
    clinicId,
    date,
    testCount,
    valueOfTestsOrdered,
    byTest,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : null,
  };
}

export function formatTestValue(value: number): string {
  return value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
