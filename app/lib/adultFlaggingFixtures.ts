/**
 * Synthetic adult patients + released FBCs so H/L flagging can be seen in UI.
 * Pure fixtures — seeding lives in adultFlaggingSeed.ts.
 */

import { TEST_CATALOG } from "./testCatalog";
import { orderHasAbnormalResults, resultFlag } from "./resultFlag";
import { SAMPLE_COLLECTED_SOURCE } from "./sampleCollection";
import { firstReleaseVersion } from "./resultAmendment";

const FBC = TEST_CATALOG.find((row) => row.code === "FBC")!;

export type AdultFlaggingFixtureKey = "adult-male" | "adult-female";

export type AdultFlaggingPatientFixture = {
  key: AdultFlaggingFixtureKey;
  labId: string;
  name: string;
  sex: "M" | "F";
  dob: string;
  /** Result values chosen so at least one H and one L appear for this adult. */
  fbcResults: Record<string, string>;
};

/** Stable synthetic adults — not real people. */
export const ADULT_FLAGGING_PATIENTS: AdultFlaggingPatientFixture[] = [
  {
    key: "adult-male",
    labId: "TEST-ADULT-M",
    name: "Test Adult Male",
    sex: "M",
    dob: "1987-04-12",
    fbcResults: {
      "Haemoglobin (Hb)": "11.2", // L vs M 13-18
      "White Blood Cells (WBC)": "12.4", // H vs 4.5-11.0
      "Red Blood Cells (RBC)": "5.0",
      Platelets: "220",
      "Haematocrit (HCT/PCV)": "45",
      Neutrophils: "55",
      Lymphocytes: "30",
      Monocytes: "5",
      Eosinophils: "2",
      Basophils: "1",
    },
  },
  {
    key: "adult-female",
    labId: "TEST-ADULT-F",
    name: "Test Adult Female",
    sex: "F",
    dob: "1992-11-03",
    fbcResults: {
      "Haemoglobin (Hb)": "17.4", // H vs F 12-16
      "White Blood Cells (WBC)": "3.6", // L vs 4.5-11.0
      "Red Blood Cells (RBC)": "4.5",
      Platelets: "250",
      "Haematocrit (HCT/PCV)": "42",
      Neutrophils: "58",
      Lymphocytes: "28",
      Monocytes: "6",
      Eosinophils: "3",
      Basophils: "1",
    },
  },
];

export function adultFlaggingPatientDocId(clinicId: string, key: AdultFlaggingFixtureKey): string {
  return `${clinicId}_fixture_${key}`;
}

export function adultFlaggingOrderDocId(clinicId: string, key: AdultFlaggingFixtureKey): string {
  return `${clinicId}_fixture_${key}_fbc`;
}

/** Confirms fixture values produce both H and L against the product FBC catalogue. */
export function adultFixtureHasHlFlags(
  fixture: AdultFlaggingPatientFixture,
  now = new Date()
): boolean {
  const ctx = { sex: fixture.sex, dob: fixture.dob, now };
  const hb = FBC.parameters.find((p) => p.name === "Haemoglobin (Hb)");
  const wbc = FBC.parameters.find((p) => p.name === "White Blood Cells (WBC)");
  if (!hb || !wbc) return false;
  const hbFlag = resultFlag(fixture.fbcResults["Haemoglobin (Hb)"]!, hb.referenceRange, ctx);
  const wbcFlag = resultFlag(fixture.fbcResults["White Blood Cells (WBC)"]!, wbc.referenceRange, ctx);
  const letters = new Set([hbFlag, wbcFlag].filter(Boolean));
  if (!letters.has("H") || !letters.has("L")) return false;
  return orderHasAbnormalResults([{ code: "FBC" }], { FBC: fixture.fbcResults }, [FBC], ctx);
}

export function adultFlaggingPatientPayload(
  clinicId: string,
  fixture: AdultFlaggingPatientFixture,
  createdAt: string
): Record<string, unknown> {
  return {
    labId: fixture.labId,
    name: fixture.name,
    preferredName: null,
    sex: fixture.sex,
    dob: fixture.dob,
    ageYears: null,
    ageMonths: null,
    phone: "",
    address: null,
    nationalId: null,
    nextOfKin: null,
    referringClinician: null,
    referringFacility: null,
    reasonForVisit: "Adult H/L flagging fixture",
    consentGiven: true,
    lawfulBasis: "consent",
    createdAt,
    clinicId,
    createdByUid: "fixture",
    createdByRole: "owner",
    fixtureKey: fixture.key,
    fixturePurpose: "adult_hl_flagging",
  };
}

export function adultFlaggingOrderPayload(
  clinicId: string,
  patientId: string,
  fixture: AdultFlaggingPatientFixture,
  timestamps: { createdAt: string; collectedAt: string; enteredAt: string; reviewedAt: string }
): Record<string, unknown> {
  return {
    patientId,
    patientLabId: fixture.labId,
    patientName: fixture.name,
    patientSex: fixture.sex,
    tests: [
      {
        code: "FBC",
        name: FBC.name,
        specimenType: "blood",
      },
    ],
    status: "approved",
    createdAt: timestamps.createdAt,
    clinicId,
    sampleCollectedAt: timestamps.collectedAt,
    sampleCollectedSource: SAMPLE_COLLECTED_SOURCE.order,
    sampleCollections: {
      blood: {
        collectedAt: timestamps.collectedAt,
        collectedBy: "fixture@labflow.test",
        collectedBySource: SAMPLE_COLLECTED_SOURCE.order,
      },
    },
    results: { FBC: fixture.fbcResults },
    resultsEnteredAt: timestamps.enteredAt,
    resultsEnteredBy: "fixture@labflow.test",
    reviewedAt: timestamps.reviewedAt,
    reviewedBy: "fixture@labflow.test",
    reviewNotes: "",
    resultVersions: [
      firstReleaseVersion({
        values: { FBC: fixture.fbcResults },
        releasedBy: "fixture@labflow.test",
        releasedByUid: "fixture",
        releasedAt: timestamps.reviewedAt,
      }),
    ],
    currentResultVersion: 1,
    pendingAmendment: null,
    pendingAmendmentAt: null,
    selfReleased: false,
    selfReleaseReasonCode: null,
    needsFinalReprint: false,
    fixtureKey: fixture.key,
    fixturePurpose: "adult_hl_flagging",
  };
}
