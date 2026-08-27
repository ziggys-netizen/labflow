# LabFlow Firestore data census — 22 August 2026

**Project:** `labflow-6cb9e`  
**Database:** `(default)` (edition not listed; CLI/MCP could not call `firestore:databases:list`)  
**Generated at:** 2026-08-22T13:16:28.009Z (detail pass); first collection pass 2026-08-22T13:14:12.638Z  
**Purpose:** establish what data actually exists before Q2R browser verification (phases 2–5).  
**Mode:** read only. No writes, no deploys, no Auth setting changes, no repairs.

Q2R C1–C8 and the rest of the verification matrix are **not** in `docs/LabFlow-PRD-v0.5.md` (there is no §19.4). They live in the Q2R prompt of 21 August 2026 (“Verification, revised”, replacing Q2), originally cited as PRD v0.4 §19.4. This census maps to that matrix.

---

## Method

| Path | Result |
|---|---|
| Firebase MCP (`plugin-firebase-firebase`) | Server status **ready**, but **not logged into the Firebase CLI**. `firebase_list_projects` → not logged in. `firebase_update_environment` (`labflow-6cb9e`) → no access. `firebase_get_security_rules` / `firestore_list_collections` → `PRECONDITION_FAILED` (no active project). |
| `npx firebase-tools@latest firestore:databases:list --project labflow-6cb9e` | Failed: `Failed to authenticate, have you run firebase login?` |
| Firebase Admin SDK | No ADC, no service-account env. Not used. |
| Firebase client SDK, **unauthenticated** | **Succeeded.** `getDocs` on known collections returned data. This is itself the rules finding. |
| Identity Toolkit `getProjectConfig` (public API key) | Succeeded; authorised domains listed below. |
| Firebase Rules API `releases/cloud.firestore` without OAuth | HTTP 403. Deployed rules **source was not retrieved**. |

Collections were small (largest: 16 `testCatalog` documents). Each probed collection was read in full. The client SDK cannot `listCollections()`; names were taken from `app/lib/*` and `firestore.rules`. An empty result means “zero documents”, not “collection object exists”. Unknown extra collections cannot be ruled out.

**PII:** this file contains clinic IDs and names, user UIDs, order IDs, Lab IDs, dates, and states. It does **not** contain patient names, phones, national IDs, next-of-kin, addresses, emails, TINs, business registration numbers, join codes, or PIN hashes.

---

## Totals

| Collection / entity | Count |
|---|---|
| Clinics | **3** |
| Users | **5** |
| Patients | **6** |
| Orders | **6** |
| `testCatalog` | **16** (all one clinic) |

Only **one** clinic is populated. Two further clinic documents exist with no patients, orders, staff, or catalogue.

---

## A. Clinics

| ID | Name | Tier | `active` | `createdAt` | Join code present | TIN | Business reg | Responsible person | Region |
|---|---|---|---|---|---|---|---|---|---|
| `AXpNONrWaoqcadFCjbrc` | MedicAid | not set | true | 2026-08-20T05:46:51.572Z | yes | yes | yes | yes | no |
| `pu0QdCHByieKUmRSlAtF` | Green Aid | not set | true | 2026-08-22T01:25:44.102Z | yes | yes | yes | yes | no |
| `qFq81h5oEQ1YwfEHyYcG` | Test | not set | true | 2026-08-22T01:26:33.975Z | yes | yes | yes | yes | no |

**Total clinics: 3.**

Also populated on all three: `address` (yes). Empty on all three: `licenceNumber`, `licenceExpiry`, `tier`, `idleLockMinutes`. Extra unused field on all three: `brandColor` (empty). `createdBy` is a string (value not printed; likely an email).

**Populated for isolation tests:** MedicAid only.

---

## B. Users

**Total: 5.** All `status: approved`. No `pending`. No usernames (`usernames` collection is empty). No `clinicRoles` map on any document. No `clinicIds` / `activeClinicId`. No `pinSet`, no PIN object on the user doc, and **0** `clinicPins` documents.

PIN storage in code (`app/lib/pinIdentity.ts`, `app/lib/pinSession.tsx`): `clinicPins/{clinicId}_{uid}.pin` (`hash`, `salt`, `algo`, `iterations`, `setAt`) plus `users.pinSet`. **Neither exists in production yet.**

### By `role`

| Role | Count |
|---|---|
| `owner` | 1 |
| `lab_manager` | 1 |
| `technician` | 2 |
| `storekeeper` | 1 |
| `clinic_admin` | 0 |
| `lab_supervisor` | 0 |
| `technician_assistant` | 0 |
| `intern` | 0 |
| `pending` | 0 |
| legacy `admin` | **0** |

No role string outside the v0.5 vocabulary. **Legacy `admin` is absent** (significant: that migration already happened for these five accounts).

### By `status`

| Status | Count |
|---|---|
| `approved` | 5 |

### By clinic

| `clinicId` | Count |
|---|---|
| `AXpNONrWaoqcadFCjbrc` (MedicAid) | 4 |
| `null` | 1 (the owner) |
| Green Aid / Test | **0** |

`clinicRoles` populated: **0**. Legacy flat fields only: **5**.

`shift` set: **0**. Non-supervisor carrying a shift: **0**. There is no `lab_supervisor` at all.

**Owner uniqueness:** exactly one user has `role: "owner"` — UID `GFEtfg30yphZmgWuyZSbdkDVMua2`. `clinicId` null, as specified.

| UID | Role | Clinic |
|---|---|---|
| `GFEtfg30yphZmgWuyZSbdkDVMua2` | owner | null |
| `2ZD38NCe5BZyMALw4dRd7rn539j1` | lab_manager | MedicAid |
| `d89s9xKL4hYU71OemnGUVP8hTbC3` | technician | MedicAid |
| `rzJk5Ch5KQXF7iFJa33tRHV0QTG2` | technician | MedicAid |
| `wjLvXLZImKT3hM3ICF5gOHy37Dk2` | storekeeper | MedicAid |

Every user document still has a `name` field (5/5). Emails present; not printed.

---

## C. Patients

All six documents are on MedicAid. None lack `clinicId`. None use `clinicId: "default-clinic"`.

| Clinic | Total | Soft-deleted (`deleted: true`) | Active |
|---|---|---|---|
| MedicAid `AXpNONrWaoqcadFCjbrc` | 6 | 1 | 5 |
| Green Aid | 0 | 0 | 0 |
| Test | 0 | 0 | 0 |
| missing / `default-clinic` | 0 | — | — |

| Question | Count |
|---|---|
| `consentGiven` false or **missing** | **4** (0 explicit `false`; 4 missing; 2 `true`) |
| Neither `dob` nor `age` / `ageYears` | **0** (all six have `dob`; none have `ageYears`) |
| `referringClinician` populated | **2** |
| Lab ID present | **4** |
| Lab ID missing | **2** (one is the soft-deleted row; one is still active) |

Lab IDs that exist: `LF-20260808-3116`, `LF-20260808-5776`, `LF-20260808-7201`, `LF-20260820-8549`.

Soft-deleted document: `lqyj8Qphl4B8VbheMZ3b` (no Lab ID). Active document with no Lab ID: `rlECrqkiksEyXQEO4xnr`.

Patient field names present in the collection (values of identifiers not listed): `address`, `clinicId`, `consentGiven`, `createdAt`, `deleted`, `deletedAt`, `deletedBy`, `deletedByRole`, `deletedByUid`, `deletionReason`, `dob`, `labId`, `name`, `nationalId`, `nextOfKin`, `phone`, `preferredName`, `reasonForVisit`, `referringClinician`, `sampleCollectedAt`, `sampleCollectedBy`, `sex`.

Populated identifier-shaped fields (counts only): `name` 6/6, `phone` 6/6, `nationalId` 3/6, `nextOfKin` 4/6, `address` 4/6, `preferredName` 2/6. **Two patients still carry `sampleCollectedAt` on the patient document** (legacy checkbox path).

The conjunction gate in PRD v0.5 §12.4 (no real names until rules + counsel + retention) is **already violated at the field-presence level**: every patient document has a `name`. This census does not judge whether those strings are synthetic.

---

## D. Orders

All six orders are on MedicAid. Statuses are only the known vocabulary.

| Clinic | pending | results_entered | approved | amended | needs_correction | rejected | cancelled | Other |
|---|---|---|---|---|---|---|---|---|
| MedicAid | 1 | 3 | 2 | 0 | 0 | 0 | 0 | 0 |
| Green Aid | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |
| Test | 0 | 0 | 0 | 0 | 0 | 0 | 0 | 0 |

No unknown status values.

| Question | Report |
|---|---|
| How many orders have ever reached `approved`? | **2** (`status: approved`; none `amended`) |
| How many have `reviewedByRole` **and** `reviewedByShift`? | **0** (`reviewedBy` is set on the two approved rows; role/shift were never stamped) |
| How many have `sampleCollectedAt` but no `reviewedAt`? | **4** (pending-release / not-yet-reviewed population: 3× `results_entered` + 1× `pending`) |
| How many have neither a collection time nor a release time? | **0** (TAT-excluded-by-missing-times: none. Every order has `sampleCollectedAt`) |
| How many share an identical `sampleCollectedAt` to the second with two or more other orders? | **0** (no clusters of size ≥ 3) |
| How many have `sampleCollectedAt` earlier than `createdAt`? | **0** |
| How many have `sampleCollectedAt` later than `reviewedAt`? | **2** (negative TAT) |
| How many carry `legacySingleCollection: true` versus newer per-specimen map? | **`legacySingleCollection` never set (0).** **`sampleCollections` map never set (0).** All six are *implicit* legacy: a lone `sampleCollectedAt` without the flag the current writer would set. |
| How many reference a `patientId` that no longer exists? | **0** orphans |

### Negative TAT (examples use Lab ID only)

| Order ID | Lab ID | `createdAt` | `reviewedAt` | `sampleCollectedAt` |
|---|---|---|---|---|
| `8IYAsFgOO1zsl0nIvA1k` | `LF-20260820-8549` | 2026-08-20T02:26:46.925Z | 2026-08-20T02:27:10.558Z | 2026-08-20T20:14:16.967Z |
| `RZb6ioKbqfpaPLDKRcfs` | `LF-20260808-7201` | 2026-08-10T10:16:41.153Z | 2026-08-20T02:19:38.634Z | 2026-08-20T20:49:32.647Z |

Both were released in the small hours of 20 August and then given a collection time that evening. That matches the known patient-list bulk-stamp behaviour (fixed in git as “Stop bulk-stamping sample collection from the patient checkbox”), not a same-second cluster.

The remaining collection times are also evening-of-20th or early-21st backfills:

- `LF-20260808-5776` pending UA: collected 2026-08-20T20:54:34.298Z, created 2026-08-10T10:50:53.599Z
- Three `MAL-RDT` orders on `LF-20260820-8549`, all `results_entered`, created within **1.6 seconds** (2026-08-21T00:27:30.251Z … 00:27:31.896Z), collected 00:30:21, 00:36:36, 00:37:05 with `sampleCollectedSource: "order"`

### Other order facts

- Tests on each order: **one** (no multi-specimen order exists). Codes in use: `UA`, `FBC`, `MAL-RDT`. Order-line `specimenType` is null; current code can still infer type from the in-memory seed **by code** (`resolveSpecimenType`).
- **All six orders copy `patientName` and `patientLabId` onto the order document.** `patientName` on orders is a standing PRD §11.4 problem (erasure cannot leave names in the log *or* in sibling collections).
- No `selfReleased`, no `collectionTimeDisputed`, no `resultVersions`.

---

## E. Test catalogue

Document IDs are the **bare code** (`FBC`, `UA`, …), **not** `{clinicId}_{code}` as `catalogSeed.ts` writes today. `clinicId` is stamped to MedicAid on all 16.

| Clinic | Docs | `reviewed: true` | `reviewed` false/missing | Carry `resultType` | Carry `specimenType` |
|---|---|---|---|---|---|
| MedicAid | 16 | 0 | **16** (field absent) | **0** (including `parameters[].resultType`) | **0** |
| Green Aid | **0** | — | — | — | — |
| Test | **0** | — | — | — | — |

**Clinics with no catalogue documents: Green Aid and Test.** Current `app/lib/testCatalog.ts` says `TEST_CATALOG` is seed-only and empty catalogues stay empty (no silent runtime menu). Specimen-type **resolution** still falls back to the in-memory seed by test code. An older production build could still have served the in-memory menu; this working tree claims it does not.

In-memory seed has **18** tests. Production MedicAid has **16**. Missing vs seed: **`HB` (Haemoglobin estimation)** and **`SICKLE` (Sickle cell testing)**.

Stored codes: `BGRH`, `FBC`, `FBS`, `HBSAG`, `HCV`, `HIV`, `LFT`, `LIPID`, `MAL-MICRO`, `MAL-RDT`, `PREG`, `RFT`, `STOOL`, `UA`, `VDRL`, `WIDAL`.

`FBS` is stored as name **“Fasting Blood Sugar”**; the current seed names it “Blood glucose”.

**Sickle cell:** does **not** appear in any catalogue document (no `SICKLE` code, no “Sickle…” name). It exists only in the in-memory seed.

Parameters arrays exist (legacy shape) but have no `resultType`. `reviewed` was never written.

---

## F. Everything else

Firestore returns empty for a name that was never written. “Exists?” below means “unauthenticated `getDocs` succeeded”. Count 0 ⇒ no documents.

| Collection | Readable | Count | Per clinic |
|---|---|---|---|
| `inventoryItems` | yes | 0 | — |
| `inventoryBatches` | yes | 0 | — |
| `inventoryMovements` | yes | 0 | — |
| `specimenMovements` | yes | 0 | — |
| `auditLogs` | yes | **1** | MedicAid 1 |
| `migrationHistory` | yes | 0 | — |
| `preApprovals` | yes | 0 | — |
| `joinAttempts` | yes | 0 | (not used in current code; join failures go to `auditLogs` as `joinCode.failedAttempt`) |
| `usernames` | yes | 0 | global |
| `clinicPins` | yes | 0 | — |
| `nonconformingEvents` | yes | 0 | — |
| `serverJoinRateLimits` | yes | 0 | (Admin join rate-limit docs; none yet) |
| `labOrders` | yes | 0 | (code uses `orders`, not `labOrders`) |
| `catalogue` | yes | 0 | (code uses `testCatalog`) |

### `auditLogs`

- Collection readable: **yes**
- Entry count: **1**
- Date range: 2026-08-22T04:24:51.855Z … 2026-08-22T04:24:51.855Z (single event)
- Action: `patient.softDelete`
- Actor role: `owner`; `actingAsOwner: true`
- Target: `patients/lqyj8Qphl4B8VbheMZ3b` (the soft-deleted patient, **no Lab ID**)
- Fields match `app/lib/auditTypes.ts` (`actorUid`, `actorRole`, `targetLabel`, `detail`, …)

**Does any entry contain a patient name in `targetLabel` or a reason field?**

**Yes — 1 of 1.** `targetLabel` is 14 characters, four tokens, pattern `NameToken NameToken other other`, **no Lab ID**. That is the shape of a personal name plus two short trailing tokens, not `auditTargetLabel()` (`Lab ID · record type` or `[erased]`). The name is **not** copied here. `detail.reason` looks like a coded phrase (five tokens, one id-like), not a name.

This is the PRD §11.4 failure mode: the deleted patient had no Lab ID, so the writer had nothing legal to put in `targetLabel`. Current data-quality UI can still build labels from `patientName` + Lab ID (`app/owner/clinics/[clinicId]/data-quality/page.tsx`).

---

## G. Deployed security rules

### Working assumption

Repo docs and `DEPLOY-2026-08-21.md` Stage C: **rules file not deployed**. Historically the live database is open or on a dated test-mode allow. That assumption was **verified at the read layer**, not by downloading the ruleset.

### Deployed source (required: “in full”)

**Not retrieved.** Attempts:

1. MCP `firebase_get_security_rules` — no active project / not logged in.
2. CLI `firebase …` — not logged in.
3. `GET https://firebaserules.googleapis.com/v1/projects/labflow-6cb9e/releases/cloud.firestore` — HTTP 403: *Method doesn't allow unregistered callers*.

There is therefore **no ruleset text to paste**. Do not treat the working-tree `firestore.rules` as live. That file is default-deny with claims-first helpers; **it is not what the client just used**.

### Behavioural substitute (read-only)

Unauthenticated `getDocs` **returned** `clinics`, `users`, `patients`, `orders`, `testCatalog`, and `auditLogs`.

That is incompatible with the repo rules (those reads would Deny). It is compatible with:

- `allow read, write: if true;`, or
- `allow read, write: if request.time < timestamp.date(Y, M, D);` whose date is **still in the future** as of 22 August 2026.

**Cannot distinguish those two without the source.** Writes were **not** probed (read-only mandate). Do not claim writes are open; do claim **unauthenticated reads of clinical collections are allowed**.

That **does** change isolation verification (Q2R B3, C5) and the “rules do not exist / are not deployed” posture in PRD v0.5 §12.2 and the old v0.2 §10 note. It is **not** PRD v0.5 §13.4 (that section is “no native app”). If the dated-allow form is what is live, the clock is part of the threat model: when the date lapses, the app will fail closed without a deploy of the real rules.

### Authentication authorised domains

From Identity Toolkit `getProjectConfig` (public API key):

| Domain | Listed? |
|---|---|
| `localhost` | yes |
| `labflow-6cb9e.firebaseapp.com` | yes |
| `labflow-6cb9e.web.app` | yes |
| **`labflow-six.vercel.app`** | **yes** |
| `labflow-git-wip-inventory-and-migration-buck-holdings.vercel.app` (Q3P preview) | **no** |

Production Google popup on `labflow-six.vercel.app` is not blocked by authorised-domains. The Q3P preview host is still missing (already recorded in `VERIFICATION-2026-08-21.md`). This census did not change Auth settings.

---

## Verdict — Can we run Q2R verification with this data?

**Not as a two-clinic isolation pass, and not as a claims/join/export pass.** A narrow subset of Phase 2 UI rows can be walked on MedicAid **if** everyone treats production Firestore as world-readable and does not type real names.

### 1. Do two populated clinics exist?

**No.** Three clinic **documents** exist; **one** has data.

| Clinic | Staff | Patients | Orders | Catalogue |
|---|---|---|---|---|
| MedicAid | 4 (plus owner) | 6 | 6 | 16 (legacy shape) |
| Green Aid | 0 | 0 | 0 | 0 |
| Test | 0 | 0 | 0 | 0 |

To make C5–C7 meaningful, **do not create a fourth clinic**. Pick Green Aid **or** Test and add, at minimum:

- **1 staff user** of a clinical role at that clinic (technician is enough for C5).
- **≥3 patients** (synthetic names only — the name gate is already broken, do not make it worse with real people).
- **≥2 orders** on those patients (so a pasted clinic-B URL is a real document, not 404).
- **Catalogue seed** for that clinic (`{clinicId}_{code}` IDs, with `specimenType` / `reviewed`). Empty catalogue in this tree blocks ordering rather than falling back.

For the full C1–C8 role matrix, also create (or role-assign) **intern**, **technician_assistant**, **clinic_admin**, and **lab_supervisor** (supervisor needs a `shift`). Those roles do not exist on any user today.

### 2. Which Q2R rows can run today vs need data first?

Matrix source: Q2R prompt, 21 August 2026.

#### Phase 2 — Foundations

**A. Identity and claims (R3)** — **cannot run until Stage B** (custom claims + `/api/auth/claims/sync`). Health is 503; no `clinicRoles`; tokens will not show `clinicId` / `role` / `shift`.

| Row | Today? |
|---|---|
| A1–A7 | **No — Stage B** |

**B. Join (R4 + S3)** — **cannot run until Stage B** (Admin join routes). With **open rules**, B3 (“list `clinics` denied”) will **fail** if tried now: this census just listed them with no auth.

| Row | Today? |
|---|---|
| B1–B9 | **No — Stage B** (B3 also needs Stage C rules) |

**C. Enforcement and isolation**

| Row | Test | Today? |
|---|---|---|
| **C1** | storekeeper → `/orders/new/{id}` redirects `/inventory` | **Yes, data exists** (storekeeper UID `wjLvXLZImKT3hM3ICF5gOHy37Dk2`). UI-only until rules deploy. |
| **C2** | intern → `/patients` redirects `/register` | **Need an intern user** |
| **C3** | technician_assistant → `/orders/new/{id}` redirects `/patients` | **Need that role** |
| **C4** | clinic_admin → `/register` redirects away | **Need a clinic_admin** |
| **C5** | clinic A staff pastes clinic B patient URL | **Need clinic B patients.** Clinic A staff exists. |
| **C6** | clinic A admin, any route to clinic B | **Need clinic_admin + clinic B data**; “no such route” is mostly a nav check |
| **C7** | owner `/patients` sees both clinics | Owner exists, but clinic B has **zero** patients — the list cannot demonstrate isolation |
| **C8** | technician `/patients` has no delete control | **Yes, data exists** (two technicians). UI-only until rules. |

#### Phase 3 — Clinical loop

| Row | Today? |
|---|---|
| D1 new clinic auto-seeds 16 unreviewed | **Can try on Green Aid/Test** (they have **no** docs). MedicAid already has 16 **legacy** docs; `onlyIfEmpty` seed would no-op. Expect **18** from current seed (includes HB + SICKLE), not 16. |
| D2–D5 unreviewed banner / caveat | MedicAid catalogue has no `reviewed` field (treated as unreviewed). Possible on MedicAid **if** the preview build is what you open. |
| E1–E4 multi-specimen blood+urine | **No existing order is multi-specimen.** Must create one. Catalogue has no `specimenType`; inference is by code. |
| E5 legacy single timestamp | **Yes — all six orders are implicit legacy** (`sampleCollectedAt` only). None have `legacySingleCollection: true`, so the **flag** may not show even though TAT code treats them as legacy. |
| F1 `/review` as lab manager | **Yes** — 3× `results_entered` on MedicAid; lab_manager exists. |
| F2 H/L flags | Depends on result values + ranges; catalogue has no typed `resultType`. Fragile. |
| F3 self-release refused | Needs two distinct approvers on one order; only **one** lab_manager and **no** supervisor. Owner can act as second. Possible with care. |
| F4 / F5 role and shift on approve | **Existing approved rows lack `reviewedByRole` / `reviewedByShift`.** Can only verify on a **new** approval. No supervisor for F5. |
| F6–F9 send-back / print | Possible on MedicAid `results_entered` / `approved` rows. |
| G1–G6 amendment | **No `amended` orders, no `resultVersions`.** Must create after a fresh approval. |
| H1 approved count non-zero | **Yes** (2). |
| H2–H5 TAT | **Do not trust these six orders.** Two approved rows have **negative TAT**. Zero orders lack collection time, so H3’s “excluded” population is empty. No multi-specimen order for H5. Data-quality tool (H4) will light up on the two negative-TAT rows — and its UI can write names into `targetLabel`. |

#### Phase 4 — Offline (I1–I11)

Independent of tenant data **except I8** (rules rejection). I8 **cannot** be demonstrated until Stage C: with open rules there is nothing to reject.

#### Phase 5 — Server features

| Block | Today? |
|---|---|
| J1–J6 export | **No — Stage D** (Resend) and Stage B (Admin) |
| K1–K4 audit | K1 can write more client audit rows **now** (rules are open). K2 playground deny needs **deployed** create-only rules (Stage C). K3 needs a clinic_admin and a second clinic’s logs. One existing row already has a name in `targetLabel`. |
| L1–L5 soft-delete | **Partially.** One deleted patient exists (`lqyj8Qphl4B8VbheMZ3b`, no Lab ID). Restore/re-register can be tested; do not use real names. |
| M1–M5 migration | **No unassigned records** (`clinicId` missing / `default-clinic` = 0). M1 “claim unassigned with clinic B” has nothing to claim. Import (M3–M5) needs a file and an importer role (owner or lab_manager). |

### 3. Impossible until Stage B and C (join, claims, export)

From `DEPLOY-2026-08-21.md`: Stage B (OIDC / `/api/health` ok) is **not** green; Stage C (rules) **not started**; Stage D (Resend/cron) **not started**.

| Depends on | Q2R rows |
|---|---|
| Stage B (Admin SDK, claims) | A1–A7, B1–B2, B4–B9, J* (server), pre-approval consume |
| Stage C (deployed rules) | B3, C5 as a **security** test (not just UI), I8, K2 |
| Stage D (Resend) | J1, J3, J6 email path |

Running B3 **before** Stage C is a guaranteed fail and teaches nothing.

### 4. Too broken to test against — clean **before** verification, do not clean during it

Recommend only (not executed):

1. **Negative TAT / backfilled collection** on `LF-20260820-8549` (approved UA) and `LF-20260808-7201` (approved FBC). Unsuitable for H2. Prefer Q6’s dispute-not-delete tool **after** that tool stops putting names in `targetLabel`, or leave them and **exclude** those Lab IDs from TAT assertions.
2. **`patientName` denormalised on all 6 orders.** Blocks honest erasure tests. Do not “fix in passing” during Q2R; it is a product change.
3. **Audit `targetLabel` name** on the one `patient.softDelete`. Same PRD rule. Soft-deleted patient has no Lab ID, so a legal label cannot be reconstructed from Lab ID.
4. **Three near-duplicate `MAL-RDT` orders** on `LF-20260820-8549` created 1.6s apart. Review-queue counts will look like three patients. Do not use them as independent lifecycle samples.
5. **MedicAid catalogue** is the old 16-test, code-as-ID, no `specimenType` / `resultType` / `reviewed` shape, and it **omits SICKLE and HB**. D1/D4/E1 against MedicAid will not match the current seed. Seed Green Aid/Test from the current function instead of “repairing” MedicAid mid-verification.
6. **4/6 patients missing `consentGiven`.** Fine for isolation; not fine as a consent-compliance sample.
7. **Open unauthenticated reads.** Any browser verification is happening on a public clinical dataset. Do not add real names. Consider whether Q2R should wait for Stage C even for “UI-only” C5.

### 5. Unasked findings

- Client SDK with **no sign-in** could read every clinical collection probed. Isolation in the app is still browser-only (PRD v0.2 §10, still true in production).
- Extra clinic documents **Green Aid** and **Test** already exist (created ~2026-08-22T01:25Z). The plan item “create a second clinic” is the wrong next step; **populate** one of them.
- `brandColor` on clinics; `createdBy` string; patient-level `sampleCollectedAt` still on 2/6 patients.
- `joinAttempts` is unused; rate limits live in `serverJoinRateLimits` (empty).
- No inventory, PIN, usernames, pre-approvals, NCEs, or migration history — inventory / PIN / import rows have no production fixtures.
- Orders store `patientName`. Review, orders list, connection queue, and data-quality pages display it. Audit helper `auditTargetLabel()` is not used everywhere.
- Catalogue document IDs are global codes. A second clinic seeded with the **old** ID scheme would collide; the **current** seeder prefixes `clinicId`. MedicAid’s 16 docs would **not** collide with `{greenAid}_FBC`.
- Preview authorised domain still missing; production `labflow-six.vercel.app` **is** listed.
- MCP was **not** usable for this census despite “ready”; the proof of open rules is that the public client config was enough.

---

## Does this change the plan?

Yes. Q2R Phase 2 isolation is not waiting on “create a second clinic” — Green Aid and Test already exist and are empty. It is waiting on **staff + patients + orders + a seeded catalogue in one of those clinics**, plus missing roles (intern, assistant, clinic_admin, supervisor) if C2–C4/F5 are in scope. Claims, join, and export rows are still gated on Stage B/C/D; **do not** run B3 against today’s open database and call it a product bug. The two approved orders are unsafe TAT fixtures (collection after release) and every order copies a patient name, so H2/G/K should use **new** synthetic records, not the six MedicAid orders. Treat the live database as world-readable until Stage C; do not put real names in to “make C5 work.”
