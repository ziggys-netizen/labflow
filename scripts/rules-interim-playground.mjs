/**
 * Interim Firestore rules playground matrix (U1 + isApproved gate).
 * Run via: firebase emulators:exec --only firestore "node scripts/rules-interim-playground.mjs"
 */
import { readFileSync } from "node:fs";
import { initializeTestEnvironment, assertSucceeds, assertFails } from "@firebase/rules-unit-testing";
import {
  doc,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  collection,
  query,
  where,
  getDocs,
} from "firebase/firestore";

const PROJECT_ID = "labflow-6cb9e";
const CLINIC_A = "AXpNONrWaoqcadFCjbrc";
const CLINIC_B = "pu0QdCHByieKUmRSlAtF";
const JOIN_CODE = "TESTJOIN";
const PATIENT_A = "2Km1f1TQgmyzS9MrI8aE";
const PATIENT_B = "patient-clinic-b-seed";
const AUDIT_ID = "4SYKs2FP2gXni5Z4IaYv";

const UID = {
  newUser: "uid-new-user-create",
  pending: "uid-pending-noclinic",
  pendingJoined: "uid-pending-joined-clinic-a",
  approved: "2ZD38NCe5BZyMALw4dRd7rn539j1",
  techA: "d89s9xKL4hYU71OemnGUVP8hTbC3",
  adminA: "uid-clinic-admin-a",
  owner: "GFEtfg30yphZmgWuyZSbdkDVMua2",
  ownerUnapproved: "uid-owner-status-not-approved",
  signedNoClinic: "uid-signed-noclinic-list",
};

const EX_OWN = "ex-tech-a-leave";
const EX_OTHER = "ex-approved-leave";
const EX_B = "ex-clinic-b-leave";

const rows = [];

function record(id, title, expect, ok, detail) {
  rows.push({ id, title, expect, result: ok ? "PASS" : "FAIL", detail: detail || "" });
  const mark = ok ? "PASS" : "FAIL";
  console.log(`${String(id).padStart(2, "0")} ${mark}  ${title} (expect ${expect})${detail ? " — " + detail : ""}`);
}

async function expectAllow(id, title, promise) {
  try {
    await assertSucceeds(promise);
    record(id, title, "Allow", true);
  } catch (err) {
    record(id, title, "Allow", false, err instanceof Error ? err.message : String(err));
  }
}

async function expectDeny(id, title, promise) {
  try {
    await assertFails(promise);
    record(id, title, "Deny", true);
  } catch (err) {
    record(id, title, "Deny", false, err instanceof Error ? err.message : String(err));
  }
}

const testEnv = await initializeTestEnvironment({
  projectId: PROJECT_ID,
  firestore: {
    rules: readFileSync(new URL("../firestore.rules", import.meta.url), "utf8"),
    host: "127.0.0.1",
    port: 8080,
  },
});

await testEnv.withSecurityRulesDisabled(async (context) => {
  const db = context.firestore();
  await setDoc(doc(db, "clinics", CLINIC_A), {
    name: "MedicAid",
    joinCode: JOIN_CODE,
    active: true,
    clinicId: CLINIC_A,
  });
  await setDoc(doc(db, "clinics", CLINIC_B), {
    name: "Green Aid",
    joinCode: "GREENXX",
    active: true,
  });
  await setDoc(doc(db, "users", UID.pending), {
    role: "pending",
    clinicId: null,
    status: "pending",
    clinicRoles: {},
  });
  await setDoc(doc(db, "users", UID.pendingJoined), {
    role: "pending",
    clinicId: CLINIC_A,
    status: "pending",
    clinicRoles: {},
  });
  await setDoc(doc(db, "users", UID.approved), {
    role: "lab_manager",
    clinicId: CLINIC_A,
    status: "approved",
  });
  await setDoc(doc(db, "users", UID.techA), {
    role: "technician",
    clinicId: CLINIC_A,
    status: "approved",
  });
  await setDoc(doc(db, "users", UID.adminA), {
    role: "clinic_admin",
    clinicId: CLINIC_A,
    status: "approved",
  });
  await setDoc(doc(db, "rosterExceptions", EX_OWN), {
    clinicId: CLINIC_A,
    userUid: UID.techA,
    type: "sick",
    startsAt: "2026-08-23T00:00:00.000Z",
    endsAt: "2026-08-24T00:00:00.000Z",
  });
  await setDoc(doc(db, "rosterExceptions", EX_OTHER), {
    clinicId: CLINIC_A,
    userUid: UID.approved,
    type: "leave",
    startsAt: "2026-08-23T00:00:00.000Z",
    endsAt: "2026-08-30T00:00:00.000Z",
  });
  await setDoc(doc(db, "rosterExceptions", EX_B), {
    clinicId: CLINIC_B,
    userUid: "uid-other-clinic-staff",
    type: "leave",
    startsAt: "2026-08-23T00:00:00.000Z",
    endsAt: "2026-08-25T00:00:00.000Z",
  });
  await setDoc(doc(db, "users", UID.owner), {
    role: "owner",
    clinicId: null,
    status: "approved",
  });
  await setDoc(doc(db, "users", UID.ownerUnapproved), {
    role: "owner",
    clinicId: null,
    status: "pending",
  });
  await setDoc(doc(db, "users", UID.signedNoClinic), {
    role: "pending",
    clinicId: null,
    status: "pending",
    clinicRoles: {},
  });
  await setDoc(doc(db, "patients", PATIENT_A), {
    clinicId: CLINIC_A,
    labId: "LF-20260822-TEST",
    name: "TEST-Patient-Fixture-A",
  });
  await setDoc(doc(db, "patients", PATIENT_B), {
    clinicId: CLINIC_B,
    labId: "LF-20260822-TESB",
    name: "TEST-Patient-Fixture-B",
  });
  await setDoc(doc(db, "auditLogs", AUDIT_ID), {
    clinicId: CLINIC_A,
    actorUid: UID.owner,
    action: "patient.softDelete",
    at: "2026-08-22T00:00:00.000Z",
    targetLabel: "LF-20260822-TEST",
  });
});

const unauth = testEnv.unauthenticatedContext().firestore();
const pending = testEnv.authenticatedContext(UID.pending).firestore();
const pendingJoined = testEnv.authenticatedContext(UID.pendingJoined).firestore();
const approved = testEnv.authenticatedContext(UID.approved).firestore();
const techA = testEnv.authenticatedContext(UID.techA).firestore();
const adminA = testEnv.authenticatedContext(UID.adminA).firestore();
const owner = testEnv.authenticatedContext(UID.owner).firestore();
const ownerUnapproved = testEnv.authenticatedContext(UID.ownerUnapproved).firestore();
const newUser = testEnv.authenticatedContext(UID.newUser).firestore();
const signedNoClinic = testEnv.authenticatedContext(UID.signedNoClinic).firestore();

await expectDeny(1, "Unauthenticated read patients", getDoc(doc(unauth, "patients", PATIENT_A)));
await expectDeny(2, "Unauthenticated read clinics", getDoc(doc(unauth, "clinics", CLINIC_A)));
await expectDeny(3, "Unauthenticated read auditLogs", getDoc(doc(unauth, "auditLogs", AUDIT_ID)));

await expectAllow(
  4,
  "New user, no doc yet, create own users/{uid}",
  setDoc(doc(newUser, "users", UID.newUser), {
    email: "new-user@example.test",
    name: "New User",
    role: "pending",
    clinicId: null,
    status: "pending",
    username: null,
    clinicRoles: {},
    activeClinicId: null,
    createdAt: "2026-08-22T00:00:00.000Z",
    approvedBy: null,
    approvedAt: null,
  })
);

await expectAllow(
  5,
  "Pending, clinicId null, update own clinicId",
  updateDoc(doc(pending, "users", UID.pending), { clinicId: CLINIC_A })
);

await testEnv.withSecurityRulesDisabled(async (context) => {
  await setDoc(doc(context.firestore(), "users", UID.pending), {
    role: "pending",
    clinicId: null,
    status: "pending",
    clinicRoles: {},
  });
});

await expectDeny(
  6,
  "Pending, update clinicId AND role",
  updateDoc(doc(pending, "users", UID.pending), { clinicId: CLINIC_A, role: "technician" })
);

await expectDeny(
  7,
  "Approved user with clinic, change own clinicId",
  updateDoc(doc(approved, "users", UID.approved), { clinicId: CLINIC_B })
);

await expectDeny(
  8,
  "Any user, set own role owner",
  updateDoc(doc(approved, "users", UID.approved), { role: "owner" })
);

await expectAllow(9, "Technician clinic A, read patient clinic A", getDoc(doc(techA, "patients", PATIENT_A)));
await expectDeny(10, "Technician clinic A, read patient clinic B", getDoc(doc(techA, "patients", PATIENT_B)));
await expectAllow(11, "Owner, read patient any clinic", getDoc(doc(owner, "patients", PATIENT_B)));
await expectAllow(
  "11b",
  "Owner with status not approved, read patient (isOwner short-circuit)",
  getDoc(doc(ownerUnapproved, "patients", PATIENT_A))
);
await expectDeny(12, "Any user, delete a patient", deleteDoc(doc(techA, "patients", PATIENT_A)));
await expectDeny(
  13,
  "Any user, update an auditLogs entry",
  updateDoc(doc(owner, "auditLogs", AUDIT_ID), { targetLabel: "tamper" })
);
await expectAllow(
  14,
  "Signed-in, no clinic, query clinics by joinCode",
  getDocs(query(collection(signedNoClinic, "clinics"), where("joinCode", "==", JOIN_CODE)))
);
await expectDeny(
  15,
  "Pending user with clinicId set, read clinic patients",
  getDoc(doc(pendingJoined, "patients", PATIENT_A))
);

await expectDeny(
  16,
  "Technician list all clinic leave records",
  getDocs(query(collection(techA, "rosterExceptions"), where("clinicId", "==", CLINIC_A)))
);
await expectAllow(
  17,
  "Technician list own leave records",
  getDocs(
    query(
      collection(techA, "rosterExceptions"),
      where("clinicId", "==", CLINIC_A),
      where("userUid", "==", UID.techA)
    )
  )
);
await expectAllow(18, "Technician get own leave record", getDoc(doc(techA, "rosterExceptions", EX_OWN)));
await expectDeny(19, "Technician get colleague leave record", getDoc(doc(techA, "rosterExceptions", EX_OTHER)));
await expectAllow(
  20,
  "Clinic admin list own-clinic leave records",
  getDocs(query(collection(adminA, "rosterExceptions"), where("clinicId", "==", CLINIC_A)))
);
await expectDeny(21, "Clinic admin get other-clinic leave record", getDoc(doc(adminA, "rosterExceptions", EX_B)));
await expectDeny(
  22,
  "Clinic admin create leave record in other clinic",
  setDoc(doc(adminA, "rosterExceptions", "ex-cross-clinic-write"), {
    clinicId: CLINIC_B,
    userUid: UID.techA,
    type: "leave",
    startsAt: "2026-08-23T00:00:00.000Z",
    endsAt: "2026-08-24T00:00:00.000Z",
  })
);
await expectDeny(
  23,
  "Technician create leave record",
  setDoc(doc(techA, "rosterExceptions", "ex-tech-create"), {
    clinicId: CLINIC_A,
    userUid: UID.techA,
    type: "leave",
    startsAt: "2026-08-23T00:00:00.000Z",
    endsAt: "2026-08-24T00:00:00.000Z",
  })
);
await expectDeny(
  24,
  "Clinic admin delete other-clinic leave record",
  deleteDoc(doc(adminA, "rosterExceptions", EX_B))
);
await expectAllow(25, "Owner get any clinic leave record", getDoc(doc(owner, "rosterExceptions", EX_B)));

await testEnv.cleanup();

const failed = rows.filter((r) => r.result === "FAIL");
console.log("");
console.log(`Matrix ${rows.filter((r) => r.result === "PASS").length}/${rows.length} passed`);
if (failed.length) {
  console.error("Failed rows:", failed.map((r) => r.id).join(", "));
  process.exit(1);
}
