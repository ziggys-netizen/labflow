export interface TestParameter {
  name: string;
  unit: string;
  referenceRange: string;
}

export interface LabTest {
  code: string;
  name: string;
  category: string;
  parameters: TestParameter[];
}

export const TEST_CATALOG: LabTest[] = [
  {
    code: "FBC",
    name: "Full Blood Count (FBC)",
    category: "Haematology",
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
    parameters: [
      { name: "Result", unit: "—", referenceRange: "Negative" },
      { name: "Parasite species (if positive)", unit: "—", referenceRange: "N/A" },
    ],
  },
  {
    code: "MAL-MICRO",
    name: "Malaria Blood Film (Microscopy)",
    category: "Parasitology",
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
    parameters: [
      { name: "Screening result", unit: "—", referenceRange: "Non-reactive" },
      { name: "Confirmatory result (if reactive)", unit: "—", referenceRange: "N/A" },
    ],
  },
  {
    code: "HBSAG",
    name: "Hepatitis B Surface Antigen (HBsAg)",
    category: "Serology",
    parameters: [
      { name: "Result", unit: "—", referenceRange: "Non-reactive" },
    ],
  },
  {
    code: "WIDAL",
    name: "Widal Test",
    category: "Serology",
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
    parameters: [
      { name: "Glucose", unit: "mmol/L", referenceRange: "3.9-5.6" },
    ],
  },
  {
    code: "PREG",
    name: "Pregnancy Test (Urine hCG)",
    category: "Clinical Chemistry",
    parameters: [
      { name: "Result", unit: "—", referenceRange: "Negative" },
    ],
  },
  {
    code: "STOOL",
    name: "Stool Microscopy",
    category: "Parasitology",
    parameters: [
      { name: "Ova/cysts seen", unit: "—", referenceRange: "None seen" },
      { name: "Occult blood", unit: "—", referenceRange: "Negative" },
    ],
  },
];
