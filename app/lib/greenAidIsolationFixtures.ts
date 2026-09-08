/**
 * Synthetic Green Aid isolation fixtures — catalogue, patients, orders.
 * Pure data; seeding lives in greenAidIsolationSeed.ts.
 * Invented only — never real patient data.
 */

import { SAMPLE_COLLECTED_SOURCE } from "./sampleCollection";
import { firstReleaseVersion } from "./resultAmendment";

/** Live Green Aid clinic from the 2026-08-22 census. */
export const GREEN_AID_CLINIC_ID = "pu0QdCHByieKUmRSlAtF";
export const GREEN_AID_CLINIC_NAME = "Green Aid";

/** Live Medic Aid clinic — isolation probe counterpart. */
export const MEDIC_AID_CLINIC_ID = "AXpNONrWaoqcadFCjbrc";

export const GREEN_AID_SEED_TAG = "green-aid-isolation";

export type GreenAidPatientKey = "adult-male" | "adult-female" | "child";
export type GreenAidOrderKey =
  | "awaiting-sample"
  | "collected"
  | "results-entered"
  | "released-multi-specimen";

export type GreenAidPatientFixture = {
  key: GreenAidPatientKey;
  labId: string;
  name: string;
  sex: "M" | "F";
  dob: string;
};

/** Includes HB and SICKLE — Medic Aid catalogue historically omits both. */
export const GREEN_AID_CATALOGUE = [
  {
    code: "HB",
    name: "Haemoglobin estimation",
    category: "Haematology",
    specimenType: "blood" as const,
    specimenCap: "lavender",
    parameters: [
      {
        name: "Haemoglobin (Hb)",
        unit: "g/dL",
        referenceRange: "M: 13-18, F: 12-16",
        resultType: "numeric" as const,
        analyteId: "haemoglobin",
      },
    ],
    price: 0,
    onNationalMenu: true,
    tiers: ["primary", "secondary", "tertiary"],
  },
  {
    code: "SICKLE",
    name: "Sickle cell testing",
    category: "Haematology",
    specimenType: "blood" as const,
    parameters: [
      {
        name: "Result",
        unit: "—",
        referenceRange: "Negative",
        resultType: "qualitative" as const,
        analyteId: "sickle-result",
        valueSet: [
          { value: "Negative" },
          { value: "Positive", abnormal: true },
          { value: "Invalid" },
          { value: "Not done" },
        ],
      },
    ],
    price: 0,
    onNationalMenu: true,
    tiers: ["primary", "secondary", "tertiary"],
  },
  {
    code: "UA",
    name: "Urinalysis",
    category: "Clinical Chemistry",
    specimenType: "urine" as const,
    parameters: [
      {
        name: "Colour",
        unit: "—",
        referenceRange: "Pale yellow",
        resultType: "text" as const,
        analyteId: "urine-colour",
      },
      {
        name: "pH",
        unit: "pH",
        referenceRange: "5.0-8.0",
        resultType: "numeric" as const,
        analyteId: "urine-ph",
      },
    ],
    price: 0,
    onNationalMenu: true,
    tiers: ["primary", "secondary", "tertiary"],
  },
  {
    code: "FBS",
    name: "Blood glucose",
    category: "Clinical Chemistry",
    specimenType: "blood" as const,
    specimenCap: "grey",
    parameters: [
      {
        name: "Glucose",
        unit: "mmol/L",
        referenceRange: "3.9-5.6",
        resultType: "numeric" as const,
        analyteId: "glucose",
      },
    ],
    price: 0,
    onNationalMenu: true,
    tiers: ["primary", "secondary", "tertiary"],
  },
] as const;

export const GREEN_AID_PATIENTS: GreenAidPatientFixture[] = [
  {
    key: "adult-male",
    labId: "GA-SEED-AM-001",
    name: "Synthetic Adult Male",
    sex: "M",
    dob: "1988-03-12",
  },
  {
    key: "adult-female",
    labId: "GA-SEED-AF-001",
    name: "Synthetic Adult Female",
    sex: "F",
    dob: "1994-11-02",
  },
  {
    key: "child",
    labId: "GA-SEED-CH-001",
    name: "Synthetic Child",
    sex: "F",
    dob: "2018-07-21",
  },
];

export function greenAidCatalogDocId(code: string): string {
  return `${GREEN_AID_CLINIC_ID}_${code}`;
}

export function greenAidPatientDocId(key: GreenAidPatientKey): string {
  return `${GREEN_AID_CLINIC_ID}_ga_isolation_${key}`;
}

export function greenAidOrderDocId(key: GreenAidOrderKey): string {
  return `${GREEN_AID_CLINIC_ID}_ga_isolation_${key}`;
}

export function greenAidCatalogPayload(
  test: (typeof GREEN_AID_CATALOGUE)[number],
  seededAt: string
): Record<string, unknown> {
  return {
    code: test.code,
    name: test.name,
    category: test.category,
    specimenType: test.specimenType,
    ...("specimenCap" in test && test.specimenCap ? { specimenCap: test.specimenCap } : {}),
    parameters: test.parameters,
    price: test.price || 0,
    clinicId: GREEN_AID_CLINIC_ID,
    reviewed: false,
    seededAt,
    seededFrom: "green_aid_seed",
    onNationalMenu: test.onNationalMenu,
    tiers: [...test.tiers],
  };
}

export function greenAidPatientPayload(
  fixture: GreenAidPatientFixture,
  seededAt: string
): Record<string, unknown> {
  return {
    clinicId: GREEN_AID_CLINIC_ID,
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
    reasonForVisit: "Green Aid isolation fixture",
    consentGiven: true,
    lawfulBasis: "consent",
    createdAt: seededAt,
    createdByUid: "fixture",
    createdByRole: "owner",
    seedTag: GREEN_AID_SEED_TAG,
  };
}

type OrderFixtureSpec = {
  key: GreenAidOrderKey;
  patientKey: GreenAidPatientKey;
  status: string;
  tests: { code: string; name: string; specimenType: string }[];
  sampleCollectedAt: string | null;
  sampleCollections: Record<string, unknown>;
  results?: Record<string, Record<string, string>>;
  resultsEnteredAt?: string;
  resultsEnteredBy?: string;
  reviewedAt?: string;
  reviewedBy?: string;
};

const ORDER_SPECS: OrderFixtureSpec[] = [
  {
    key: "awaiting-sample",
    patientKey: "adult-male",
    status: "pending",
    tests: [{ code: "HB", name: "Haemoglobin estimation", specimenType: "blood" }],
    sampleCollectedAt: null,
    sampleCollections: {},
  },
  {
    key: "collected",
    patientKey: "adult-female",
    status: "pending",
    tests: [{ code: "SICKLE", name: "Sickle cell testing", specimenType: "blood" }],
    sampleCollectedAt: "2026-09-01T09:00:00.000Z",
    sampleCollections: {
      blood: {
        collectedAt: "2026-09-01T09:00:00.000Z",
        collectedBy: "seed@labflow.invalid",
        collectedBySource: SAMPLE_COLLECTED_SOURCE.order,
      },
    },
  },
  {
    key: "results-entered",
    patientKey: "child",
    status: "results_entered",
    tests: [{ code: "HB", name: "Haemoglobin estimation", specimenType: "blood" }],
    sampleCollectedAt: "2026-09-02T09:00:00.000Z",
    sampleCollections: {
      blood: {
        collectedAt: "2026-09-02T09:00:00.000Z",
        collectedBy: "seed@labflow.invalid",
        collectedBySource: SAMPLE_COLLECTED_SOURCE.order,
      },
    },
    results: { HB: { "Haemoglobin (Hb)": "11.4" } },
    resultsEnteredAt: "2026-09-02T11:00:00.000Z",
    resultsEnteredBy: "seed@labflow.invalid",
  },
  {
    key: "released-multi-specimen",
    patientKey: "adult-male",
    status: "approved",
    tests: [
      { code: "HB", name: "Haemoglobin estimation", specimenType: "blood" },
      { code: "UA", name: "Urinalysis", specimenType: "urine" },
    ],
    sampleCollectedAt: "2026-09-03T10:30:00.000Z",
    sampleCollections: {
      blood: {
        collectedAt: "2026-09-03T09:00:00.000Z",
        collectedBy: "seed@labflow.invalid",
        collectedBySource: SAMPLE_COLLECTED_SOURCE.order,
      },
      urine: {
        collectedAt: "2026-09-03T10:30:00.000Z",
        collectedBy: "seed@labflow.invalid",
        collectedBySource: SAMPLE_COLLECTED_SOURCE.order,
      },
    },
    results: {
      HB: { "Haemoglobin (Hb)": "13.1" },
      UA: { Colour: "Pale yellow", pH: "6.0" },
    },
    resultsEnteredAt: "2026-09-03T12:00:00.000Z",
    resultsEnteredBy: "seed@labflow.invalid",
    reviewedAt: "2026-09-03T13:00:00.000Z",
    reviewedBy: "seed-manager@labflow.invalid",
  },
];

export function greenAidOrderSpecs(): OrderFixtureSpec[] {
  return ORDER_SPECS;
}

export function greenAidOrderPayload(
  spec: OrderFixtureSpec,
  patientId: string,
  patient: GreenAidPatientFixture,
  seededAt: string
): Record<string, unknown> {
  const base: Record<string, unknown> = {
    clinicId: GREEN_AID_CLINIC_ID,
    patientId,
    patientLabId: patient.labId,
    patientName: patient.name,
    patientSex: patient.sex,
    status: spec.status,
    tests: spec.tests,
    createdAt: seededAt,
    sampleCollectedAt: spec.sampleCollectedAt,
    sampleCollections: spec.sampleCollections,
    seedTag: GREEN_AID_SEED_TAG,
    updatedAt: seededAt,
  };
  if (spec.results) base.results = spec.results;
  if (spec.resultsEnteredAt) base.resultsEnteredAt = spec.resultsEnteredAt;
  if (spec.resultsEnteredBy) base.resultsEnteredBy = spec.resultsEnteredBy;
  if (spec.reviewedAt) {
    base.reviewedAt = spec.reviewedAt;
    base.reviewedBy = spec.reviewedBy ?? null;
    base.reviewNotes = "";
    if (spec.results) {
      base.resultVersions = [
        firstReleaseVersion({
          values: spec.results,
          releasedBy: spec.reviewedBy ?? "seed-manager@labflow.invalid",
          releasedByUid: "fixture",
          releasedAt: spec.reviewedAt,
        }),
      ];
      base.currentResultVersion = 1;
      base.pendingAmendment = null;
      base.pendingAmendmentAt = null;
      base.selfReleased = false;
      base.selfReleaseReasonCode = null;
      base.needsFinalReprint = false;
    }
  }
  return base;
}

/**
 * Pure guard: refuse when any Green Aid patients already exist.
 * Returns null when seeding is allowed.
 */
export function greenAidSeedRefusal(existing: {
  patientDocIds: string[];
  labIds: string[];
}): { count: number; patientDocIds: string[]; labIds: string[] } | null {
  if (existing.patientDocIds.length === 0) return null;
  return {
    count: existing.patientDocIds.length,
    patientDocIds: [...existing.patientDocIds],
    labIds: [...existing.labIds],
  };
}

/** Format a durable-safe refusal summary (Lab IDs / doc IDs only — no names). */
export function formatGreenAidSeedRefusal(refusal: {
  count: number;
  patientDocIds: string[];
  labIds: string[];
}): string {
  const labs = refusal.labIds.length
    ? refusal.labIds.join(", ")
    : "(no labId on some docs)";
  return (
    `Refused: Green Aid already has ${refusal.count} patient(s). ` +
    `Lab IDs: ${labs}. Doc IDs: ${refusal.patientDocIds.join(", ")}. ` +
    `Cannot double-seed.`
  );
}
