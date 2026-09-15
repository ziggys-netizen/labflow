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
  increment,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from "firebase/firestore";
import { rollupMergeFields } from "./dailyTestValueRollup";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import firebaseJson from "../../firebase.json";

const PROJECT_ID = "demo-labflow";
const RULES_PATH = resolve(dirname(fileURLToPath(import.meta.url)), "../../firestore.rules");

const MEDIC_AID = "clinic-medic-aid";
const GREEN_AID = "clinic-green-aid";

const UID = {
  techMedicAid: "uid-medic-aid-tech",
  managerMedicAid: "uid-medic-aid-manager",
  supervisorMedicAid: "uid-medic-aid-supervisor",
  adminMedicAid: "uid-medic-aid-admin",
  adminGreenAid: "uid-green-aid-admin",
  otherMedicAid: "uid-medic-aid-other",
  pendingMedicAid: "uid-medic-aid-pending",
  cashierMedicAid: "uid-medic-aid-cashier",
  owner: "uid-owner",
} as const;

const FIXTURE = {
  catalog: "catalog-medic-fbc",
  orderPending: "order-medic-pending",
  orderReady: "order-medic-ready",
  patient: "patient-medic-active",
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
    await setDoc(doc(db, "users", UID.managerMedicAid), {
      role: "lab_manager",
      clinicId: MEDIC_AID,
      status: "approved",
    });
    await setDoc(doc(db, "users", UID.supervisorMedicAid), {
      role: "lab_supervisor",
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
    await setDoc(doc(db, "users", UID.cashierMedicAid), {
      role: "cashier",
      clinicId: MEDIC_AID,
      status: "approved",
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
    await setDoc(doc(db, "testCatalog", FIXTURE.catalog), {
      clinicId: MEDIC_AID,
      code: "FBC",
      name: "Full Blood Count",
      price: 10,
    });
    await setDoc(doc(db, "orders", FIXTURE.orderPending), {
      clinicId: MEDIC_AID,
      patientId: FIXTURE.patient,
      status: "pending",
      results: {},
    });
    await setDoc(doc(db, "orders", FIXTURE.orderReady), {
      clinicId: MEDIC_AID,
      patientId: FIXTURE.patient,
      status: "results_entered",
      results: { FBC: { Hb: "12" } },
    });
    await setDoc(doc(db, "patients", FIXTURE.patient), {
      clinicId: MEDIC_AID,
      name: "Ada Patient",
      labId: "LF-ADA",
      deleted: false,
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

describe("firestore rules — J1 role gates", () => {
  it("technician cannot write testCatalog", async () => {
    const db = testEnv.authenticatedContext(UID.techMedicAid).firestore();
    await assertFails(updateDoc(doc(db, "testCatalog", FIXTURE.catalog), { price: 99 }));
    await assertFails(
      setDoc(doc(db, "testCatalog", "catalog-medic-tech-create"), {
        clinicId: MEDIC_AID,
        code: "HBA1C",
        name: "HbA1c",
        price: 20,
      })
    );
  });

  it("lab_manager can write testCatalog", async () => {
    const db = testEnv.authenticatedContext(UID.managerMedicAid).firestore();
    await assertSucceeds(updateDoc(doc(db, "testCatalog", FIXTURE.catalog), { price: 12 }));
    await assertSucceeds(
      setDoc(doc(db, "testCatalog", "catalog-medic-mgr-create"), {
        clinicId: MEDIC_AID,
        code: "LFT",
        name: "Liver Function",
        price: 25,
      })
    );
  });

  it("technician can enter results but cannot transition into approved", async () => {
    const db = testEnv.authenticatedContext(UID.techMedicAid).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "orders", FIXTURE.orderPending), {
        status: "results_entered",
        results: { FBC: { Hb: "11.5" } },
      })
    );
    await assertFails(updateDoc(doc(db, "orders", FIXTURE.orderReady), { status: "approved" }));
  });

  it("lab_manager can transition order into approved", async () => {
    const db = testEnv.authenticatedContext(UID.managerMedicAid).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "orders", FIXTURE.orderReady), {
        status: "approved",
        reviewedBy: "manager@clinic.test",
      })
    );
  });

  it("technician cannot soft-delete a patient", async () => {
    const db = testEnv.authenticatedContext(UID.techMedicAid).firestore();
    await assertFails(
      updateDoc(doc(db, "patients", FIXTURE.patient), {
        deleted: true,
        deletedAt: "2026-09-08T00:00:00.000Z",
        deletionReason: "duplicate",
      })
    );
  });

  it("lab_manager can soft-delete a patient", async () => {
    const db = testEnv.authenticatedContext(UID.managerMedicAid).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "patients", FIXTURE.patient), {
        deleted: true,
        deletedAt: "2026-09-08T00:00:00.000Z",
        deletedBy: "manager@clinic.test",
        deletionReason: "duplicate",
      })
    );
  });

  it("technician cannot amend released results via SDK field rewrite", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "orders", "order-medic-released"), {
        clinicId: MEDIC_AID,
        patientId: FIXTURE.patient,
        status: "approved",
        results: { FBC: { Hb: "12" } },
        resultVersions: [{ version: 1, values: { FBC: { Hb: "12" } } }],
      });
    });
    const db = testEnv.authenticatedContext(UID.techMedicAid).firestore();
    await assertFails(
      updateDoc(doc(db, "orders", "order-medic-released"), {
        status: "amended",
        results: { FBC: { Hb: "9" } },
      })
    );
    await assertFails(
      updateDoc(doc(db, "orders", "order-medic-released"), {
        results: { FBC: { Hb: "9" } },
      })
    );
  });

  it("lab_manager can amend released results", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "orders", "order-medic-released-mgr"), {
        clinicId: MEDIC_AID,
        patientId: FIXTURE.patient,
        status: "approved",
        results: { FBC: { Hb: "12" } },
        resultVersions: [{ version: 1, values: { FBC: { Hb: "12" } } }],
      });
    });
    const db = testEnv.authenticatedContext(UID.managerMedicAid).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "orders", "order-medic-released-mgr"), {
        status: "amended",
        results: { FBC: { Hb: "9" } },
        resultVersions: [
          { version: 1, values: { FBC: { Hb: "12" } } },
          { version: 2, values: { FBC: { Hb: "9" } } },
        ],
      })
    );
  });

  // leavingReleasedStatus: tech must not open a released order by dropping to pending.
  it("technician cannot leave released status for pending", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "orders", "order-medic-unrelease-tech"), {
        clinicId: MEDIC_AID,
        patientId: FIXTURE.patient,
        status: "approved",
        results: { FBC: { Hb: "12" } },
      });
      await setDoc(doc(context.firestore(), "orders", "order-medic-unrelease-amended-tech"), {
        clinicId: MEDIC_AID,
        patientId: FIXTURE.patient,
        status: "amended",
        results: { FBC: { Hb: "11" } },
      });
    });
    const db = testEnv.authenticatedContext(UID.techMedicAid).firestore();
    await assertFails(updateDoc(doc(db, "orders", "order-medic-unrelease-tech"), { status: "pending" }));
    await assertFails(
      updateDoc(doc(db, "orders", "order-medic-unrelease-amended-tech"), { status: "needs_correction" })
    );
  });

  // No app path un-releases approved/amended today; canApproveResultsRole still allows it.
  it("lab_manager can leave released status", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "orders", "order-medic-unrelease-mgr"), {
        clinicId: MEDIC_AID,
        patientId: FIXTURE.patient,
        status: "approved",
        results: { FBC: { Hb: "12" } },
      });
    });
    const db = testEnv.authenticatedContext(UID.managerMedicAid).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "orders", "order-medic-unrelease-mgr"), { status: "needs_correction" })
    );
  });
});

describe("firestore rules — restore is separate from delete", () => {
  async function seedPatient(id: string, deleted: boolean) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "patients", id), {
        clinicId: MEDIC_AID,
        name: "Ada Patient",
        labId: "LF-ADA",
        deleted,
      });
    });
  }

  async function seedOrder(id: string, patientDeleted: boolean) {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "orders", id), {
        clinicId: MEDIC_AID,
        patientId: FIXTURE.patient,
        status: "pending",
        results: {},
        patientDeleted,
      });
    });
  }

  it("lab_supervisor can restore a soft-deleted patient", async () => {
    await seedPatient("patient-restore-sup", true);
    const db = testEnv.authenticatedContext(UID.supervisorMedicAid).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "patients", "patient-restore-sup"), {
        deleted: false,
        deletedAt: null,
        deletedBy: null,
        restoredBy: "supervisor@clinic.test",
        restoredAt: "2026-09-12T10:00:00.000Z",
      })
    );
  });

  it("lab_supervisor still cannot soft-delete a patient", async () => {
    await seedPatient("patient-delete-sup", false);
    const db = testEnv.authenticatedContext(UID.supervisorMedicAid).firestore();
    await assertFails(
      updateDoc(doc(db, "patients", "patient-delete-sup"), {
        deleted: true,
        deletedAt: "2026-09-12T10:00:00.000Z",
        deletionReason: "duplicate",
      })
    );
  });

  it("lab_supervisor can clear patientDeleted on orders but not set it", async () => {
    await seedOrder("order-restore-sup", true);
    await seedOrder("order-delete-sup", false);
    const db = testEnv.authenticatedContext(UID.supervisorMedicAid).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "orders", "order-restore-sup"), { patientDeleted: false })
    );
    await assertFails(
      updateDoc(doc(db, "orders", "order-delete-sup"), { patientDeleted: true })
    );
  });

  it("technician can do neither", async () => {
    await seedPatient("patient-restore-tech", true);
    const db = testEnv.authenticatedContext(UID.techMedicAid).firestore();
    await assertFails(
      updateDoc(doc(db, "patients", "patient-restore-tech"), { deleted: false })
    );
  });

  it("lab_manager keeps both delete and restore", async () => {
    await seedPatient("patient-both-mgr", false);
    const db = testEnv.authenticatedContext(UID.managerMedicAid).firestore();
    await assertSucceeds(
      updateDoc(doc(db, "patients", "patient-both-mgr"), {
        deleted: true,
        deletedBy: "manager@clinic.test",
        deletionReason: "duplicate",
      })
    );
    await assertSucceeds(
      updateDoc(doc(db, "patients", "patient-both-mgr"), { deleted: false })
    );
  });
});

describe("firestore rules — daily test value rollup writes", () => {
  function contribution(date: string, code = "FBC") {
    return {
      clinicId: MEDIC_AID,
      date,
      testCount: 1,
      valueOfTestsOrdered: 10,
      lines: [{ code, name: "Full Blood Count", count: 1, value: 10 }],
    };
  }

  it("owner can write a rollup with rollupMergeFields's real (nested) shape", async () => {
    const db = testEnv.authenticatedContext(UID.owner).firestore();
    const rollupRef = doc(db, "dailyTestValueRollups", `${MEDIC_AID}_2026-09-11`);
    await assertSucceeds(
      setDoc(rollupRef, rollupMergeFields(contribution("2026-09-11"), "2026-09-11T10:00:00.000Z", increment), {
        merge: true,
      })
    );
  });

  it("a second same-day release accumulates instead of overwriting", async () => {
    const db = testEnv.authenticatedContext(UID.managerMedicAid).firestore();
    const rollupRef = doc(db, "dailyTestValueRollups", `${MEDIC_AID}_2026-09-13`);
    await assertSucceeds(
      setDoc(
        rollupRef,
        rollupMergeFields(contribution("2026-09-13"), "2026-09-13T09:00:00.000Z", increment),
        { merge: true }
      )
    );
    await assertSucceeds(
      setDoc(
        rollupRef,
        rollupMergeFields(contribution("2026-09-13"), "2026-09-13T11:00:00.000Z", increment),
        { merge: true }
      )
    );
    await testEnv.withSecurityRulesDisabled(async (context) => {
      const snap = await getDoc(doc(context.firestore(), "dailyTestValueRollups", `${MEDIC_AID}_2026-09-13`));
      const data = snap.data()!;
      expect(data.testCount).toBe(2);
      expect(data.valueOfTestsOrdered).toBe(20);
      expect(data.byTest.FBC.count).toBe(2);
      expect(data.byTest.FBC.value).toBe(20);
    });
  });

  it("release batch (order + rollup together) matches commitRelease's real write shape", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "orders", "order-medic-release-batch"), {
        clinicId: MEDIC_AID,
        patientId: FIXTURE.patient,
        status: "results_entered",
        results: { FBC: { Hb: "12" } },
      });
    });
    const db = testEnv.authenticatedContext(UID.owner).firestore();
    const batch = writeBatch(db);
    batch.set(
      doc(db, "orders", "order-medic-release-batch"),
      {
        status: "approved",
        reviewedBy: "owner@lab.test",
        reviewedAt: "2026-09-11T10:00:00.000Z",
        valueRollupAppliedAt: "2026-09-11T10:00:00.000Z",
        actingAsOwner: true,
      },
      { merge: true }
    );
    batch.set(
      doc(db, "dailyTestValueRollups", `${MEDIC_AID}_2026-09-14`),
      rollupMergeFields(contribution("2026-09-14"), "2026-09-11T10:00:00.000Z", increment),
      { merge: true }
    );
    await assertSucceeds(batch.commit());
  });
});

describe("firestore rules — medical reports", () => {
  const DRAFT = {
    clinicId: MEDIC_AID,
    patientId: FIXTURE.patient,
    status: "draft",
    chiefComplaint: "Fever",
    findings: "",
    assessment: "",
    plan: "",
  };

  it("technician cannot create, get, or list medical reports", async () => {
    const db = testEnv.authenticatedContext(UID.techMedicAid).firestore();
    await assertFails(setDoc(doc(db, "medicalReports", "report-medic-tech-create"), DRAFT));
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "medicalReports", "report-medic-tech-read"), DRAFT);
    });
    await assertFails(getDoc(doc(db, "medicalReports", "report-medic-tech-read")));
    await assertFails(getDocs(query(collection(db, "medicalReports"), where("clinicId", "==", MEDIC_AID))));
  });

  it("lab_manager can create a draft and finalize it", async () => {
    const db = testEnv.authenticatedContext(UID.managerMedicAid).firestore();
    await assertSucceeds(setDoc(doc(db, "medicalReports", "report-medic-mgr"), DRAFT));
    await assertSucceeds(
      updateDoc(doc(db, "medicalReports", "report-medic-mgr"), {
        status: "final",
        findings: "Temp 38.9C",
        assessment: "Suspected malaria",
        plan: "Start ACT",
        currentVersion: 1,
        versions: [{ version: 1, at: "2026-09-11T10:00:00.000Z" }],
      })
    );
  });

  it("clinic_admin and owner can get a medical report", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "medicalReports", "report-medic-readable"), DRAFT);
    });
    const adminDb = testEnv.authenticatedContext(UID.adminMedicAid).firestore();
    await assertSucceeds(getDoc(doc(adminDb, "medicalReports", "report-medic-readable")));
    const ownerDb = testEnv.authenticatedContext(UID.owner).firestore();
    await assertSucceeds(getDoc(doc(ownerDb, "medicalReports", "report-medic-readable")));
  });

  it("a clinic_admin from another clinic cannot read or write it", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "medicalReports", "report-medic-cross-clinic"), DRAFT);
    });
    const db = testEnv.authenticatedContext(UID.adminGreenAid).firestore();
    await assertFails(getDoc(doc(db, "medicalReports", "report-medic-cross-clinic")));
    await assertFails(updateDoc(doc(db, "medicalReports", "report-medic-cross-clinic"), { findings: "x" }));
  });

  it("a finalized report cannot revert to draft", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "medicalReports", "report-medic-final"), {
        ...DRAFT,
        status: "final",
        findings: "Temp 38.9C",
        assessment: "Suspected malaria",
        plan: "Start ACT",
        currentVersion: 1,
        versions: [{ version: 1, at: "2026-09-11T10:00:00.000Z" }],
      });
    });
    const db = testEnv.authenticatedContext(UID.managerMedicAid).firestore();
    await assertFails(updateDoc(doc(db, "medicalReports", "report-medic-final"), { status: "draft" }));
    await assertSucceeds(
      updateDoc(doc(db, "medicalReports", "report-medic-final"), {
        plan: "Refer to district hospital",
        currentVersion: 2,
        versions: [
          { version: 1, at: "2026-09-11T10:00:00.000Z" },
          { version: 2, at: "2026-09-12T08:00:00.000Z" },
        ],
      })
    );
  });

  it("medical reports cannot be deleted by anyone", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "medicalReports", "report-medic-delete"), DRAFT);
    });
    const ownerDb = testEnv.authenticatedContext(UID.owner).firestore();
    await assertFails(deleteDoc(doc(ownerDb, "medicalReports", "report-medic-delete")));
  });
});

function auditPayload(actorUid: string, extra: Record<string, unknown> = {}) {
  return {
    clinicId: MEDIC_AID,
    actorUid,
    actorEmail: "tech@clinic.test",
    actorRole: "technician",
    actorShift: "day",
    actingAsOwner: false,
    action: "order.resultsEntered",
    targetCollection: "orders",
    targetId: FIXTURE.orderPending,
    targetLabel: "LF-ADA",
    at: "2026-09-08T12:00:00.000Z",
    ...extra,
  };
}

describe("firestore rules — auditLogs actor binding", () => {
  it("create is denied when actorUid is not the signed-in user", async () => {
    const db = testEnv.authenticatedContext(UID.techMedicAid).firestore();
    await assertFails(
      setDoc(doc(db, "auditLogs", "audit-spoof-colleague"), auditPayload(UID.otherMedicAid))
    );
  });

  it("create is allowed when actorUid matches the signed-in user", async () => {
    const db = testEnv.authenticatedContext(UID.techMedicAid).firestore();
    await assertSucceeds(
      setDoc(doc(db, "auditLogs", "audit-self-actor"), auditPayload(UID.techMedicAid))
    );
  });

  // An owner has no membership clinic, so a caller that reaches for
  // useAuth().clinicId writes null here and the entry is silently dropped.
  it("create is denied without a clinic, including for the owner", async () => {
    const techDb = testEnv.authenticatedContext(UID.techMedicAid).firestore();
    await assertFails(
      setDoc(doc(techDb, "auditLogs", "audit-no-clinic"), {
        ...auditPayload(UID.techMedicAid),
        clinicId: null,
      })
    );
    const ownerDb = testEnv.authenticatedContext(UID.owner).firestore();
    await assertFails(
      setDoc(doc(ownerDb, "auditLogs", "audit-owner-no-clinic"), {
        ...auditPayload(UID.owner),
        actorUid: UID.owner,
        clinicId: null,
      })
    );
    await assertSucceeds(
      setDoc(doc(ownerDb, "auditLogs", "audit-owner-with-clinic"), {
        ...auditPayload(UID.owner),
        actorUid: UID.owner,
        clinicId: MEDIC_AID,
      })
    );
  });
});

describe("firestore rules — order payment", () => {
  const cashPayment = {
    method: "cash",
    amount: 150,
    currency: "D",
    reference: null,
    recordedAt: "2026-09-15T10:00:00.000Z",
    recordedByUid: UID.cashierMedicAid,
    recordedByRole: "cashier",
  };

  function newOrder(payment?: Record<string, unknown>) {
    return {
      clinicId: MEDIC_AID,
      patientId: FIXTURE.patient,
      patientLabId: "LF-ADA",
      status: "pending",
      tests: [{ code: "FBC", name: "Full Blood Count" }],
      createdAt: "2026-09-15T10:00:00.000Z",
      ...(payment ? { payment } : {}),
    };
  }

  it("cashier can create an order carrying a cash payment", async () => {
    const db = testEnv.authenticatedContext(UID.cashierMedicAid).firestore();
    await assertSucceeds(setDoc(doc(db, "orders", "order-pay-cash"), newOrder(cashPayment)));
  });

  it("cashier can record a mobile money or bank transfer with its transaction ID", async () => {
    const db = testEnv.authenticatedContext(UID.cashierMedicAid).firestore();
    await assertSucceeds(
      setDoc(
        doc(db, "orders", "order-pay-momo"),
        newOrder({ ...cashPayment, method: "mobile_money", reference: "MP240915.1234" })
      )
    );
    await assertSucceeds(
      setDoc(
        doc(db, "orders", "order-pay-bank"),
        newOrder({ ...cashPayment, method: "bank_transfer", reference: "TRX-0091", amount: 125.5 })
      )
    );
  });

  it("refuses a transfer without a transaction ID, and cash with one", async () => {
    const db = testEnv.authenticatedContext(UID.cashierMedicAid).firestore();
    await assertFails(
      setDoc(doc(db, "orders", "order-pay-momo-noref"), newOrder({ ...cashPayment, method: "mobile_money" }))
    );
    await assertFails(
      setDoc(
        doc(db, "orders", "order-pay-bank-shortref"),
        newOrder({ ...cashPayment, method: "bank_transfer", reference: "AB" })
      )
    );
    await assertFails(
      setDoc(doc(db, "orders", "order-pay-cash-ref"), newOrder({ ...cashPayment, reference: "X-123" }))
    );
  });

  it("refuses a malformed payment: unknown method, negative amount, extra or missing fields", async () => {
    const db = testEnv.authenticatedContext(UID.cashierMedicAid).firestore();
    await assertFails(setDoc(doc(db, "orders", "order-pay-card"), newOrder({ ...cashPayment, method: "card" })));
    await assertFails(setDoc(doc(db, "orders", "order-pay-neg"), newOrder({ ...cashPayment, amount: -1 })));
    await assertFails(setDoc(doc(db, "orders", "order-pay-extra"), newOrder({ ...cashPayment, discount: 20 })));
    const missing: Record<string, unknown> = { ...cashPayment };
    delete missing.recordedByUid;
    await assertFails(setDoc(doc(db, "orders", "order-pay-missing"), newOrder(missing)));
  });

  it("technician cannot attach a payment, but still creates orders without one as before", async () => {
    const db = testEnv.authenticatedContext(UID.techMedicAid).firestore();
    await assertFails(
      setDoc(
        doc(db, "orders", "order-pay-tech"),
        newOrder({ ...cashPayment, recordedByUid: UID.techMedicAid, recordedByRole: "technician" })
      )
    );
    await assertSucceeds(setDoc(doc(db, "orders", "order-nopay-tech"), newOrder()));
  });

  it("owner may record a payment", async () => {
    const db = testEnv.authenticatedContext(UID.owner).firestore();
    await assertSucceeds(
      setDoc(
        doc(db, "orders", "order-pay-owner"),
        newOrder({ ...cashPayment, recordedByUid: UID.owner, recordedByRole: "owner" })
      )
    );
  });

  it("a recorded payment cannot be changed or removed, even by a lab manager", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "orders", "order-pay-locked"), newOrder(cashPayment));
    });
    const mgr = testEnv.authenticatedContext(UID.managerMedicAid).firestore();
    await assertFails(updateDoc(doc(mgr, "orders", "order-pay-locked"), { "payment.amount": 1 }));
    await assertFails(updateDoc(doc(mgr, "orders", "order-pay-locked"), { payment: null }));
    const cashier = testEnv.authenticatedContext(UID.cashierMedicAid).firestore();
    await assertFails(
      updateDoc(doc(cashier, "orders", "order-pay-locked"), {
        payment: { ...cashPayment, method: "mobile_money", reference: "MP-CHANGED" },
      })
    );
  });

  it("the lab still works an order that carries a payment", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "orders", "order-pay-worked"), newOrder(cashPayment));
    });
    const tech = testEnv.authenticatedContext(UID.techMedicAid).firestore();
    await assertSucceeds(
      updateDoc(doc(tech, "orders", "order-pay-worked"), {
        status: "results_entered",
        results: { FBC: { Hb: "12.1" } },
      })
    );
  });

  it("a payment cannot be added to an order after it was placed", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "orders", "order-pay-later"), newOrder());
    });
    const db = testEnv.authenticatedContext(UID.cashierMedicAid).firestore();
    await assertFails(updateDoc(doc(db, "orders", "order-pay-later"), { payment: cashPayment }));
  });
});

describe("firestore rules — service catalogue and service charges", () => {
  const serviceCharge = {
    clinicId: MEDIC_AID,
    patientId: FIXTURE.patient,
    patientLabId: "LF-ADA",
    serviceCode: "CONSULT",
    serviceName: "Consultation",
    createdAt: "2026-09-15T10:00:00.000Z",
    payment: {
      method: "cash",
      amount: 100,
      currency: "D",
      reference: null,
      recordedAt: "2026-09-15T10:00:00.000Z",
      recordedByUid: UID.cashierMedicAid,
      recordedByRole: "cashier",
    },
  };

  it("lab_manager can add and edit a service; technician cannot", async () => {
    const mgr = testEnv.authenticatedContext(UID.managerMedicAid).firestore();
    await assertSucceeds(
      setDoc(doc(mgr, "serviceCatalog", "svc-medic-consult"), {
        clinicId: MEDIC_AID,
        code: "CONSULT",
        name: "Consultation",
        price: 100,
        active: true,
      })
    );
    await assertSucceeds(
      updateDoc(doc(mgr, "serviceCatalog", "svc-medic-consult"), { price: 120 })
    );
    const tech = testEnv.authenticatedContext(UID.techMedicAid).firestore();
    await assertFails(
      setDoc(doc(tech, "serviceCatalog", "svc-medic-tech"), {
        clinicId: MEDIC_AID,
        code: "SURGERY",
        name: "Surgery",
        price: 5000,
        active: true,
      })
    );
  });

  it("cashier can add a new service, unreviewed, and bill it right away — but cannot mark its own entry reviewed", async () => {
    const cashier = testEnv.authenticatedContext(UID.cashierMedicAid).firestore();
    await assertSucceeds(
      setDoc(doc(cashier, "serviceCatalog", "svc-medic-cashier-dressing"), {
        clinicId: MEDIC_AID,
        code: "DRESSING",
        name: "Wound dressing",
        price: 50,
        active: true,
        reviewed: false,
        addedByRole: "cashier",
      })
    );
    await assertFails(
      setDoc(doc(cashier, "serviceCatalog", "svc-medic-cashier-selfreview"), {
        clinicId: MEDIC_AID,
        code: "SELFREVIEW",
        name: "Self-reviewed attempt",
        price: 50,
        active: true,
        reviewed: true,
        addedByRole: "cashier",
      })
    );
    await assertFails(
      setDoc(doc(cashier, "serviceCatalog", "svc-medic-cashier-mislabeled"), {
        clinicId: MEDIC_AID,
        code: "MISLABEL",
        name: "Mislabeled attempt",
        price: 50,
        active: true,
        reviewed: false,
        addedByRole: "lab_manager",
      })
    );
  });

  it("cashier cannot edit or confirm an existing service entry", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "serviceCatalog", "svc-medic-locked"), {
        clinicId: MEDIC_AID,
        code: "LOCKED",
        name: "Locked service",
        price: 50,
        active: true,
        reviewed: false,
        addedByRole: "cashier",
      });
    });
    const cashier = testEnv.authenticatedContext(UID.cashierMedicAid).firestore();
    await assertFails(updateDoc(doc(cashier, "serviceCatalog", "svc-medic-locked"), { price: 75 }));
    await assertFails(
      updateDoc(doc(cashier, "serviceCatalog", "svc-medic-locked"), { reviewed: true })
    );
  });

  it("cashier can create a service charge; technician and lab_manager cannot", async () => {
    const cashier = testEnv.authenticatedContext(UID.cashierMedicAid).firestore();
    await assertSucceeds(setDoc(doc(cashier, "serviceCharges", "charge-cash"), serviceCharge));

    const tech = testEnv.authenticatedContext(UID.techMedicAid).firestore();
    await assertFails(
      setDoc(doc(tech, "serviceCharges", "charge-tech"), {
        ...serviceCharge,
        payment: { ...serviceCharge.payment, recordedByUid: UID.techMedicAid, recordedByRole: "technician" },
      })
    );
    const mgr = testEnv.authenticatedContext(UID.managerMedicAid).firestore();
    await assertFails(
      setDoc(doc(mgr, "serviceCharges", "charge-mgr"), {
        ...serviceCharge,
        payment: { ...serviceCharge.payment, recordedByUid: UID.managerMedicAid, recordedByRole: "lab_manager" },
      })
    );
  });

  it("owner can create a service charge", async () => {
    const owner = testEnv.authenticatedContext(UID.owner).firestore();
    await assertSucceeds(
      setDoc(doc(owner, "serviceCharges", "charge-owner"), {
        ...serviceCharge,
        payment: { ...serviceCharge.payment, recordedByUid: UID.owner, recordedByRole: "owner" },
      })
    );
  });

  it("refuses a service charge missing a required field or carrying a malformed payment", async () => {
    const cashier = testEnv.authenticatedContext(UID.cashierMedicAid).firestore();
    const missingName: Record<string, unknown> = { ...serviceCharge };
    delete missingName.serviceName;
    await assertFails(setDoc(doc(cashier, "serviceCharges", "charge-noname"), missingName));
    await assertFails(
      setDoc(doc(cashier, "serviceCharges", "charge-badpay"), {
        ...serviceCharge,
        payment: { ...serviceCharge.payment, method: "card" },
      })
    );
    await assertFails(
      setDoc(doc(cashier, "serviceCharges", "charge-noref"), {
        ...serviceCharge,
        payment: { ...serviceCharge.payment, method: "mobile_money", reference: null },
      })
    );
  });

  it("a service charge can never be updated or deleted, even by the owner", async () => {
    await testEnv.withSecurityRulesDisabled(async (context) => {
      await setDoc(doc(context.firestore(), "serviceCharges", "charge-locked"), serviceCharge);
    });
    const owner = testEnv.authenticatedContext(UID.owner).firestore();
    await assertFails(updateDoc(doc(owner, "serviceCharges", "charge-locked"), { serviceName: "Changed" }));
    await assertFails(deleteDoc(doc(owner, "serviceCharges", "charge-locked")));
  });
});
