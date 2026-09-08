/**
 * Idempotent Firestore seed for adult H/L flagging fixtures.
 */

import { doc, getDoc, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { logAudit, type AuditActor } from "./audit";
import {
  ADULT_FLAGGING_PATIENTS,
  adultFlaggingOrderDocId,
  adultFlaggingOrderPayload,
  adultFlaggingPatientDocId,
  adultFlaggingPatientPayload,
  adultFixtureHasHlFlags,
} from "./adultFlaggingFixtures";

/**
 * Writes two adult patients and released FBCs into the clinic when missing.
 * Skips documents that already exist (idempotent).
 */
export async function seedAdultFlaggingFixtures(
  clinicId: string,
  options: { actor?: AuditActor | null } = {}
): Promise<{ createdPatients: number; createdOrders: number }> {
  if (!clinicId) return { createdPatients: 0, createdOrders: 0 };

  for (const fixture of ADULT_FLAGGING_PATIENTS) {
    if (!adultFixtureHasHlFlags(fixture)) {
      throw new Error(`Fixture ${fixture.key} does not produce both H and L flags`);
    }
  }

  const now = Date.now();
  const timestamps = {
    createdAt: new Date(now - 4 * 60 * 60 * 1000).toISOString(),
    collectedAt: new Date(now - 3 * 60 * 60 * 1000).toISOString(),
    enteredAt: new Date(now - 2 * 60 * 60 * 1000).toISOString(),
    reviewedAt: new Date(now - 1 * 60 * 60 * 1000).toISOString(),
  };

  const batch = writeBatch(db);
  let createdPatients = 0;
  let createdOrders = 0;

  for (const fixture of ADULT_FLAGGING_PATIENTS) {
    const patientId = adultFlaggingPatientDocId(clinicId, fixture.key);
    const orderId = adultFlaggingOrderDocId(clinicId, fixture.key);
    const patientRef = doc(db, "patients", patientId);
    const orderRef = doc(db, "orders", orderId);
    const [patientSnap, orderSnap] = await Promise.all([getDoc(patientRef), getDoc(orderRef)]);

    if (!patientSnap.exists()) {
      batch.set(patientRef, adultFlaggingPatientPayload(clinicId, fixture, timestamps.createdAt));
      createdPatients += 1;
    }
    if (!orderSnap.exists()) {
      batch.set(orderRef, adultFlaggingOrderPayload(clinicId, patientId, fixture, timestamps));
      createdOrders += 1;
    }
  }

  if (createdPatients === 0 && createdOrders === 0) {
    return { createdPatients: 0, createdOrders: 0 };
  }

  await batch.commit();

  if (options.actor) {
    try {
      await logAudit({
        clinicId,
        actor: options.actor,
        action: "fixture.adult_hl_seeded",
        targetCollection: "patients",
        targetId: clinicId,
        targetLabel: "Adult H/L flagging fixtures",
        detail: { createdPatients, createdOrders },
      });
    } catch (err) {
      console.error(err);
    }
  }

  return { createdPatients, createdOrders };
}
