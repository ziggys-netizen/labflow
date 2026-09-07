import type { ResultFlag } from "./resultModel";

/** Letters that sit after a result value. Never used as an operational chip. */
export const CLINICAL_FLAG_LETTERS = ["H", "L", "A", "C"] as const;

export type ClinicalFlagLetterValue = (typeof CLINICAL_FLAG_LETTERS)[number];

export const CLINICAL_FLAG_TITLES: Record<ClinicalFlagLetterValue, string> = {
  H: "Above reference range",
  L: "Below reference range",
  A: "Abnormal",
  C: "Critical",
};

export function isClinicalFlagLetter(value: string | null | undefined): value is ClinicalFlagLetterValue {
  return value === "H" || value === "L" || value === "A" || value === "C";
}

/**
 * Presentation only. Does not decide whether a result is H/L/C —
 * callers pass a flag already computed by resultFlag / parameterFlag.
 */
export function clinicalFlagLetterClass(flag: Exclude<ResultFlag, null>): string {
  const critical = flag === "C";
  return [
    "lf-clinical-letter",
    critical ? "bg-lf-crit-soft text-lf-crit rounded-lf-sm px-1" : "text-lf-warn",
  ].join(" ");
}
