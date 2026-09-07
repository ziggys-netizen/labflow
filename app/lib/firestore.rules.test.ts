import { readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "firebase/firestore";
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
  pendingMedicAid: "uid-medic-aid-pending",
  owner: "uid-owner",
} as const;

const TERMS = {
  techMedic: "uid-medic-aid-tech_acceptable-use_1.0",
  adminGreen: "uid-green-aid-admin_acceptable-use_1.0",
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
    await setDoc(doc(db, "users", UID.pendingMedicAid), {
      role: "technician",
      clinicId: MEDIC_AID,
      status: "pending",
    });
    await setDoc(doc(db, "users", UID.owner), {
      role: "owner",
      clinicId: null,
      status: "approved",
    });
    await setDoc(doc(db, "termsAcceptances", TERMS.techMedic), {
      uid: UID.techMedicAid,
      clinicId: MEDIC_AID,
      documentId: "acceptable-use",
      version: "1.0",
      acceptedAt: new Date("2026-09-04T00:00:00.000Z"),
      recordedAt: "2026-09-04T00:00:00.000Z",
    });
    await setDoc(doc(db, "termsAcceptances", TERMS.adminGreen), {
      uid: UID.adminGreenAid,
      clinicId: GREEN_AID,
      documentId: "acceptable-use",
      version: "1.0",
      acceptedAt: new Date("2026-09-04T00:00:00.000Z"),
      recordedAt: "2026-09-04T00:00:00.000Z",
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

function termsPayload(
  uid: string,
  clinicId: string,
  version: string,
  extra: Record<string, unknown> = {}
) {
  return {
    uid,
    clinicId,
    documentId: "acceptable-use",
    version,
    acceptedAt: serverTimestamp(),
    recordedAt: "2026-09-08T00:00:00.000Z",
    ...extra,
  };
}

describe("firestore rules — termsAcceptances", () => {
  it("approved user can create own acceptance for own clinic", async () => {
    const db = testEnv.authenticatedContext(UID.otherMedicAid).firestore();
    const version = "t-own";
    const id = `${UID.otherMedicAid}_acceptable-use_${version}`;
    await assertSucceeds(setDoc(doc(db, "termsAcceptances", id), termsPayload(UID.otherMedicAid, MEDIC_AID, version)));
  });

  it("cannot create for another uid", async () => {
    const db = testEnv.authenticatedContext(UID.techMedicAid).firestore();
    const version = "t-other-uid";
    const id = `${UID.otherMedicAid}_acceptable-use_${version}`;
    await assertFails(setDoc(doc(db, "termsAcceptances", id), termsPayload(UID.otherMedicAid, MEDIC_AID, version)));
  });

  it("clinic admin cannot accept on someone's behalf", async () => {
    const db = testEnv.authenticatedContext(UID.adminMedicAid).firestore();
    const version = "t-on-behalf";
    const id = `${UID.otherMedicAid}_acceptable-use_${version}`;
    await assertFails(setDoc(doc(db, "termsAcceptances", id), termsPayload(UID.otherMedicAid, MEDIC_AID, version)));
  });

  it("update is denied for the owner of the document and for the product owner", async () => {
    const techDb = testEnv.authenticatedContext(UID.techMedicAid).firestore();
    await assertFails(updateDoc(doc(techDb, "termsAcceptances", TERMS.techMedic), { version: "hacked" }));
    const ownerDb = testEnv.authenticatedContext(UID.owner).firestore();
    await assertFails(updateDoc(doc(ownerDb, "termsAcceptances", TERMS.techMedic), { version: "hacked" }));
  });

  it("delete is denied for everyone including owner", async () => {
    const techDb = testEnv.authenticatedContext(UID.techMedicAid).firestore();
    await assertFails(deleteDoc(doc(techDb, "termsAcceptances", TERMS.techMedic)));
    const adminDb = testEnv.authenticatedContext(UID.adminMedicAid).firestore();
    await assertFails(deleteDoc(doc(adminDb, "termsAcceptances", TERMS.techMedic)));
    const ownerDb = testEnv.authenticatedContext(UID.owner).firestore();
    await assertFails(deleteDoc(doc(ownerDb, "termsAcceptances", TERMS.techMedic)));
  });

  it("owner can read any clinic's acceptance", async () => {
    const db = testEnv.authenticatedContext(UID.owner).firestore();
    await assertSucceeds(getDoc(doc(db, "termsAcceptances", TERMS.techMedic)));
    await assertSucceeds(getDoc(doc(db, "termsAcceptances", TERMS.adminGreen)));
  });

  it("clinic admin can list and read their clinic's acceptances", async () => {
    const db = testEnv.authenticatedContext(UID.adminMedicAid).firestore();
    await assertSucceeds(getDoc(doc(db, "termsAcceptances", TERMS.techMedic)));
    await assertSucceeds(
      getDocs(query(collection(db, "termsAcceptances"), where("clinicId", "==", MEDIC_AID)))
    );
    await assertFails(getDoc(doc(db, "termsAcceptances", TERMS.adminGreen)));
  });

  it("staff can read own and cannot read another person's", async () => {
    const db = testEnv.authenticatedContext(UID.techMedicAid).firestore();
    await assertSucceeds(getDoc(doc(db, "termsAcceptances", TERMS.techMedic)));
    await assertFails(getDoc(doc(db, "termsAcceptances", TERMS.adminGreen)));
  });

  it("unapproved cannot create", async () => {
    const db = testEnv.authenticatedContext(UID.pendingMedicAid).firestore();
    const version = "t-pending";
    const id = `${UID.pendingMedicAid}_acceptable-use_${version}`;
    await assertFails(setDoc(doc(db, "termsAcceptances", id), termsPayload(UID.pendingMedicAid, MEDIC_AID, version)));
  });

  it("create with name or email fields is denied", async () => {
    const db = testEnv.authenticatedContext(UID.otherMedicAid).firestore();
    const version = "t-email";
    const id = `${UID.otherMedicAid}_acceptable-use_${version}`;
    await assertFails(
      setDoc(
        doc(db, "termsAcceptances", id),
        termsPayload(UID.otherMedicAid, MEDIC_AID, version, { email: "tech@clinic.test", name: "A Tech" })
      )
    );
  });
});
