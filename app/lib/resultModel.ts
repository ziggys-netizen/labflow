/**
 * Result data model (PRD v0.4 §6.2).
 *
 * A catalogue parameter carries a resultType. Numeric H/L flags must not run
 * on qualitative malaria films. Legacy rows without resultType are inferred.
 */

export const RESULT_TYPES = [
  "numeric",
  "qualitative",
  "semi_quantitative",
  "text",
  "calculated",
] as const;

export type ResultType = (typeof RESULT_TYPES)[number];

export const CLINIC_TIERS = ["primary", "secondary", "tertiary"] as const;

export type ClinicTier = (typeof CLINIC_TIERS)[number];

export const CLINIC_TIER_LABELS: Record<ClinicTier, string> = {
  primary: "Primary — village clinic / minor health centre",
  secondary: "Secondary — major health centre / district hospital",
  tertiary: "Tertiary — general / teaching hospital",
};

export function isClinicTier(value: unknown): value is ClinicTier {
  return typeof value === "string" && (CLINIC_TIERS as readonly string[]).includes(value);
}

export function parseClinicTier(value: unknown): ClinicTier | null {
  return isClinicTier(value) ? value : null;
}

export type ResultFlag = "H" | "L" | "A" | "C" | null;

export interface QualitativeValue {
  value: string;
  abnormal?: boolean;
  critical?: boolean;
}

export interface TestParameter {
  name: string;
  unit: string;
  referenceRange: string;
  resultType?: ResultType;
  criticalLow?: number | null;
  criticalHigh?: number | null;
  valueSet?: QualitativeValue[];
  /** For semi_quantitative: values at or after this index are abnormal. */
  abnormalFromIndex?: number | null;
}

export const RDT_VALUE_SET: QualitativeValue[] = [
  { value: "Negative" },
  { value: "Positive", abnormal: true },
  { value: "Invalid" },
  { value: "Not done" },
];

export const SEROLOGY_VALUE_SET: QualitativeValue[] = [
  { value: "Non-reactive" },
  { value: "Reactive", abnormal: true },
  { value: "Invalid" },
  { value: "Not done" },
];

export const DIPSTICK_VALUE_SET: QualitativeValue[] = [
  { value: "Nil" },
  { value: "Trace", abnormal: true },
  { value: "1+", abnormal: true },
  { value: "2+", abnormal: true },
  { value: "3+", abnormal: true },
];

export const MALARIA_FILM_VALUE_SET: QualitativeValue[] = [
  { value: "No parasites seen" },
  { value: "Trophozoites seen", abnormal: true },
  { value: "Gametocytes seen", abnormal: true },
  { value: "Mixed infection", abnormal: true },
  { value: "Invalid" },
  { value: "Not done" },
];

export const SICKLE_VALUE_SET: QualitativeValue[] = [
  { value: "Negative" },
  { value: "Positive", abnormal: true },
  { value: "Invalid" },
  { value: "Not done" },
];

export const STOOL_OVA_VALUE_SET: QualitativeValue[] = [
  { value: "None seen" },
  { value: "Ova seen", abnormal: true },
  { value: "Cysts seen", abnormal: true },
  { value: "Ova and cysts seen", abnormal: true },
  { value: "Not done" },
];

export const ABO_VALUE_SET: QualitativeValue[] = [
  { value: "A" },
  { value: "B" },
  { value: "AB" },
  { value: "O" },
  { value: "Not done" },
];

export const RH_VALUE_SET: QualitativeValue[] = [
  { value: "Positive" },
  { value: "Negative" },
  { value: "Not done" },
];

export const WIDAL_TITRE_VALUE_SET: QualitativeValue[] = [
  { value: "< 1:80" },
  { value: "1:80", abnormal: true },
  { value: "1:160", abnormal: true },
  { value: "1:320", abnormal: true },
  { value: "1:640", abnormal: true },
  { value: "Not done" },
];

export function isResultType(value: unknown): value is ResultType {
  return typeof value === "string" && (RESULT_TYPES as readonly string[]).includes(value);
}

function looksNumericUnit(unit: string): boolean {
  const u = unit.trim();
  if (!u || u === "—" || u === "-" || u === "–") return false;
  return true;
}

function looksParseableRange(range: string): boolean {
  if (!range || !range.trim()) return false;
  if (/\d+:\d+/.test(range)) return false;
  return /(-?\d+(?:\.\d+)?)\s*(?:[-–—]|to)\s*(-?\d+(?:\.\d+)?)/i.test(range)
    || /[<>≤≥]\s*-?\d+(?:\.\d+)?/.test(range)
    || /M:\s*[^,]+/i.test(range);
}

/**
 * Fill missing resultType on stored/legacy parameters. Never invent flags
 * for qualitative strings stored as unit "—".
 */
export function normalizeParameter(parameter: TestParameter): Required<
  Pick<TestParameter, "name" | "unit" | "referenceRange" | "resultType">
> & TestParameter {
  const name = parameter.name;
  const unit = parameter.unit || "—";
  const referenceRange = parameter.referenceRange || "";
  if (isResultType(parameter.resultType)) {
    return { ...parameter, name, unit, referenceRange, resultType: parameter.resultType };
  }
  if (parameter.valueSet && parameter.valueSet.length > 0) {
    const type: ResultType =
      parameter.abnormalFromIndex != null ? "semi_quantitative" : "qualitative";
    return { ...parameter, name, unit, referenceRange, resultType: type };
  }
  if (looksNumericUnit(unit) && looksParseableRange(referenceRange)) {
    return { ...parameter, name, unit, referenceRange, resultType: "numeric" };
  }
  return { ...parameter, name, unit, referenceRange, resultType: "text" };
}

export function numericParam(
  name: string,
  unit: string,
  referenceRange: string,
  extras: Pick<TestParameter, "criticalLow" | "criticalHigh"> = {}
): TestParameter {
  return { name, unit, referenceRange, resultType: "numeric", ...extras };
}

export function qualitativeParam(
  name: string,
  valueSet: QualitativeValue[],
  referenceRange: string
): TestParameter {
  return { name, unit: "—", referenceRange, resultType: "qualitative", valueSet };
}

export function semiQuantitativeParam(
  name: string,
  valueSet: QualitativeValue[],
  referenceRange: string,
  abnormalFromIndex = 1
): TestParameter {
  return {
    name,
    unit: "—",
    referenceRange,
    resultType: "semi_quantitative",
    valueSet,
    abnormalFromIndex,
  };
}

export function textParam(name: string, referenceRange = ""): TestParameter {
  return { name, unit: "—", referenceRange, resultType: "text" };
}

export function parameterNeedsUnit(parameter: TestParameter): boolean {
  return normalizeParameter(parameter).resultType === "numeric";
}

export function parameterNeedsValueSet(parameter: TestParameter): boolean {
  const type = normalizeParameter(parameter).resultType;
  return type === "qualitative" || type === "semi_quantitative";
}

export function valueSetIncludes(parameter: TestParameter, value: string): boolean {
  const set = normalizeParameter(parameter).valueSet;
  if (!set || set.length === 0) return true;
  return set.some((item) => item.value === value);
}

export function displayRange(parameter: TestParameter): string {
  const normalized = normalizeParameter(parameter);
  if (normalized.resultType === "qualitative" || normalized.resultType === "semi_quantitative") {
    return normalized.referenceRange || normalized.valueSet?.map((item) => item.value).join(" / ") || "";
  }
  if (normalized.resultType === "text") return "—";
  return normalized.referenceRange;
}
