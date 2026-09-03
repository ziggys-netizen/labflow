import {
  normalizeParameter,
  type ResultFlag,
  type TestParameter,
} from "./resultModel";

export type { ResultFlag } from "./resultModel";

/** Adult reference intervals apply on or after the 18th birthday. */
export const ADULT_AGE_YEARS = 18;

export type ResultFlagContext = {
  sex?: string | null;
  dob?: string | null;
  /** Estimated age in years when DOB is unknown. Stored on the patient as `ageYears`. */
  ageYears?: number | null;
  now?: Date;
};

export const HL_SUPPRESSION = {
  paediatric: "paediatric; interpret against age-appropriate reference range",
  ageNotRecorded: "age not recorded; adult interval not applied",
  sexNotMf: "sex not M or F; adult interval not applied",
  noIntervalForSex: "no parsable interval for this sex",
} as const;

export type FlagArg = string | null | ResultFlagContext;

function parseNumeric(raw: string): number | null {
  const text = raw.trim().replace(/,/g, "");
  if (!text || text === "—" || text === "-" || text === "–") return null;
  if (/^\d+:\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function sexKey(sex: string | null | undefined): "M" | "F" | null {
  const normalized = (sex || "").trim().toLowerCase();
  if (normalized === "m" || normalized === "male") return "M";
  if (normalized === "f" || normalized === "female") return "F";
  return null;
}

function asFlagContext(sexOrCtx?: FlagArg): ResultFlagContext {
  if (sexOrCtx && typeof sexOrCtx === "object") return sexOrCtx;
  return { sex: sexOrCtx ?? null };
}

/**
 * Calendar YYYY-MM-DD from a stored DOB. Time suffixes are ignored.
 * Impossible dates (2026-02-31) and non-ISO values are unparseable.
 */
function parseDobYmd(dob: string | null | undefined): string | null {
  if (!dob || typeof dob !== "string") return null;
  const ymd = dob.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const parsed = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== ymd) return null;
  return ymd;
}

/** Finite estimated age from a patient `ageYears` field (number or numeric string). */
export function parseAgeYears(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const years = Number(value.trim());
    return Number.isFinite(years) ? years : null;
  }
  return null;
}

/**
 * Whether the adult interval may be used.
 * A parseable DOB takes precedence: true on/after the 18th birthday
 * (local calendar of `now`), false if younger.
 * If DOB is missing or unparseable, estimated `ageYears` counts: true when
 * `ageYears >= 18`, false when recorded and under 18.
 * Null only when neither a usable DOB nor ageYears is present.
 */
export function isAdultForReferenceRange(
  dob: string | null | undefined,
  now: Date = new Date(),
  ageYears?: number | null
): boolean | null {
  const ymd = parseDobYmd(dob);
  if (ymd) {
    const [year, month, day] = ymd.split("-").map(Number);
    const eighteenth = new Date(year + ADULT_AGE_YEARS, month - 1, day);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const birthday = new Date(eighteenth.getFullYear(), eighteenth.getMonth(), eighteenth.getDate());
    return today.getTime() >= birthday.getTime();
  }
  const years = parseAgeYears(ageYears);
  if (years !== null) return years >= ADULT_AGE_YEARS;
  return null;
}

function sexSplitParts(referenceRange: string): { male?: string; female?: string } {
  const male = referenceRange.match(/M:\s*([^,]+)/i)?.[1];
  const female = referenceRange.match(/F:\s*([^,]+)/i)?.[1];
  return { male, female };
}

function isSexSplitRange(referenceRange: string): boolean {
  const { male, female } = sexSplitParts(referenceRange);
  return Boolean(male || female);
}

function rangeTextForSex(referenceRange: string, sex: string | null | undefined): string | null {
  const { male, female } = sexSplitParts(referenceRange);
  if (!male && !female) return referenceRange;
  const key = sexKey(sex);
  if (key === "M" && male) return male;
  if (key === "F" && female) return female;
  return null;
}

function parseBounds(
  text: string
): { low: number | null; high: number | null; highInclusive: boolean; lowInclusive: boolean } | null {
  if (/\d+:\d+/.test(text)) return null;
  const cleaned = text.replace(/\(.*?\)/g, " ").trim();
  const between = cleaned.match(/(-?\d+(?:\.\d+)?)\s*(?:[-–—]|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (between) {
    return {
      low: Number(between[1]),
      high: Number(between[2]),
      highInclusive: true,
      lowInclusive: true,
    };
  }
  const lte = cleaned.match(/≤\s*(-?\d+(?:\.\d+)?)/);
  if (lte) return { low: null, high: Number(lte[1]), highInclusive: true, lowInclusive: true };
  const lt = cleaned.match(/<\s*(-?\d+(?:\.\d+)?)/);
  if (lt) return { low: null, high: Number(lt[1]), highInclusive: false, lowInclusive: true };
  const gte = cleaned.match(/≥\s*(-?\d+(?:\.\d+)?)/);
  if (gte) return { low: Number(gte[1]), high: null, highInclusive: true, lowInclusive: true };
  const gt = cleaned.match(/>\s*(-?\d+(?:\.\d+)?)/);
  if (gt) return { low: Number(gt[1]), high: null, highInclusive: true, lowInclusive: false };
  return null;
}

/**
 * Why the adult H/L interval is not applied. Null when it may be applied
 * (adult by DOB or ageYears). Sex M/F is required only for a sex-split
 * interval (`M:` / `F:`); an unsplit range such as "12-16" applies regardless of sex.
 */
export function hlSuppressionReason(
  sexOrCtx: FlagArg | undefined,
  referenceRange?: string | null
): string | null {
  const ctx = asFlagContext(sexOrCtx);
  const adult = isAdultForReferenceRange(ctx.dob, ctx.now, ctx.ageYears);
  if (adult === null) return HL_SUPPRESSION.ageNotRecorded;
  if (!adult) return HL_SUPPRESSION.paediatric;
  const range = referenceRange ?? "";
  const sexSplit = isSexSplitRange(range);
  if (sexSplit && !sexKey(ctx.sex)) return HL_SUPPRESSION.sexNotMf;
  if (!range.trim()) return null;
  const selected = rangeTextForSex(range, ctx.sex);
  if (selected === null) return HL_SUPPRESSION.noIntervalForSex;
  if (!parseBounds(selected)) {
    return sexSplit ? HL_SUPPRESSION.noIntervalForSex : null;
  }
  return null;
}

export function parameterHlSuppressionReason(
  value: string | number | null | undefined,
  parameter: TestParameter | null | undefined,
  sexOrCtx?: FlagArg
): string | null {
  if (!parameter) return null;
  const raw = value === null || value === undefined ? "" : String(value);
  if (!raw.trim()) return null;
  const normalized = normalizeParameter(parameter);
  if (normalized.resultType !== "numeric" && normalized.resultType !== "calculated") return null;
  return hlSuppressionReason(sexOrCtx, normalized.referenceRange);
}

function numericHl(
  value: string | number | null | undefined,
  referenceRange: string | null | undefined,
  sexOrCtx?: FlagArg
): ResultFlag {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? (Number.isFinite(value) ? value : null) : parseNumeric(String(value));
  if (numeric === null) return null;
  if (!referenceRange || !referenceRange.trim()) return null;
  if (hlSuppressionReason(sexOrCtx, referenceRange)) return null;
  const ctx = asFlagContext(sexOrCtx);
  const selected = rangeTextForSex(referenceRange, ctx.sex);
  if (selected === null) return null;
  const bounds = parseBounds(selected);
  if (!bounds) return null;
  if (bounds.low !== null) {
    if (bounds.lowInclusive ? numeric < bounds.low : numeric <= bounds.low) return "L";
  }
  if (bounds.high !== null) {
    if (bounds.highInclusive ? numeric > bounds.high : numeric >= bounds.high) return "H";
  }
  return null;
}

function numericCritical(
  value: string | number | null | undefined,
  parameter: TestParameter
): boolean {
  const numeric = typeof value === "number" ? (Number.isFinite(value) ? value : null) : parseNumeric(String(value ?? ""));
  if (numeric === null) return false;
  if (parameter.criticalLow != null && numeric <= parameter.criticalLow) return true;
  if (parameter.criticalHigh != null && numeric >= parameter.criticalHigh) return true;
  return false;
}

/**
 * High / low flag against a catalogue reference range.
 * Missing values, non-numeric results, unparseable ranges, paediatric or
 * unrecorded age, and (for sex-split intervals only) sex other than M/F do not flag.
 */
export function resultFlag(
  value: string | number | null | undefined,
  referenceRange: string | null | undefined,
  sexOrCtx?: FlagArg
): ResultFlag {
  return numericHl(value, referenceRange, sexOrCtx);
}

/**
 * Type-aware flag. Qualitative/semi-quantitative use the value set.
 * Text never flags. Critical ("C") outranks H/L/A and is not gated on age.
 */
export function parameterFlag(
  value: string | number | null | undefined,
  parameter: TestParameter | null | undefined,
  sexOrCtx?: FlagArg
): ResultFlag {
  if (!parameter) return resultFlag(value, undefined, sexOrCtx);
  const normalized = normalizeParameter(parameter);
  const raw = value === null || value === undefined ? "" : String(value);
  if (!raw.trim()) return null;

  if (normalized.resultType === "text") return null;

  if (normalized.resultType === "qualitative" || normalized.resultType === "semi_quantitative") {
    const match = normalized.valueSet?.find((item) => item.value === raw);
    if (!match) return null;
    if (match.critical) return "C";
    if (normalized.resultType === "semi_quantitative" && normalized.abnormalFromIndex != null) {
      const index = normalized.valueSet?.findIndex((item) => item.value === raw) ?? -1;
      if (index >= normalized.abnormalFromIndex) return match.critical ? "C" : "A";
    }
    if (match.abnormal) return "A";
    return null;
  }

  if (normalized.resultType === "numeric" || normalized.resultType === "calculated") {
    if (numericCritical(value, normalized)) return "C";
    return numericHl(value, normalized.referenceRange, sexOrCtx);
  }

  return numericHl(value, normalized.referenceRange, sexOrCtx);
}

export function isCriticalFlag(flag: ResultFlag): boolean {
  return flag === "C";
}

/**
 * True when the catalogue range can be compared to a numeric result.
 * Titres (`1:80`), qualitative strings, and empty ranges are not parseable —
 * callers must not invent H/L flags for them.
 */
export function isParseableNumericRange(referenceRange: string | null | undefined): boolean {
  if (!referenceRange || !referenceRange.trim()) return false;
  if (/\d+:\d+/.test(referenceRange)) return false;
  const male = referenceRange.match(/M:\s*([^,]+)/i);
  const female = referenceRange.match(/F:\s*([^,]+)/i);
  if (male || female) {
    const parts = [male?.[1], female?.[1]].filter((part): part is string => Boolean(part));
    return parts.some((part) => parseBounds(part) !== null);
  }
  return parseBounds(referenceRange) !== null;
}

export function orderHasAbnormalResults(
  tests: { code: string }[],
  results: Record<string, Record<string, string>> | null | undefined,
  catalog: { code: string; parameters: TestParameter[] }[],
  sexOrCtx?: FlagArg
): boolean {
  if (!results) return false;
  for (const test of tests) {
    const definition = catalog.find((row) => row.code === test.code);
    if (!definition) continue;
    const values = results[test.code] || {};
    for (const parameter of definition.parameters) {
      if (parameterFlag(values[parameter.name], parameter, sexOrCtx)) return true;
    }
  }
  return false;
}

export function orderHasCriticalResults(
  tests: { code: string }[],
  results: Record<string, Record<string, string>> | null | undefined,
  catalog: { code: string; parameters: TestParameter[] }[],
  sexOrCtx?: FlagArg
): boolean {
  if (!results) return false;
  for (const test of tests) {
    const definition = catalog.find((row) => row.code === test.code);
    if (!definition) continue;
    const values = results[test.code] || {};
    for (const parameter of definition.parameters) {
      if (parameterFlag(values[parameter.name], parameter, sexOrCtx) === "C") return true;
    }
  }
  return false;
}
