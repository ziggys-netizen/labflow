/**
 * Green Aid isolation seed — DO NOT run from CI or agent sessions.
 * Isaac runs this once from a machine with Firebase Admin credentials.
 *
 * Creates synthetic catalogue, patients, and orders in Green Aid only.
 * Prints document IDs for the Medic Aid isolation console probe.
 *
 * Usage:
 *   node scripts/seed-green-aid.mjs
 *
 * Requires Application Default Credentials (or GOOGLE_APPLICATION_CREDENTIALS)
 * for project labflow-6cb9e. Never paste real patient data into this file.
 */

import { initializeApp, applicationDefault, getApps, cert } from "firebase-admin/app";
import { getFirestore, FieldValue } from "firebase-admin/firestore";
import { readFileSync, existsSync } from "node:fs";

const GREEN_AID_CLINIC_ID = "pu0QdCHByieKUmRSlAtF";
const MEDIC_AID_CLINIC_ID = "AXpNONrWaoqcadFCjbrc";
const PROJECT_ID = process.env.GOOGLE_CLOUD_PROJECT || process.env.GCLOUD_PROJECT || "labflow-6cb9e";

/** Invented Lab IDs only — not real identifiers. */
const PATIENTS = [
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

const CATALOGUE = [
  {
    code: "HB",
    name: "Haemoglobin estimation",
    category: "Haematology",
    specimenType: "blood",
    specimenCap: "lavender",
    parameters: [
      {
        name: "Haemoglobin (Hb)",
        unit: "g/dL",
        referenceRange: "M: 13-18, F: 12-16",
        resultType: "numeric",
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
    specimenType: "blood",
    parameters: [
      {
        name: "Result",
        unit: "—",
        referenceRange: "Negative",
        resultType: "qualitative",
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
    specimenType: "urine",
    parameters: [
      {
        name: "Colour",
        unit: "—",
        referenceRange: "Pale yellow",
        resultType: "text",
        analyteId: "urine-colour",
      },
      {
        name: "pH",
        unit: "pH",
        referenceRange: "5.0-8.0",
        resultType: "numeric",
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
    specimenType: "blood",
    specimenCap: "grey",
    parameters: [
      {
        name: "Glucose",
        unit: "mmol/L",
        referenceRange: "3.9-5.6",
        resultType: "numeric",
        analyteId: "glucose",
      },
    ],
    price: 0,
    onNationalMenu: true,
    tiers: ["primary", "secondary", "tertiary"],
  },
];

function initAdmin() {
  if (getApps().length) return getApps()[0];
  const keyPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (keyPath && existsSync(keyPath)) {
    const json = JSON.parse(readFileSync(keyPath, "utf8"));
    return initializeApp({ credential: cert(json), projectId: PROJECT_ID });
  }
  return initializeApp({ credential: applicationDefault(), projectId: PROJECT_ID });
}

function catalogDocId(clinicId, code) {
  return `${clinicId}_${code}`;
}

async function main() {
  if (process.env.LABFLOW_ALLOW_GREEN_AID_SEED !== "1") {
    console.error(
      "Refusing to run. Set LABFLOW_ALLOW_GREEN_AID_SEED=1 when you intentionally seed Green Aid."
    );
    process.exit(1);
  }

  initAdmin();
  const db = getFirestore();
  const clinicRef = db.collection("clinics").doc(GREEN_AID_CLINIC_ID);
  const clinicSnap = await clinicRef.get();
  if (!clinicSnap.exists) {
    throw new Error(`Green Aid clinic ${GREEN_AID_CLINIC_ID} not found.`);
  }

  const seededAt = new Date().toISOString();
  const batch = db.batch();

  for (const test of CATALOGUE) {
    const id = catalogDocId(GREEN_AID_CLINIC_ID, test.code);
    batch.set(db.collection("testCatalog").doc(id), {
      ...test,
      clinicId: GREEN_AID_CLINIC_ID,
      reviewed: false,
      seededAt,
      seededFrom: "green_aid_seed",
      price: test.price || 0,
    });
  }

  const patientIds = {};
  for (const patient of PATIENTS) {
    const ref = db.collection("patients").doc();
    patientIds[patient.key] = ref.id;
    batch.set(ref, {
      clinicId: GREEN_AID_CLINIC_ID,
      labId: patient.labId,
      name: patient.name,
      sex: patient.sex,
      dob: patient.dob,
      createdAt: seededAt,
      consentGiven: true,
      seedTag: "green-aid-isolation",
    });
  }

  const adultMaleId = patientIds["adult-male"];
  const adultFemaleId = patientIds["adult-female"];
  const childId = patientIds["child"];

  const orderSpecs = [
    {
      key: "awaiting-sample",
      patientId: adultMaleId,
      patientLabId: PATIENTS[0].labId,
      status: "pending",
      tests: [{ code: "HB", name: "Haemoglobin estimation", specimenType: "blood" }],
      sampleCollectedAt: null,
      sampleCollections: {},
    },
    {
      key: "collected",
      patientId: adultFemaleId,
      patientLabId: PATIENTS[1].labId,
      status: "pending",
      tests: [{ code: "SICKLE", name: "Sickle cell testing", specimenType: "blood" }],
      sampleCollectedAt: "2026-09-01T09:00:00.000Z",
      sampleCollections: {
        blood: {
          collectedAt: "2026-09-01T09:00:00.000Z",
          collectedBy: "seed",
          collectedBySource: "order",
        },
      },
    },
    {
      key: "results-entered",
      patientId: childId,
      patientLabId: PATIENTS[2].labId,
      status: "results_entered",
      tests: [{ code: "HB", name: "Haemoglobin estimation", specimenType: "blood" }],
      sampleCollectedAt: "2026-09-02T09:00:00.000Z",
      sampleCollections: {
        blood: {
          collectedAt: "2026-09-02T09:00:00.000Z",
          collectedBy: "seed",
          collectedBySource: "order",
        },
      },
      results: { HB: { "Haemoglobin (Hb)": "11.4" } },
      resultsEnteredAt: "2026-09-02T11:00:00.000Z",
      resultsEnteredBy: "seed@labflow.invalid",
    },
    {
      key: "released-multi-specimen",
      patientId: adultMaleId,
      patientLabId: PATIENTS[0].labId,
      status: "approved",
      tests: [
        { code: "HB", name: "Haemoglobin estimation", specimenType: "blood" },
        { code: "UA", name: "Urinalysis", specimenType: "urine" },
      ],
      sampleCollectedAt: "2026-09-03T10:30:00.000Z",
      sampleCollections: {
        blood: {
          collectedAt: "2026-09-03T09:00:00.000Z",
          collectedBy: "seed",
          collectedBySource: "order",
        },
        urine: {
          collectedAt: "2026-09-03T10:30:00.000Z",
          collectedBy: "seed",
          collectedBySource: "order",
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

  const orderIds = {};
  for (const spec of orderSpecs) {
    const ref = db.collection("orders").doc();
    orderIds[spec.key] = ref.id;
    batch.set(ref, {
      clinicId: GREEN_AID_CLINIC_ID,
      patientId: spec.patientId,
      patientLabId: spec.patientLabId,
      status: spec.status,
      tests: spec.tests,
      createdAt: seededAt,
      sampleCollectedAt: spec.sampleCollectedAt,
      sampleCollections: spec.sampleCollections || {},
      ...(spec.results ? { results: spec.results } : {}),
      ...(spec.resultsEnteredAt ? { resultsEnteredAt: spec.resultsEnteredAt } : {}),
      ...(spec.resultsEnteredBy ? { resultsEnteredBy: spec.resultsEnteredBy } : {}),
      ...(spec.reviewedAt ? { reviewedAt: spec.reviewedAt } : {}),
      ...(spec.reviewedBy ? { reviewedBy: spec.reviewedBy } : {}),
      seedTag: "green-aid-isolation",
      updatedAt: FieldValue.serverTimestamp(),
    });
  }

  await batch.commit();

  console.log("Green Aid seed committed.");
  console.log(JSON.stringify({
    greenAidClinicId: GREEN_AID_CLINIC_ID,
    medicAidClinicId: MEDIC_AID_CLINIC_ID,
    catalogueDocIds: CATALOGUE.map((t) => catalogDocId(GREEN_AID_CLINIC_ID, t.code)),
    patientIds,
    orderIds,
    isolationProbe: {
      greenAidPatientId: adultMaleId,
      medicAidPatientIdPlaceholder: "<PASTE_A_MEDIC_AID_PATIENT_DOC_ID>",
    },
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
