export interface TestParameter {
  name: string;
  unit: string;
  referenceRange: string;
}

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
  seededFrom?: "default";
}

// Seed source for new clinics. Never used as a runtime fallback — empty
// catalogues stay empty until seeded or tests are added in Settings.
// Reference ranges are typical adult values compiled from WHO and standard
// hematology/chemistry references. Per ISO 15189, each laboratory must verify
// and, where needed, adjust these against its own analyzer, method, and
// local population before clinical use.
export const TEST_CATALOG: LabTest[] = [
  {
    code: "FBC",
    name: "Full Blood Count (FBC)",
    category: "Haematology",
    specimenType: "blood",
    parameters: [
      { name: "Haemoglobin (Hb)", unit: "g/dL", referenceRange: "M: 13-18, F: 12-16" },
      { name: "White Blood Cells (WBC)", unit: "x10^9/L", referenceRange: "4.5-11.0" },
      { name: "Red Blood Cells (RBC)", unit: "x10^12/L", referenceRange: "M: 4.5-5.9, F: 4.0-5.2" },
      { name: "Platelets", unit: "x10^9/L", referenceRange: "150-400" },
      { name: "Haematocrit (HCT/PCV)", unit: "%", referenceRange: "M: 40-54, F: 36-48" },
      { name: "Neutrophils", unit: "%", referenceRange: "40-75" },
      { name: "Lymphocytes", unit: "%", referenceRange: "20-45" },
      { name: "Monocytes", unit: "%", referenceRange: "2-10" },
      { name: "Eosinophils", unit: "%", referenceRange: "1-6" },
      { name: "Basophils", unit: "%", referenceRange: "0-2" },
    ],
  },
  {
    code: "MAL-RDT",
    name: "Malaria Rapid Diagnostic Test",
    category: "Parasitology",
    specimenType: "blood",
    parameters: [
      { name: "Result", unit: "—", referenceRange: "Negative" },
      { name: "Parasite species (if positive)", unit: "—", referenceRange: "N/A" },
    ],
  },
  {
    code: "MAL-MICRO",
    name: "Malaria Blood Film (Microscopy)",
    category: "Parasitology",
    specimenType: "blood",
    parameters: [
      { name: "Result", unit: "—", referenceRange: "No parasites seen" },
      { name: "Parasite density", unit: "parasites/µL", referenceRange: "N/A" },
      { name: "Species identified", unit: "—", referenceRange: "N/A" },
    ],
  },
  {
    code: "HIV",
    name: "HIV Rapid Test",
    category: "Serology",
    specimenType: "blood",
    parameters: [
      { name: "Screening result", unit: "—", referenceRange: "Non-reactive" },
      { name: "Confirmatory result (if reactive)", unit: "—", referenceRange: "N/A" },
    ],
  },
  {
    code: "HBSAG",
    name: "Hepatitis B Surface Antigen (HBsAg)",
    category: "Serology",
    specimenType: "blood",
    parameters: [
      { name: "Result", unit: "—", referenceRange: "Non-reactive" },
    ],
  },
  {
    code: "WIDAL",
    name: "Widal Test",
    category: "Serology",
    specimenType: "blood",
    parameters: [
      { name: "S. Typhi O", unit: "titre", referenceRange: "< 1:80" },
      { name: "S. Typhi H", unit: "titre", referenceRange: "< 1:80" },
      { name: "S. Paratyphi A", unit: "titre", referenceRange: "< 1:80" },
      { name: "S. Paratyphi B", unit: "titre", referenceRange: "< 1:80" },
    ],
  },
  {
    code: "UA",
    name: "Urinalysis",
    category: "Clinical Chemistry",
    specimenType: "urine",
    parameters: [
      { name: "Colour", unit: "—", referenceRange: "Pale yellow" },
      { name: "Protein", unit: "—", referenceRange: "Negative" },
      { name: "Glucose", unit: "—", referenceRange: "Negative" },
      { name: "Ketones", unit: "—", referenceRange: "Negative" },
      { name: "Blood", unit: "—", referenceRange: "Negative" },
      { name: "Leukocytes", unit: "—", referenceRange: "Negative" },
      { name: "Nitrites", unit: "—", referenceRange: "Negative" },
      { name: "pH", unit: "—", referenceRange: "5.0-8.0" },
    ],
  },
  {
    code: "FBS",
    name: "Fasting Blood Sugar",
    category: "Clinical Chemistry",
    specimenType: "blood",
    parameters: [
      { name: "Glucose", unit: "mmol/L", referenceRange: "3.9-5.6" },
    ],
  },
  {
    code: "PREG",
    name: "Pregnancy Test (Urine hCG)",
    category: "Clinical Chemistry",
    specimenType: "urine",
    parameters: [
      { name: "Result", unit: "—", referenceRange: "Negative" },
    ],
  },
  {
    code: "STOOL",
    name: "Stool Microscopy",
    category: "Parasitology",
    specimenType: "stool",
    parameters: [
      { name: "Ova/cysts seen", unit: "—", referenceRange: "None seen" },
      { name: "Occult blood", unit: "—", referenceRange: "Negative" },
    ],
  },
  {
    code: "RFT",
    name: "Renal Function Test (U&E)",
    category: "Clinical Chemistry",
    specimenType: "blood",
    parameters: [
      { name: "Urea", unit: "mmol/L", referenceRange: "2.5-7.8" },
      { name: "Creatinine", unit: "µmol/L", referenceRange: "M: 53-106, F: 44-97" },
      { name: "Sodium", unit: "mmol/L", referenceRange: "135-145" },
      { name: "Potassium", unit: "mmol/L", referenceRange: "3.5-5.0" },
      { name: "Chloride", unit: "mmol/L", referenceRange: "98-107" },
    ],
  },
  {
    code: "LFT",
    name: "Liver Function Test (LFT)",
    category: "Clinical Chemistry",
    specimenType: "blood",
    parameters: [
      { name: "ALT", unit: "U/L", referenceRange: "7-56" },
      { name: "AST", unit: "U/L", referenceRange: "10-40" },
      { name: "ALP", unit: "U/L", referenceRange: "44-147" },
      { name: "Total Bilirubin", unit: "mg/dL", referenceRange: "0.1-1.2" },
      { name: "Albumin", unit: "g/dL", referenceRange: "3.5-5.0" },
      { name: "Total Protein", unit: "g/dL", referenceRange: "6.3-8.2" },
    ],
  },
  {
    code: "LIPID",
    name: "Lipid Profile",
    category: "Clinical Chemistry",
    specimenType: "blood",
    parameters: [
      { name: "Total Cholesterol", unit: "mmol/L", referenceRange: "< 5.0 (desirable)" },
      { name: "HDL Cholesterol", unit: "mmol/L", referenceRange: "> 1.0" },
      { name: "LDL Cholesterol", unit: "mmol/L", referenceRange: "< 4.0" },
      { name: "Triglycerides", unit: "mmol/L", referenceRange: "< 1.7" },
    ],
  },
  {
    code: "HCV",
    name: "Hepatitis C Antibody",
    category: "Serology",
    specimenType: "blood",
    parameters: [
      { name: "Result", unit: "—", referenceRange: "Non-reactive" },
    ],
  },
  {
    code: "VDRL",
    name: "Syphilis Test (VDRL/RPR)",
    category: "Serology",
    specimenType: "blood",
    parameters: [
      { name: "Result", unit: "—", referenceRange: "Non-reactive" },
      { name: "Titre (if reactive)", unit: "—", referenceRange: "N/A" },
    ],
  },
  {
    code: "BGRH",
    name: "Blood Group & Rhesus Factor",
    category: "Haematology",
    specimenType: "blood",
    parameters: [
      { name: "ABO Group", unit: "—", referenceRange: "A / B / AB / O" },
      { name: "Rhesus (Rh) Factor", unit: "—", referenceRange: "Positive / Negative" },
    ],
  },
];

const SEED_SPECIMEN_BY_CODE = new Map(TEST_CATALOG.map((test) => [test.code, test.specimenType]));

/** Stored value, then the 16-test seed, then `other`. Does not invent per-specimen times. */
export function resolveSpecimenType(
  stored: unknown,
  code?: string | null,
  catalog?: { code: string; specimenType?: unknown }[]
): SpecimenType {
  const direct = parseSpecimenType(stored);
  if (direct) return direct;
  if (code && catalog) {
    const fromCatalog = catalog.find((test) => test.code === code);
    const parsed = parseSpecimenType(fromCatalog?.specimenType);
    if (parsed) return parsed;
  }
  if (code) {
    const seeded = SEED_SPECIMEN_BY_CODE.get(code);
    if (seeded) return seeded;
  }
  return "other";
}