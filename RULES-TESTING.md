# Firestore rules — manual test checklist

LabFlow P4. Rules live in `firestore.rules` and are wired from `firebase.json` together with the existing `firestore.indexes.json`. Application code was not changed.

Use the Firebase console **Rules Playground** (Firestore → Rules → Playground). These rules call `get()` / `exists()` on `users/{uid}`. The playground evaluates those against the **live project database**, not against the simulated request body. Pick real UIDs whose `users/{uid}` documents already have the role, `status`, and `clinicId` described below.

Do not deploy from this checklist. `firebase deploy --only firestore:rules --dry-run` was not run: the Firebase CLI is not installed (`firebase` is not on PATH; `npx firebase` has no local executable). After installing `firebase-tools`, compile with:

```
firebase deploy --only firestore:rules --dry-run --project labflow-6cb9e
```

---

## Join-code decision (no Cloud Functions)

Firestore rules cannot see query constraints, so they cannot express “allow this read only when the client queried `joinCode == …`”.

**Decision:** `allow read` on `clinics/{id}` for **any signed-in user**. Treat `joinCode` as the secret. Do **not** introduce Cloud Functions for lookup.

**Leak:** any signed-in account, including a brand-new `pending` user with no clinic, can `getDocs(collection(db, "clinics"))` and read clinic **names, addresses, TIN, join codes, and other profile fields** for every clinic. Isolation of clinic *existence* is not enforced at the database. Clinical collections (`patients`, `orders`, …) stay clinic-scoped.

`canViewJoinCode` (owner / clinic_admin only) is therefore UI-only until join moves to a callable that returns a clinic id without listing clinics.

---

## How to fill the playground

1. **Location:** document path, e.g. `/patients/p1`.
2. **Authenticated:** on. Set `request.auth.uid` to a real user id.
3. **Provider / email:** unused by these rules (authorisation is the `users/{uid}` doc).
4. **Document data:** the existing document for get/update/delete; for create, the payload being written.
5. For **update**, set both the stored document and the after-write payload.

Expected result is **Allow** or **Deny**.

---

## Negative tests (required)

### 1. Technician must not write result approval fields

| | |
|---|---|
| Auth UID | A `users/{uid}` with `role: "technician"`, `status: "approved"`, `clinicId: "clinicA"` |
| Operation | `update` |
| Location | `/orders/order1` |
| Existing document | `{ "clinicId": "clinicA", "status": "results_entered", "results": { "FBC": { "WBC": "5" } } }` |
| After-write data | Same, plus `"status": "approved"`, `"reviewedBy": "tech@example.com"`, `"reviewedAt": "2026-08-21T00:00:00.000Z"`, `"reviewedByRole": "technician"`, `"reviewedByShift": null` |
| Expect | **Deny** |

Repeat with `role: "clinic_admin"` (same clinic). Expect **Deny**.

Control (same order, technician, only results fields): `status: "results_entered"`, `results`, `resultsEnteredBy`, `resultsEnteredAt`. Expect **Allow**.

Control (same order, `lab_supervisor` or `lab_manager` or `owner`): approval payload. Expect **Allow**.

### 2. clinic_admin must not create a patient

| | |
|---|---|
| Auth UID | `role: "clinic_admin"`, `status: "approved"`, `clinicId: "clinicA"` |
| Operation | `create` |
| Location | `/patients/new1` |
| Data | `{ "name": "Ada", "clinicId": "clinicA", "labId": "LF-20260821-0001", "createdAt": "2026-08-21T00:00:00.000Z" }` |
| Expect | **Deny** (`canRegisterPatient` is false for clinic_admin) |

Control: same payload, auth UID is `technician` / `intern` / `lab_manager` at clinicA. Expect **Allow**.

### 3. Clinic A user must not read a clinic B patient

| | |
|---|---|
| Auth UID | `role: "lab_manager"`, `status: "approved"`, `clinicId: "clinicA"` |
| Operation | `get` |
| Location | `/patients/pB` |
| Existing document | `{ "clinicId": "clinicB", "name": "Other clinic patient" }` |
| Expect | **Deny** |

Repeat with `technician`, `clinic_admin`, `storekeeper` at clinicA. Expect **Deny**.

Control: owner UID (`role: "owner"`, `clinicId: null`). Expect **Allow**.

Control: lab_manager at clinicB. Expect **Allow**.

---

## Further negatives

| # | Actor | Op | Path | Payload / note | Expect |
|---|---|---|---|---|---|
| 4 | technician, clinicA | update | `/orders/order1` | Sets `reviewedByRole` / `reviewedByShift` only | Deny |
| 5 | technician_assistant, clinicA | update | `/orders/order1` | Sets `results` or `status: "results_entered"` | Deny |
| 6 | storekeeper, clinicA | get / list | `/patients/pA` | Patient has `clinicId: "clinicA"` | Deny |
| 7 | intern, clinicA | get / list | `/patients/pA` | Intern `canViewPatients` is false | Deny |
| 8 | intern, clinicA | create | `/patients/new2` | `clinicId: "clinicA"` | Allow (create only) |
| 9 | intern, clinicA | create | `/orders/new1` | Any order | Deny |
| 10 | pending, no clinic | get | `/patients/pA` | | Deny |
| 11 | pending, no clinic | get | `/clinics/clinicA` | Join-code leak: names/addresses visible | **Allow** |
| 12 | any role | delete | `/patients/pA` | Including owner / clinic_admin / lab_manager | **Deny** (P5 soft-delete) |
| 13 | clinic A technician | get | `/orders/orderB` | Order `clinicId: "clinicB"` | Deny |
| 14 | clinic_admin | update | `/users/{other}` | `role: "owner"` or `clinicRoles.{id}.role: "owner"` | Deny |
| 15 | owner | update | `/users/{staff}` | `role: "owner"` | Deny |
| 16 | technician | update | `/users/{self}` | `{ "role": "lab_manager" }` | Deny |
| 17 | technician | update | `/testCatalog/t1` | Any field | Deny |
| 18 | clinic_admin | create | `/inventoryItems/i1` | Item for clinicA | Deny |
| 19 | technician | create | `/inventoryMovements/m1` | Stock movement | Deny |
| 20 | storekeeper | create | `/inventoryItems/i1` | Item for clinicA | Allow |
| 21 | any role | update | `/migrationHistory/h1` | Any field | Deny |
| 22 | any role | delete | `/migrationHistory/h1` | | Deny |
| 23 | clinic_admin clinicA | get | `/migrationHistory/hB` | `clinicId: "clinicB"` | Deny |
| 24 | signed-in user B | create | `/usernames/alice` | `{ "uid": "<user A>" }` | Deny |
| 25 | owner | create | `/patients/p1` | Missing / empty `clinicId` | Deny |
| 26 | owner | create | `/clinics/c1` | Clinic profile | Allow |
| 27 | clinic_admin | create | `/clinics/c2` | | Deny |
| 28 | clinic_admin clinicA | update | `/clinics/clinicB` | Profile fields | Deny |
| 29 | lab_supervisor | update | `/orders/order1` | `status: "needs_correction"` + review fields | Allow |
| 30 | unauthenticated | get | `/clinics/clinicA` | | Deny |

---

## Positive smoke tests

| Actor | Op | Path | Note | Expect |
|---|---|---|---|---|
| Own UID | get | `/users/{uid}` | Any signed-in user, including pending | Allow |
| Own UID, first login | create | `/users/{uid}` | `role`/`status` `pending`, `clinicId` null, empty `clinicRoles` | Allow |
| Own UID | update | `/users/{uid}` | Only `username`, `usernameUpdatedAt` | Allow |
| Pending, no clinic | update | `/users/{uid}` | Only `clinicId: "clinicA"` (join) | Allow |
| Approved staff, two clinics | update | `/users/{uid}` | Legacy mirror of an **existing approved** `clinicRoles` entry (`role`, `clinicId`, `status`, `activeClinicId`) | Allow |
| Owner or clinic_admin | update | `/users/{staff}` | Assign `clinic_admin` / `technician` / etc. Never `owner` | Allow |
| Owner | get | `/users/{anyone}` | Unfiltered staff list | Allow |
| clinic_admin clinicA | get | `/users/{staff}` | Target `clinicId` or `clinicIds` includes clinicA | Allow |
| lab_manager | create/update | `/testCatalog/…` | `clinicId` own clinic / owner any non-empty | Allow |
| storekeeper | create | `/inventoryBatches/…`, `/inventoryMovements/…` | Ledger create; movements not updatable | Allow |
| technician | create | `/specimenMovements/…` | | Allow |
| technician_assistant | update | `/orders/…` | Only `sampleCollectedAt` / `sampleCollectedBy` / source | Allow |
| Signed-in | create | `/usernames/{name}` | `uid` is the caller; doc unclaimed | Allow |
| Owner | create | `/migrationHistory/…` | Non-empty `clinicId` | Allow |

---

## Rules that cannot be enforced without an app change

These are listed here instead of changing application code.

1. **Owner `actingClinicId` is session-only.** It is never written to `users/{uid}`. Rules cannot see it. Owner creates are allowed with **any non-empty** `clinicId` (`isOwner()` without `sameClinic()`). A stolen owner session can write into a clinic the UI did not select.

2. **Join-code queries are indistinguishable from a full clinic list.** See the join-code decision above. Pending users can read every clinic document.

3. **`canViewJoinCode` / clinic directory isolation.** Not enforceable while join runs as a client query on `clinics`.

4. **Self-write of `clinicId` (join).** Spec wanted own-doc writes limited to `username`, `usernameUpdatedAt`, `activeClinicId`. `/join` currently writes `clinicId` only. Rules allow that **once**, on a `pending`/`pending` account with a null `clinicId`. Removing the exception breaks join unless join is moved off the client.

5. **Self-write of `role` / `clinicId` / `status` (clinic switch).** `setActiveClinic` writes the legacy mirror (`legacyMirror`). Rules allow that only when the new triple matches an **existing approved** `clinicRoles.{clinicId}` and the role is not `owner`. A strict “never write role/clinicId/status” rule would break multi-clinic switching. `myClinicId()` is still `userDoc().clinicId` (the active membership), not `clinicRoles`.

6. **Intern duplicate check.** Interns may create patients and must not read the patients collection. `/register` queries patients by DOB/phone before `addDoc`. That list read will **Deny**; intern registration will fail at the duplicate check until the page stops reading patients for interns.

7. **Hard delete of patients.** Denied for everyone, including owner / clinic_admin / lab_manager (`canDeletePatient`). The patients page still calls `deleteDoc`. The button will error until P5 soft-delete.

8. **Migration “owner account confirmation”.** After assign-unassigned, the app writes `{ role: "owner", status: "approved", clinicId: null }` on the owner user doc. **Any write that sets a role to `owner` is rejected**, including this confirmation. The owner account is already `owner`; the write is not required for access.

9. **Owner filling `clinicId` on unassigned records.** Spec said clinicId must not change on update. Migration assigns `{ clinicId: selectedClinicId }` onto records with a missing/null/empty clinicId. Rules allow **that owner-only fill-in** and still deny moving a document from clinic A to clinic B.

10. **Nested `clinicRoles.*.role == "owner"`.** Rules reject owner on the top-level `role` field and on memberships keyed by `clinicId`, `activeClinicId`, and the writer’s clinic. They cannot iterate an arbitrary map, so a hidden extra key `clinicRoles.{other}.role: "owner"` could slip through if a staff write were allowed to change other keys. clinic_admin writes are limited to `clinicRoles.{myClinicId}` so that path is closed for them.

11. **Multi-clinic inactive memberships.** Reads/writes use the **active** `users.clinicId`, matching the app’s `getClinicDocs`. A user approved at clinic B but currently active at clinic A cannot read clinic B until they switch (which updates the legacy mirror).

12. **Historical order import (owner) may create `status: "approved"`.** Staff order **creates** must be `status: "pending"` with null review fields. Owner creates skip that cleanliness check so migration can import released results.

13. **Settings catalogue seed for owner.** The settings page seeds with membership `clinicId`, which is null for the owner. That is an existing app issue; rules correctly require a non-empty `clinicId` on create.

---

## Files created

| File | Role |
|---|---|
| `firestore.rules` | Security rules (default deny catch-all) |
| `firebase.json` | Points Firestore at `firestore.rules` and `firestore.indexes.json` |
| `RULES-TESTING.md` | This checklist |

No application source was modified. Nothing was committed or pushed.
