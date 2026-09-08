/**
 * Owner-console Green Aid isolation seed via the client Firestore SDK.
 * No Admin SDK / service-account key. isOwner() rules already permit writes.
 */

import { collection, doc, getDoc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { logAudit, type AuditActor } from "./audit";
import {
  GREEN_AID_CATALOGUE,
  GREEN_AID_CLINIC_ID,
  GREEN_AID_CLINIC_NAME,
  GREEN_AID_PATIENTS,
  MEDIC_AID_CLINIC_ID,
  formatGreenAidSeedRefusal,
  greenAidCatalogDocId,
  greenAidCatalogPayload,
  greenAidOrderDocId,
  greenAidOrderPayload,
  greenAidOrderSpecs,
  greenAidPatientDocId,
  greenAidPatientPayload,
  greenAidSeedRefusal,
  type GreenAidOrderKey,
  type GreenAidPatientKey,
} from "./greenAidIsolationFixtures";

export type GreenAidCreatedDoc = {
  collection: "testCatalog" | "patients" | "orders";
  id: string;
  /** Safe durable label: codes / Lab IDs / order keys — no patient names. */
  label: string;
};

export type GreenAidSeedSuccess = {
  ok: true;
  clinicId: string;
  clinicName: string;
  created: GreenAidCreatedDoc[];
  patientIds: Record<GreenAidPatientKey, string>;
  orderIds: Record<GreenAidOrderKey, string>;
  isolationProbe: {
    greenAidClinicId: string;
    medicAidClinicId: string;
    greenAidPatientId: string;
    greenAidPatientLabId: string;
    medicAidPatientIdPlaceholder: string;
    note: string;
  };
};

export type GreenAidSeedFailure =
  | { ok: false; reason: "clinic_missing"; message: string }
  | {
      ok: false;
      reason: "patients_exist";
      message: string;
      count: number;
      patientDocIds: string[];
      labIds: string[];
    };

export type GreenAidSeedResult = GreenAidSeedSuccess | GreenAidSeedFailure;

/** Load existing Green Aid patients for the refuse-if-exists guard. */
export async function loadGreenAidPatientsForSeed(): Promise<{
  patientDocIds: string[];
  labIds: string[];
}> {
  const snap = await getDocs(
    query(collection(db, "patients"), where("clinicId", "==", GREEN_AID_CLINIC_ID))
  );
  const patientDocIds: string[] = [];
  const labIds: string[] = [];
  for (const d of snap.docs) {
    patientDocIds.push(d.id);
    const labId = d.data().labId;
    if (typeof labId === "string" && labId.trim()) labIds.push(labId.trim());
  }
  return { patientDocIds, labIds };
}

/**
 * Seeds Green Aid catalogue + three patients + four orders when the clinic
 * has zero patients. Refuses otherwise so it cannot double-seed.
 */
export async function seedGreenAidIsolationFixtures(
  options: { actor?: AuditActor | null } = {}
): Promise<GreenAidSeedResult> {
  const clinicSnap = await getDoc(doc(db, "clinics", GREEN_AID_CLINIC_ID));
  if (!clinicSnap.exists()) {
    return {
      ok: false,
      reason: "clinic_missing",
      message: `Green Aid clinic ${GREEN_AID_CLINIC_ID} not found.`,
    };
  }

  const existing = await loadGreenAidPatientsForSeed();
  const refusal = greenAidSeedRefusal(existing);
  if (refusal) {
    return {
      ok: false,
      reason: "patients_exist",
      message: formatGreenAidSeedRefusal(refusal),
      count: refusal.count,
      patientDocIds: refusal.patientDocIds,
      labIds: refusal.labIds,
    };
  }

  const seededAt = new Date().toISOString();
  const batch = writeBatch(db);
  const created: GreenAidCreatedDoc[] = [];

  for (const test of GREEN_AID_CATALOGUE) {
    const id = greenAidCatalogDocId(test.code);
    batch.set(doc(db, "testCatalog", id), greenAidCatalogPayload(test, seededAt));
    created.push({ collection: "testCatalog", id, label: test.code });
  }

  const patientIds = {} as Record<GreenAidPatientKey, string>;
  for (const patient of GREEN_AID_PATIENTS) {
    const id = greenAidPatientDocId(patient.key);
    patientIds[patient.key] = id;
    batch.set(doc(db, "patients", id), greenAidPatientPayload(patient, seededAt));
    created.push({ collection: "patients", id, label: patient.labId });
  }

  const orderIds = {} as Record<GreenAidOrderKey, string>;
  const patientsByKey = Object.fromEntries(
    GREEN_AID_PATIENTS.map((p) => [p.key, p])
  ) as Record<GreenAidPatientKey, (typeof GREEN_AID_PATIENTS)[number]>;

  for (const spec of greenAidOrderSpecs()) {
    const id = greenAidOrderDocId(spec.key);
    orderIds[spec.key] = id;
    const patient = patientsByKey[spec.patientKey];
    batch.set(
      doc(db, "orders", id),
      greenAidOrderPayload(spec, patientIds[spec.patientKey], patient, seededAt)
    );
    created.push({ collection: "orders", id, label: spec.key });
  }

  await batch.commit();

  const isolationProbe = {
    greenAidClinicId: GREEN_AID_CLINIC_ID,
    medicAidClinicId: MEDIC_AID_CLINIC_ID,
    greenAidPatientId: patientIds["adult-male"],
    greenAidPatientLabId: patientsByKey["adult-male"].labId,
    medicAidPatientIdPlaceholder: "<PASTE_A_MEDIC_AID_PATIENT_DOC_ID>",
    note:
      "Medic Aid staff probe: as Medic Aid staff, attempt getDoc on greenAidPatientId — expect permission-denied. Owner console prints these IDs after seed.",
  };

  if (options.actor) {
    try {
      await logAudit({
        clinicId: GREEN_AID_CLINIC_ID,
        actor: options.actor,
        action: "fixture.green_aid_isolation_seeded",
        targetCollection: "patients",
        targetId: GREEN_AID_CLINIC_ID,
        targetLabel: "Green Aid isolation fixtures",
        detail: {
          createdCount: created.length,
          created: created.map((row) => ({
            collection: row.collection,
            id: row.id,
            label: row.label,
          })),
          isolationProbe: {
            greenAidPatientId: isolationProbe.greenAidPatientId,
            greenAidPatientLabId: isolationProbe.greenAidPatientLabId,
            medicAidClinicId: isolationProbe.medicAidClinicId,
          },
        },
      });
    } catch (err) {
      console.error(err);
    }
  }

  return {
    ok: true,
    clinicId: GREEN_AID_CLINIC_ID,
    clinicName: GREEN_AID_CLINIC_NAME,
    created,
    patientIds,
    orderIds,
    isolationProbe,
  };
}

export function formatGreenAidSeedSuccess(result: GreenAidSeedSuccess): string {
  const lines = [
    `Seeded ${GREEN_AID_CLINIC_NAME} (${result.clinicId}). Created ${result.created.length} document(s):`,
    ...result.created.map((row) => `• ${row.collection}/${row.id} (${row.label})`),
    "",
    "Isolation probe (Medic Aid staff):",
    `• greenAidPatientId=${result.isolationProbe.greenAidPatientId}`,
    `• greenAidPatientLabId=${result.isolationProbe.greenAidPatientLabId}`,
    `• medicAidClinicId=${result.isolationProbe.medicAidClinicId}`,
    `• medicAidPatientIdPlaceholder=${result.isolationProbe.medicAidPatientIdPlaceholder}`,
    result.isolationProbe.note,
  ];
  return lines.join("\n");
}
