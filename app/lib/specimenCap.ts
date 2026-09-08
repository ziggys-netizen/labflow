/**
 * D6 — specimen tube-cap colours.
 *
 * Catalogue `specimenType` is body fluid (blood/urine/…). Cap colour is a
 * separate optional field (`specimenCap`) so blood is never collapsed to one
 * tube colour. Missing cap → no dot (never grey-as-default).
 */

export const SPECIMEN_CAPS = [
  "lavender",
  "blue",
  "gold",
  "grey",
  "red",
  "green",
] as const;

export type SpecimenCap = (typeof SPECIMEN_CAPS)[number];

/** Additive / tube name shown to staff — not a rank. */
export const SPECIMEN_CAP_LABELS: Record<SpecimenCap, string> = {
  lavender: "EDTA",
  blue: "Citrate",
  gold: "SST / clot activator",
  grey: "Fluoride oxalate",
  red: "Plain",
  green: "Heparin",
};

const CAP_TOKEN: Record<SpecimenCap, string> = {
  lavender: "var(--lf-cap-lavender)",
  blue: "var(--lf-cap-blue)",
  gold: "var(--lf-cap-gold)",
  grey: "var(--lf-cap-grey)",
  red: "var(--lf-cap-red)",
  green: "var(--lf-cap-green)",
};

export function isSpecimenCap(value: unknown): value is SpecimenCap {
  return typeof value === "string" && (SPECIMEN_CAPS as readonly string[]).includes(value);
}

export function parseSpecimenCap(value: unknown): SpecimenCap | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (isSpecimenCap(key)) return key;
  // Common lab aliases from imports / spreadsheets.
  if (key === "edta" || key === "purple" || key === "violet") return "lavender";
  if (key === "citrate" || key === "light blue" || key === "lt blue") return "blue";
  if (key === "sst" || key === "clot activator" || key === "yellow" || key === "serum") return "gold";
  if (key === "fluoride" || key === "fluoride oxalate" || key === "oxalate" || key === "gray") {
    return "grey";
  }
  if (key === "plain" || key === "no additive") return "red";
  if (key === "heparin" || key === "li heparin" || key === "lithium heparin") return "green";
  return null;
}

export function specimenCapBackground(cap: SpecimenCap): string {
  return CAP_TOKEN[cap];
}

/**
 * Seed defaults from the D6 tube table, keyed by catalogue code.
 * Tests not listed here intentionally have no cap.
 */
export const SEED_SPECIMEN_CAP_BY_CODE: ReadonlyMap<string, SpecimenCap> = new Map([
  // Lavender — EDTA: FBC, HB, ESR, HbA1c (ESR/HbA1c not in seed catalogue)
  ["FBC", "lavender"],
  ["HB", "lavender"],
  // Gold — SST / serology: LFT, RFT, lipids, serology
  ["LFT", "gold"],
  ["RFT", "gold"],
  ["LIPID", "gold"],
  ["HIV", "gold"],
  ["HBSAG", "gold"],
  ["HCV", "gold"],
  ["VDRL", "gold"],
  ["WIDAL", "gold"],
  // Grey — fluoride: glucose, lactate
  ["FBS", "grey"],
  // Red — plain: blood group, cross-match
  ["BGRH", "red"],
  // Blue (citrate) and green (heparin): no matching seed tests yet
]);

/** Stored value, then clinic catalogue row, then seed-by-code. Never invents a grey default. */
export function resolveSpecimenCap(
  stored: unknown,
  code?: string | null,
  catalog?: { code: string; specimenCap?: unknown }[]
): SpecimenCap | null {
  const direct = parseSpecimenCap(stored);
  if (direct) return direct;
  if (code && catalog) {
    const fromCatalog = catalog.find((row) => row.code === code);
    const parsed = parseSpecimenCap(fromCatalog?.specimenCap);
    if (parsed) return parsed;
  }
  if (code) {
    return SEED_SPECIMEN_CAP_BY_CODE.get(code) ?? null;
  }
  return null;
}
