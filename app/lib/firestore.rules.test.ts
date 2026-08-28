import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { deleteDoc, doc, getDoc, setDoc, updateDoc } from "firebase/firestore";
import { afterAll, beforeAll, describe, it } from "vitest";
import firebaseJson from "../../firebase.json";

const PROJECT_ID = "demo-labflow";
const RULES_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../firestore.rules");

const MEDIC_AID = "clinic-medic-aid";
const GREEN_AID = "clinic-green-aid";

const UID = {
  techMedicAid: "uid-medic-aid-tech",
  adminMedicAid: "uid-medic-aid-admin",
  adminGreenAid: "uid-green-aid-admin",
  otherMedicAid: "uid-medic-aid-other",
} as const;

const ENTRY_MEDIC = "roster-entry-medic-aid";
const ENTRY_GREEN = "roster-entry-green-aid";
const EX_OTHER_MEDIC = "roster-ex-other-medic-aid";
const EX_GREEN = "roster-ex-green-aid";

const emulator = firebaseJson.emulators.firestore;

let testEnv: RulesTestEnvironment;

function hostPort(): { host: string; port: number } {
  const raw = process.env.FIRESTORE_EMULATOR_HOST;
  if (raw) {
    const colon = raw.lastIndexOf(":");
    return { host: raw.slice(0, colon), port: Number(raw.slice(colon + 1)) };
  }
  return { host: emulator.host, port: emulator.port };
}

beforeAll(async () => {
  const { host, port } = hostPort();
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync(RULES_PATH, "utf8"),
      host,
      port,
    },
  });

  await testEnv.withSecurityRulesDisabled(async (context) => {
    const db = context.firestore();
    await setDoc(doc(db, "clinics", MEDIC_AID), {
      name: "Medic Aid",
      clinicId: MEDIC_AID,
      active: true,
    });
    await setDoc(doc(db, "clinics", GREEN_AID), {
      name: "Green Aid",
      clinicId: GREEN_AID,
      active: true,
    });
    await setDoc(doc(db, "users", UID.techMedicAid), {
      role: "technician",
      clinicId: MEDIC_AID,
      status: "approved",
    });
    await setDoc(doc(db, "users", UID.adminMedicAid), {
      role: "clinic_admin",
      clinicId: MEDIC_AID,
      status: "approved",
    });
    await setDoc(doc(db, "users", UID.adminGreenAid), {
      role: "clinic_admin",
      clinicId: GREEN_AID,
      status: "approved",
    });
    await setDoc(doc(db, "users", UID.otherMedicAid), {
      role: "technician",
      clinicId: MEDIC_AID,
      status: "approved",
    });
    await setDoc(doc(db, "rosterEntries", ENTRY_MEDIC), {
      clinicId: MEDIC_AID,
      userUid: UID.techMedicAid,
      pattern: "weekly",
      daysOfWeek: [1],
      startTime: "08:00",
      endTime: "16:00",
    });
    await setDoc(doc(db, "rosterEntries", ENTRY_GREEN), {
      clinicId: GREEN_AID,
      userUid: UID.adminGreenAid,
      pattern: "weekly",
      daysOfWeek: [1],
      startTime: "08:00",
      endTime: "16:00",
    });
    await setDoc(doc(db, "rosterExceptions", EX_OTHER_MEDIC), {
      clinicId: MEDIC_AID,
      userUid: UID.otherMedicAid,
      type: "leave",
      startsAt: "2026-08-23T00:00:00.000Z",
      endsAt: "2026-08-30T00:00:00.000Z",
    });
    await setDoc(doc(db, "rosterExceptions", EX_GREEN), {
      clinicId: GREEN_AID,
      userUid: UID.adminGreenAid,
      type: "leave",
      startsAt: "2026-08-23T00:00:00.000Z",
      endsAt: "2026-08-25T00:00:00.000Z",
    });
  });
}, 30_000);

afterAll(async () => {
  await testEnv?.cleanup();
});

describe("firestore rules — founder seven", () => {
  it("1. unauthenticated get rosterEntries is denied", async () => {
    const db = testEnv.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(db, "rosterEntries", ENTRY_MEDIC)));
  });

  it("2. Medic Aid technician get Medic Aid rosterEntries succeeds", async () => {
    const db = testEnv.authenticatedContext(UID.techMedicAid).firestore();
    await assertSucceeds(getDoc(doc(db, "rosterEntries", ENTRY_MEDIC)));
  });

  it("3. Medic Aid technician get another person's rosterExceptions is denied", async () => {
    const db = testEnv.authenticatedContext(UID.techMedicAid).firestore();
    await assertFails(getDoc(doc(db, "rosterExceptions", EX_OTHER_MEDIC)));
  });

  // Cross-tenant: clinic_admin must not plant leave/sick rows in another clinic.
  it("4. Medic Aid clinic_admin create rosterExceptions with Green Aid clinicId is denied", async () => {
    const db = testEnv.authenticatedContext(UID.adminMedicAid).firestore();
    await assertFails(
      setDoc(doc(db, "rosterExceptions", "hyp-cross-clinic-create"), {
        clinicId: GREEN_AID,
        userUid: UID.techMedicAid,
        type: "leave",
        startsAt: "2026-08-23T00:00:00.000Z",
        endsAt: "2026-08-24T00:00:00.000Z",
      })
    );
  });

  // Cross-tenant: clinic_admin must not delete another clinic's leave/sick rows.
  it("5. Medic Aid clinic_admin delete a Green Aid rosterExceptions doc is denied", async () => {
    const db = testEnv.authenticatedContext(UID.adminMedicAid).firestore();
    await assertFails(deleteDoc(doc(db, "rosterExceptions", EX_GREEN)));
  });

  // Cross-tenant: clinic_admin must not hop clinics by rewriting their own clinicId.
  it("6. Medic Aid clinic_admin update own users/{uid} to Green Aid clinicId is denied", async () => {
    const db = testEnv.authenticatedContext(UID.adminMedicAid).firestore();
    await assertFails(updateDoc(doc(db, "users", UID.adminMedicAid), { clinicId: GREEN_AID }));
  });

  // Cross-tenant: staffUserUpdateOk blocks clinicId/clinicIds changes, even when the
  // target stays in Medic Aid — clinic_admin cannot reassign another user's clinic.
  it("7. Medic Aid clinic_admin update another user's clinicId is denied", async () => {
    const db = testEnv.authenticatedContext(UID.adminMedicAid).firestore();
    await assertFails(
      updateDoc(doc(db, "users", UID.otherMedicAid), {
        clinicId: MEDIC_AID,
        clinicIds: [MEDIC_AID],
      })
    );
  });
});
