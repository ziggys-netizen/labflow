import {
  ABO_VALUE_SET,
  CLINIC_TIERS,
  DIPSTICK_VALUE_SET,
  MALARIA_FILM_VALUE_SET,
  RDT_VALUE_SET,
  RH_VALUE_SET,
  SEROLOGY_VALUE_SET,
  SICKLE_VALUE_SET,
  STOOL_OVA_VALUE_SET,
  WIDAL_TITRE_VALUE_SET,
  numericParam,
  qualitativeParam,
  semiQuantitativeParam,
  textParam,
  type ClinicTier,
  type TestParameter,
} from "./resultModel";
import type { SopReference } from "./sopReference";

export type { TestParameter, ClinicTier } from "./resultModel";
export { CLINIC_TIERS, CLINIC_TIER_LABELS, isClinicTier, parseClinicTier } from "./resultModel";

export const SPECIMEN_TYPES = [
  "blood",
  "urine",
  "stool",
  "sputum",
  "swab",
  "csf",
  "other",
] as const;

export type SpecimenType = (typeof SPECIMEN_TYPES)[number];

export const SPECIMEN_TYPE_LABELS: Record<SpecimenType, string> = {
  blood: "Blood",
  urine: "Urine",
  stool: "Stool",
  sputum: "Sputum",
  swab: "Swab",
  csf: "CSF",
  other: "Other",
};

export function isSpecimenType(value: unknown): value is SpecimenType {
  return typeof value === "string" && (SPECIMEN_TYPES as readonly string[]).includes(value);
}

/** Accepts the seven catalogue values, case-insensitive. Import aliases map onto them. */
export function parseSpecimenType(value: unknown): SpecimenType | null {
  if (typeof value !== "string") return null;
  const key = value.trim().toLowerCase();
  if (isSpecimenType(key)) return key;
  if (key === "whole blood" || key === "serum" || key === "plasma" || key === "blood film") {
    return "blood";
  }
  if (key === "csf" || key === "cerebrospinal fluid") return "csf";
  return null;
}

export interface LabTest {
  code: string;
  name: string;
  category: string;
  specimenType: SpecimenType;
  parameters: TestParameter[];
  price?: number;
  clinicId?: string;
  /** True only after a lab manager or supervisor confirms ranges for this clinic. */
  reviewed?: boolean;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  seededAt?: string;
  seededFrom?: "default" | "national_tier";
  /** Which clinic tiers receive this test on seed. */
  tiers?: ClinicTier[];
  /** Named in the National Health Laboratory Services Policy 2021–2025. */
  onNationalMenu?: boolean;
  /**
   * SOP identifiers for this test. Required on rows with `sopRequired: true`.
   * Seeded/imported/existing rows omit both fields and stay orderable.
   */
  sop?: SopReference | null;
  sopRequired?: boolean;
}

const PRIMARY: ClinicTier[] = ["primary", "secondary", "tertiary"];
const SECONDARY: ClinicTier[] = ["secondary", "tertiary"];

function test(
  partial: Omit<LabTest, "tiers" | "onNationalMenu"> & {
    tiers: ClinicTier[];
    onNationalMenu: boolean;
  }
): LabTest {
  return partial;
}

/**
 * Seed source for new clinics. Never used as a runtime fallback — empty
 * catalogues stay empty until seeded or tests are added in Settings.
 *
 * Primary-tier rows follow the national policy menu (PRD v0.4 §7.2).
 * Widal is carried for West African practice but marked off the national menu.
 * Reference ranges are typical adult values; each laboratory must confirm them.
 */
export const TEST_CATALOG: LabTest[] = [
  test({
    code: "UA",
    name: "Urinalysis",
    category: "Clinical Chemistry",
    specimenType: "urine",
    tiers: PRIMARY,
    onNationalMenu: true,
    parameters: [
      textParam("Colour", "Pale yellow"),
      textParam("Appearance", ""),
      numericParam("pH", "pH", "5.0-8.0"),
      semiQuantitativeParam("Protein", DIPSTICK_VALUE_SET, "Nil"),
      semiQuantitativeParam("Glucose", DIPSTICK_VALUE_SET, "Nil"),
      semiQuantitativeParam("Ketones", DIPSTICK_VALUE_SET, "Nil"),
      qualitativeParam("Blood", RDT_VALUE_SET, "Negative"),
      qualitativeParam("Leukocytes", RDT_VALUE_SET, "Negative"),
      qualitativeParam("Nitrites", RDT_VALUE_SET, "Negative"),
    ],
  }),
  test({
    code: "MAL-MICRO",
    name: "Malaria Blood Film (Microscopy)",
    category: "Parasitology",
    specimenType: "blood",
    tiers: PRIMARY,
    onNationalMenu: true,
    parameters: [
      qualitativeParam("Result", MALARIA_FILM_VALUE_SET, "No parasites seen"),
      textParam("Species / description", ""),
      numericParam("Parasite density", "parasites/µL", ""),
    ],
  }),
  test({
    code: "STOOL",
    name: "Stool Microscopy",
    category: "Parasitology",
    specimenType: "stool",
    tiers: PRIMARY,
    onNationalMenu: true,
    parameters: [
      qualitativeParam("Ova/cysts seen", STOOL_OVA_VALUE_SET, "None seen"),
      textParam("Description", ""),
      qualitativeParam("Occult blood", RDT_VALUE_SET, "Negative"),
    ],
  }),
  test({
    code: "HB",
    name: "Haemoglobin estimation",
    category: "Haematology",
    specimenType: "blood",
    tiers: PRIMARY,
    onNationalMenu: true,
    parameters: [numericParam("Haemoglobin (Hb)", "g/dL", "M: 13-18, F: 12-16")],
  }),
  test({
    code: "FBS",
    name: "Blood glucose",
    category: "Clinical Chemistry",
    specimenType: "blood",
    tiers: PRIMARY,
    onNationalMenu: true,
    parameters: [numericParam("Glucose", "mmol/L", "3.9-5.6")],
  }),
  test({
    code: "SICKLE",
    name: "Sickle cell testing",
    category: "Haematology",
    specimenType: "blood",
    tiers: PRIMARY,
    onNationalMenu: true,
    parameters: [qualitativeParam("Result", SICKLE_VALUE_SET, "Negative")],
  }),
  test({
    code: "MAL-RDT",
    name: "Malaria Rapid Diagnostic Test",
    category: "Parasitology",
    specimenType: "blood",
    tiers: PRIMARY,
    onNationalMenu: true,
    parameters: [
      qualitativeParam("Result", RDT_VALUE_SET, "Negative"),
      textParam("Parasite species (if positive)", ""),
    ],
  }),
  test({
    code: "HIV",
    name: "HIV Rapid Test",
    category: "Serology",
    specimenType: "blood",
    tiers: PRIMARY,
    onNationalMenu: true,
    parameters: [
      qualitativeParam("Screening result", SEROLOGY_VALUE_SET, "Non-reactive"),
      qualitativeParam("Confirmatory result (if reactive)", SEROLOGY_VALUE_SET, "Non-reactive"),
    ],
  }),
  test({
    code: "HBSAG",
    name: "Hepatitis B Surface Antigen (HBsAg)",
    category: "Serology",
    specimenType: "blood",
    tiers: PRIMARY,
    onNationalMenu: true,
    parameters: [qualitativeParam("Result", SEROLOGY_VALUE_SET, "Non-reactive")],
  }),
  test({
    code: "HCV",
    name: "Hepatitis C Antibody",
    category: "Serology",
    specimenType: "blood",
    tiers: PRIMARY,
    onNationalMenu: true,
    parameters: [qualitativeParam("Result", SEROLOGY_VALUE_SET, "Non-reactive")],
  }),
  test({
    code: "PREG",
    name: "Pregnancy Test (Urine hCG)",
    category: "Clinical Chemistry",
    specimenType: "urine",
    tiers: PRIMARY,
    onNationalMenu: true,
    parameters: [qualitativeParam("Result", RDT_VALUE_SET, "Negative")],
  }),
  test({
    code: "VDRL",
    name: "Syphilis Test (VDRL/RPR)",
    category: "Serology",
    specimenType: "blood",
    tiers: PRIMARY,
    onNationalMenu: true,
    parameters: [
      qualitativeParam("Result", SEROLOGY_VALUE_SET, "Non-reactive"),
      textParam("Titre (if reactive)", ""),
    ],
  }),
  test({
    code: "FBC",
    name: "Full Blood Count (FBC)",
    category: "Haematology",
    specimenType: "blood",
    tiers: SECONDARY,
    onNationalMenu: true,
    parameters: [
      numericParam("Haemoglobin (Hb)", "g/dL", "M: 13-18, F: 12-16"),
      numericParam("White Blood Cells (WBC)", "x10^9/L", "4.5-11.0"),
      numericParam("Red Blood Cells (RBC)", "x10^12/L", "M: 4.5-5.9, F: 4.0-5.2"),
      numericParam("Platelets", "x10^9/L", "150-400"),
      numericParam("Haematocrit (HCT/PCV)", "%", "M: 40-54, F: 36-48"),
      numericParam("Neutrophils", "%", "40-75"),
      numericParam("Lymphocytes", "%", "20-45"),
      numericParam("Monocytes", "%", "2-10"),
      numericParam("Eosinophils", "%", "1-6"),
      numericParam("Basophils", "%", "0-2"),
    ],
  }),
  test({
    code: "BGRH",
    name: "Blood Group & Rhesus Factor",
    category: "Haematology",
    specimenType: "blood",
    tiers: SECONDARY,
    onNationalMenu: true,
    parameters: [
      qualitativeParam("ABO Group", ABO_VALUE_SET, "A / B / AB / O"),
      qualitativeParam("Rhesus (Rh) Factor", RH_VALUE_SET, "Positive / Negative"),
    ],
  }),
  test({
    code: "RFT",
    name: "Renal Function Test (U&E)",
    category: "Clinical Chemistry",
    specimenType: "blood",
    tiers: SECONDARY,
    onNationalMenu: true,
    parameters: [
      numericParam("Urea", "mmol/L", "2.5-7.8"),
      numericParam("Creatinine", "µmol/L", "M: 53-106, F: 44-97"),
      numericParam("Sodium", "mmol/L", "135-145"),
      numericParam("Potassium", "mmol/L", "3.5-5.0"),
      numericParam("Chloride", "mmol/L", "98-107"),
    ],
  }),
  test({
    code: "LFT",
    name: "Liver Function Test (LFT)",
    category: "Clinical Chemistry",
    specimenType: "blood",
    tiers: SECONDARY,
    onNationalMenu: true,
    parameters: [
      numericParam("ALT", "U/L", "7-56"),
      numericParam("AST", "U/L", "10-40"),
      numericParam("ALP", "U/L", "44-147"),
      numericParam("Total Bilirubin", "mg/dL", "0.1-1.2"),
      numericParam("Albumin", "g/dL", "3.5-5.0"),
      numericParam("Total Protein", "g/dL", "6.3-8.2"),
    ],
  }),
  test({
    code: "LIPID",
    name: "Lipid Profile",
    category: "Clinical Chemistry",
    specimenType: "blood",
    tiers: SECONDARY,
    onNationalMenu: true,
    parameters: [
      numericParam("Total Cholesterol", "mmol/L", "< 5.0 (desirable)"),
      numericParam("HDL Cholesterol", "mmol/L", "> 1.0"),
      numericParam("LDL Cholesterol", "mmol/L", "< 4.0"),
      numericParam("Triglycerides", "mmol/L", "< 1.7"),
    ],
  }),
  test({
    code: "WIDAL",
    name: "Widal Test",
    category: "Serology",
    specimenType: "blood",
    tiers: SECONDARY,
    onNationalMenu: false,
    parameters: [
      qualitativeParam("S. Typhi O", WIDAL_TITRE_VALUE_SET, "< 1:80"),
      qualitativeParam("S. Typhi H", WIDAL_TITRE_VALUE_SET, "< 1:80"),
      qualitativeParam("S. Paratyphi A", WIDAL_TITRE_VALUE_SET, "< 1:80"),
      qualitativeParam("S. Paratyphi B", WIDAL_TITRE_VALUE_SET, "< 1:80"),
    ],
  }),
];

export function testsForTier(tier: ClinicTier): LabTest[] {
  return TEST_CATALOG.filter((row) => (row.tiers ?? [...CLINIC_TIERS]).includes(tier));
}

const SEED_SPECIMEN_BY_CODE = new Map(TEST_CATALOG.map((row) => [row.code, row.specimenType]));

/** Stored value, then the seed, then `other`. Does not invent per-specimen times. */
export function resolveSpecimenType(
  stored: unknown,
  code?: string | null,
  catalog?: { code: string; specimenType?: unknown }[]
): SpecimenType {
  const direct = parseSpecimenType(stored);
  if (direct) return direct;
  if (code && catalog) {
    const fromCatalog = catalog.find((row) => row.code === code);
    const parsed = parseSpecimenType(fromCatalog?.specimenType);
    if (parsed) return parsed;
  }
  if (code) {
    const seeded = SEED_SPECIMEN_BY_CODE.get(code);
    if (seeded) return seeded;
  }
  return "other";
}
