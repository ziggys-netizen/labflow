# LabFlow product gaps vs data-protection MUST / SHOULD

**Date:** 23 August 2026  
**Against:** [`DATA-PROTECTION-FRAMEWORKS-2026-08-22.md`](DATA-PROTECTION-FRAMEWORKS-2026-08-22.md) items 1–23  
**Scope:** what the codebase can evidence or do. Not legal advice. No new legal conclusions beyond that memo.

**Status vocabulary**

| Status | Meaning |
|---|---|
| **present** | A product capability exists that a lab could show an auditor |
| **partial** | Related code exists; a named requirement is still missing |
| **absent** | No product surface |
| **out of scope (config/legal, not product)** | Counsel, contracts, or console/config — not a feature to ship first |
| **not applicable yet** | Triggered only by a market or customer the product does not have |

Priority is set only where the gap is a product capability.

---

## Already in good shape (do not rebuild)

These are the substrates most MUST/SHOULD items assume. Gaps below should reuse them.

- **Unique user IDs + device vs person.** Firebase Auth UID is the authorisation key; username is display-only (`app/lib/identity.ts`). Google popup sign-in (`app/lib/AuthContext.tsx`, `app/login/page.tsx`). Staff PIN is attribution, not authorisation (`app/lib/pinIdentity.ts`, `app/lib/pinSession.tsx`, `app/lib/PinGate.tsx`). Sensitive PIN actions include release, amendment, erasure, export, staff.
- **Roles, clinic scope, membership.** Capability predicates in `app/lib/permissions.ts` (tested in `app/lib/permissions.test.ts`). Clinic-scoped queries in `app/lib/clinicScope.ts`. Membership map in `app/lib/membership.ts`. Custom claims `{ clinicId, role, shift }` in `app/lib/userClaims.ts`. Route guards in `app/lib/ProtectedRoute.tsx`. Owner acting clinic is session-only (`app/lib/ActingClinicPrompt.tsx`).
- **Append-only audit.** Client `app/lib/audit.ts` / `app/lib/auditTypes.ts`; server `app/lib/auditAdmin.ts`; viewer + CSV at `app/owner/clinics/[clinicId]/audit/page.tsx`. Rules: create-only, no update/delete (`firestore.rules`). Labels are designed to hold Lab ID, not names.
- **Offline continuity (built, not exercised).** Persistent Firestore cache (`app/lib/firebase.ts`), write queue (`app/lib/writeQueue.ts`), connection UI (`app/lib/ConnectionContext.tsx`). Design and acceptance matrix: `OFFLINE.md`.
- **Export with a paper trail.** `POST /api/reports/export` (`app/api/reports/export/route.ts`) builds Excel on the server, emails via Resend or downloads, rate-limits, and writes `report.exported` with type, range, row count, recipient, delivery (`S7-EXPORT.md`).
- **Soft-delete, not hard-delete.** `app/lib/patientSoftDelete.ts`; recycle bin `app/patients/deleted/page.tsx`. Firestore denies patient/order delete. Erasure is owner-only in permissions (`canExecuteErasure`) but has no workflow yet.
- **Interim rules + staff gates.** Clinic-scoped clinical collections, `isApproved()` gate, PIN collection, server-only pre-approvals (`firestore.rules`, `RULES-INTERIM.md`). Pre-approvals: `app/lib/preApprovals.ts`, `app/lib/preApprovalServer.ts`, `app/api/staff/pre-approvals/`, lapse cron `app/api/cron/pre-approvals/lapse/route.ts`.

**Production caveat (from existing notes, not re-probed here):** `RULES-INTERIM.md` and `DATA-CENSUS-2026-08-22.md` record that live Firestore was still open / rules deploy blocked as of 22 August 2026. Repo rules are not the same as production until someone confirms deploy.

---

## MUST

### 1. Gambian PDPA 2025 — what the product can support

**Status:** **partial**  
**Priority:** P0

**Evidence**

| Support a controller would need | What exists |
|---|---|
| Identify who accessed or changed a record | Audit log + PIN session |
| Limit access by clinic and role | Rules + `permissions.ts` + claims |
| Record a lawful basis per patient | `lawfulBasis` on register (`app/register/page.tsx`) |
| Stop processing / hide a record | Soft-delete + recycle bin |
| Produce a copy of data | Server Excel export |
| Know where data is hosted | Vercel `fra1` in `vercel.json`; Firestore region **not recorded in product** |
| Erase on request and notify recipients | `canExecuteErasure` + `patient.erasure` action name + PIN gate — **no UI or write path** |
| Configurable retention | Specified on clinic in PRD v0.5 §12.9 / §12.11 — **not on `ClinicRecord`** (`app/lib/clinics.ts`) |
| Breach file in 72 hours | See item 2 |

Register still **requires** a consent checkbox in addition to `lawfulBasis`, and the copy says counsel must confirm before production (`app/register/page.tsx`). Import still requires `consentGiven: true` (`app/lib/migration.ts`). PRD v0.5 §16 lists “lawful-basis field replacing consent as the ground” as specified, not built — the field landed; the replacement did not.

**Gap**

- Finish the two-gate lawful-basis model (clinic-type default + per-patient record; consent only when the basis is consent).
- Owner erasure workflow that actually redacts identifiers, leaves an un-erasable audit row, and lists recipients to notify (export, print, referrals).
- Clinic fields `dataResidencyRegion` and `retentionPolicy` as configuration, plus a one-page “processing register” export (categories, processors, purposes) a DPO can attach to a filing.
- Do not treat counsel, commencement, or regulator identity as product work.

---

### 2. 72-hour breach detection / incident clock

**Status:** **absent**  
**Priority:** P0

**Evidence.** No incident, breach, or downtime collection. `AUDIT_ACTIONS` has clinical and staff events, not `security.incident` (`app/lib/auditTypes.ts`). `nonconformingEvents` is sample-rejection NCE (`app/lib/nonconformingEvents.ts`), not a security incident. Write-queue rejections are device sync failures (`app/lib/writeQueue.ts`), not a detected breach.

**Gap.** Product-shaped minimum:

- An incident record: discovered-at (the clock start), nature, systems, likely data subjects / clinic, containment, whether notified, notification timestamps.
- A 72-hour countdown from `discoveredAt` on an owner/admin surface.
- An evidence pack (CSV/PDF) of audit rows in the window, export history, and affected patient/order IDs — built from the existing audit + `report.exported` log.
- Detection itself will never be complete in-app (cloud provider alerts live in GCP/Vercel). Wire those as *inputs* to the same clock.

---

### 3. Sensitive / health data — lawful basis and heightened controls

**Status:** **partial**  
**Priority:** P0

**Evidence.** Test results sit on `orders` with clinic scope and role gates (`canEnterResults`, `canApproveResults`, `canAmendResult`). Heightened operational controls: PIN re-prompt for release/amendment/export; intern locked to registration + own print (`internAllowedPath`); storekeeper has no patient capabilities; hard delete denied; amendment versions (`app/lib/resultAmendment.ts`); critical-result notification record (`app/lib/criticalResults.ts`).

What is missing versus “treat results as a special category”:

- No `specialCategory` / health-data flag on collections (everything clinical is implicitly health data; staff/clinic TIN is not).
- Lawful basis is a free-ish enum (`consent`, `legal_obligation`, `vital_interests`, `public_task`) plus a mandatory consent tick — not a clinic-configured default, not bound to result processing after registration.
- No purpose limitation on export (any `canExportData` role can pull patients/orders/results/inventory).
- No encryption of fields at the application layer (relies on Firestore/Vercel TLS and Google-at-rest).

**Gap.** Clinic default lawful basis; drop mandatory consent unless basis is consent; mark export/print/email as health-data disclosures in audit detail (partially true for `report.exported`); keep relying on rules + PIN rather than a second parallel ACL.

---

### 4. Adequacy-or-safeguards recording on cross-border transfers

**Status:** **partial**  
**Priority:** P1

**Evidence.** PRD v0.5 §12.7 specifies a documented transfer assessment per destination. `ClinicRecord` has no `dataResidencyRegion` and no assessment object (`app/lib/clinics.ts`). Docs name processors (Firestore, Vercel, Resend) in `S7-EXPORT.md` and `docs/ADR-001-trusted-server.md` — those are engineering notes, not a retrievable per-deployment record.

**Seeded 23 August 2026 (Firestore destination only).** Deployment-level typed register in `app/lib/transferAssessments.ts`; counsel brief in [`TRANSFER-ASSESSMENT-FIRESTORE-NAM7-2026-08-23.md`](TRANSFER-ASSESSMENT-FIRESTORE-NAM7-2026-08-23.md). Fields: destination (Google LLC / Cloud Firestore / `nam7`), data categories, purpose, duration, `legalBasisLimb` `s.37(1)(a)`, `legalGateway` `pending`, date, reviewer `null`. **`receivingCountryLawAssessment` is `PENDING LEGAL REVIEW`** — no machine-drafted conclusion. `transferAssessmentExportRows()` is the export surface. W2 (the work item that was to name the Firestore collection path) is not in this tree; nothing was written to live Firestore. Vercel `fra1` and Resend are listed as known destinations and are **not** assessed.

**Gap.** Owner/clinic read path and a Firestore-backed collection (when W2 is specified). Separate assessments for Vercel, Resend, backup/DR, and support-access locations. Do not hardcode “Gambia is adequate” in code.

---

### 5. Per-transfer notification / filing (what left, to whom, why)

**Status:** **partial**  
**Priority:** P1

**Evidence.** `report.exported` records actor, clinic, report type, date range, row count, recipient, delivery (`app/api/reports/export/route.ts`). Print is local (`app/patients/[patientId]/print/page.tsx`) and is not a disclosure log. Referral is a pair of fields on register (`referredOutside`, `referringFacility`) with no outbound packet log. Email of PHI goes to the signed-in user’s address only (good), via Resend (a transfer).

**Gap.** A disclosure / transfer log that covers: Excel export (already), email, print-to-PDF if retained, future DHIS2 push, and any support/admin access. Fields: sender clinic, recipient, data classes, purpose, timestamp, legal basis. A “generate DPA notification draft” from that log is enough; the filing itself is legal.

---

### 6. DPIA inputs for Nigerian deployments

**Status:** **absent**  
**Priority:** P2 (when a Nigerian clinic is real)

**Evidence.** No DPIA template, processing inventory, or “location of data processing” field (GAID Art. 34(2)(f) is called out in the memo). Clinic profile has Gambian regions (`GAMBIA_HEALTH_REGIONS` in `app/lib/clinics.ts`), not hosting location.

**Gap.** One export that dumps: data categories (patients, orders/results, inventory, audit, PINs), purposes, roles who can see them, processors (Firestore / Vercel / Resend), regions (once item 10 exists), retention policy (once item 15 exists), transfer assessments (item 4), and last 12 months of `report.exported`. That is DPIA *input*, not the DPIA.

---

### 7. Ghana controller registration

**Status:** **out of scope (config/legal, not product)**

**Evidence.** Clinic profile already stores name, address, TIN, business registration, responsible person, licence number/expiry (`app/lib/clinics.ts`, owner clinic page). That can populate a registration form. There is no Ghana DPC integration and there should not be.

**Gap.** None as a feature. Optional: a “controller details” print-out from the clinic profile when a Ghanaian deployment is configured.

---

### 8. HIPAA BAA / 45 CFR 164.312 (only if a US covered-entity customer)

**Status:** **not applicable yet** for the BAA, 60-day BA report, and subcontractor flow-down. **partial** for the technical Required specs.

**Evidence**

| 164.312 Required spec | Status | Evidence |
|---|---|---|
| Unique user identification | **present** | Firebase UID (`app/lib/identity.ts`) |
| Emergency access procedure | **absent** | Owner acting-clinic is operational break-glass, not an emergency-access procedure when the usual login is unavailable |
| Audit controls | **present** | `auditLogs` + viewer |
| Person or entity authentication | **partial** | Google account + PIN; product does not enforce MFA |
| Transmission security | **partial** | HTTPS to Firebase/Vercel (platform). No product-level integrity check on the wire |
| Automatic logoff (addressable) | **present** | Configurable idle lock, default 5 minutes (`app/lib/pinIdentity.ts`, clinic `idleLockMinutes`) |
| Encryption (addressable) | **partial** | Transit via TLS; at-rest is Google’s default, not documented or configurable in-app |

BAA, subcontractor flow-down, HHS access to books, return/destroy at termination, 60-day BA→CE breach report: **out of scope (config/legal, not product)** except that item 2’s incident clock should accept a 60-day (and proposed 24-hour) BA deadline as a second timer.

**Priority:** P2 for emergency-access procedure + MFA *if* a US CE is on the roadmap; otherwise leave.

---

### 9. GDPR SCCs + TIA

**Status:** **out of scope (config/legal, not product)**

**Evidence that would help a TIA (not a substitute):** processor list in `S7-EXPORT.md` / ADR-001; Vercel region `fra1`; audit + export logs; clinic-scoped rules; PIN hashes (PBKDF2) not stored in the clear (`app/lib/pinIdentity.ts`). Missing: Firestore database region in product config, transfer assessments (item 4), encryption statement, government-access note (legal).

**Gap.** Reuse items 4, 5, and 10 as the evidence pack. Do not implement SCC signing in the app.

---

### 10. No localisation — hosting location as configuration

**Status:** **partial**  
**Priority:** P1

**Evidence.** No code path requires data to stay in The Gambia (good). Hosting *is* an architectural assumption: Firebase project `labflow-6cb9e` (census), Next.js on Vercel with `"regions": ["fra1"]` (`vercel.json`). `ClinicRecord` has no `dataResidencyRegion`. Firestore location is now recorded as **`nam7`** on the deployment transfer-assessment seed (`app/lib/transferAssessments.ts`) — a 23 August 2026 founder decision to stay and seek counsel, not a legal conclusion. PRD v0.5 §12.7 / §17 q11 still treat the *s.37 answer* as open.

**Gap.** Record `dataResidencyRegion` (and backup/DR region if known) on the clinic or deployment config. Do not add a product feature that *forces* local hosting. Location is written down; **counsel has not answered**. Scheduled backups remain Disabled (separate finding on the same seed).

---

## SHOULD

### 11. ISO 15189:2022 clause 7.6

**Status:** **partial**  
**Priority:** P1

| 7.6 ask | Status | Evidence / gap |
|---|---|---|
| Supplier validation + lab verification before introduction | **absent** | No validation pack, checklist, or sign-off record |
| Authorised, documented, validated change control | **partial** | Catalogue review banner (`app/lib/CatalogReviewBanner.tsx`, `app/settings/page.tsx`); no LIS release/change log for the product itself |
| Docs available to authorised users | **partial** | In-app copy only; no operator manual inside the product |
| Cybersecurity / unauthorised access, tampering, loss | **partial** | Rules + roles + PIN + create-only audit. Live rules deploy unverified. No backup/restore evidence |
| Record system failures + immediate/corrective action | **partial** | Write-queue rejections and NCEs are not an LIS failure log with RCA |
| Systematic checks of calculations and data transfers | **partial** | H/L flags (`app/lib/resultFlag.ts`); `calculated` result type exists but is filtered out of the catalogue UI (`app/settings/page.tsx`). No transmission-check job |
| Downtime plans (7.6.4) | **partial** | Offline path (item 12); no lab-facing downtime SOP or RCA log |
| Off-site provider complies with 15189 (7.6.5) | **absent** | Hosting contract/evidence pack — mostly legal; product can attach processor + region (items 4, 10) |

**Gap.** A lab “LIS evidence” page: version in use, last verified-at, change log, last downtime, last restore test, last failed-sync summary. That is what 7.6.2 (lab remains responsible) actually needs from a vendor.

---

### 12. Offline continuity as a tested capability (ISO 15189 7.8)

**Status:** **partial**  
**Priority:** P1

**Evidence.** Implementation is real: persistent cache, multi-tab manager, memory fallback, write queue, approve/send-back disabled offline, print blocked on pending approved writes (`OFFLINE.md`, `app/lib/firebase.ts`, `app/lib/ConnectionContext.tsx`). Unit/code checks exist; the acceptance matrix is mostly **needs-browser**. `OFFLINE.md` says not to treat the code pass as a clinic exercise.

**Gap.** A recorded continuity test: date, who, scenario (DevTools offline / power cut), what still worked, what failed, sign-off. Store that on the clinic (or as an NCE-like record). Until that exists, this stays a feature claim.

---

### 13. SLIPTA 9.5 / 9.6 / 9.9 / 1.11

**Status:** **partial**  
**Priority:** P1

| Item | Status | Evidence / gap |
|---|---|---|
| 9.5 secure storage, authorised personnel only | **partial** | Repo rules + roles. Census: unauthenticated client reads succeeded on 22 Aug 2026 — treat production as **not** meeting 9.5 until rules are deployed and re-probed |
| 9.6 controlled access + verify electronically transmitted results | **partial** | Access: yes. Verification of a transmitted result (email/Excel/future DHIS2): **absent** |
| 9.9 ongoing checks for transmission, calculation, storage | **absent** | No scheduled integrity job. Flags are display-time, not a stored check |
| 1.11 archived results readily retrievable | **partial** | Live orders/print/export retrieve current results. No archive, no retention clock, no “retrieve from archive within X” |

**Gap.** Deploy and verify rules (ops). Add a checksum or row-count confirmation on export. Add a periodic “storage check” that a manager can run (count orders vs results, flag orphans). Archive path arrives with item 15.

---

### 14. DHIS2 export + SLIPTA/ISO 15189 alignment (Gambia NHLSP)

**Status:** **partial** (LIMS exists; national link does not)  
**Priority:** P1

**Evidence.** The product *is* an electronic LIMS (patients, orders, results, inventory, review). PRD v0.5 §11.3 specifies DHIS2-shaped export as not built; `docs/LabFlow-PRD-v0.5.md` lists “DHIS2 return” under specified-not-built. No `dhis2` / `IDSR` / FHIR code under `app/`. Excel export is clinic operational reporting, not HMIS.

**Gap.** Same as item 16 for the interface. For SLIPTA/ISO alignment, ship the evidence pack in item 11 rather than a checklist UI that pretends to award stars (PRD §8.3 already says software cannot deliver a star).

---

### 15. Configurable retention (results, QC/EQA, paediatric-by-birthday)

**Status:** **absent**  
**Priority:** P1

**Evidence.** `dob` / `ageYears` / `ageMonths` are captured (`app/register/page.tsx`) but unused for retention. No `retentionPolicy` on clinics. No QC or EQA collections (inventory QC is stock, not laboratory IQC/EQA). Soft-delete is not expiry. Audit is create-only forever (`firestore.rules`). PRD §12.11 specifies the three classes; not implemented.

**Gap.** Clinic-configurable classes: patient results (duration from report date), QC/EQA (duration — collection does not exist yet), paediatric (until birthday+N or duration, whichever later). Jobs: warn, export-to-archive, then hide/delete only via Admin. Do not hardcode 10/5/21 — those are the memo’s *defensible default*, to be stored as the deployment default text.

---

### 16. DHIS2 / IDSR aggregate export

**Status:** **absent**  
**Priority:** P2

**Evidence.** `REPORT_TYPES` are `patients | orders | results | inventory` (`app/lib/reportExport.ts`) — row-level, 90-day cap. No aggregate indicator, period, org-unit, or DHIS2 XML/JSON.

**Gap.** After the HMIS Unit dataset is known (PRD open question 9): a period + clinic aggregate (counts by test, positivity, not patient names) downloadable as CSV the Unit can ingest. Do not build a live DHIS2 API client until the dataset is specified.

---

### 17. Principles for Digital Development (people-first data practices)

**Status:** **partial**  
**Priority:** P2

**Evidence.** People-first traces already in the product: PIN names the person on the bench; audit avoids patient names; intern cannot browse the patient list; export is role-gated and rate-limited; register copy distinguishes consent from lawful basis; owner acting clinic is explicit. No in-product privacy notice, no patient-facing language work, no DSAR self-service (correct — staff-mediated is right for a LIMS).

**Gap.** A short, clinic-configurable “how we use your data” text for the printed report and the registration desk. A staff DSAR checklist that uses export + audit + erasure (items 1, 5). Not a new framework.

---

### 18. Interoperability / open licensing

**Status:** **partial** (interop) / **absent** (open license)  
**Priority:** P3 unless donor funding is a target

**Evidence.** `package.json` is `"private": true` and has **no `license` field**. No `LICENSE` file. Interop today: Excel/CSV import (`app/lib/migration.ts`, `app/owner/clinics/[clinicId]/migration/page.tsx`) and Excel export. No FHIR, HL7, or DHIS2. PRD §16 lists FHIR-native as deliberately not built.

**Gap.** If Digital Square / donor is a goal: choose an OSI license and publish it; keep Excel as the first interop; add item 16. If the product stays private, say so — that is a business decision, not a missing button.

---

### 19. Proposed HIPAA Security Rule (MFA, encryption, asset inventory, …)

**Status:** **partial**  
**Priority:** P2

| Proposed control | Status | Evidence / gap |
|---|---|---|
| MFA for every ePHI system | **absent** in product | Google sign-in only (`signInWithPopup`). Google may have 2FA on the account; LabFlow does not require or enroll MFA. ADR-001 notes Firebase Auth is not BAA-covered; Identity Platform is the upgrade |
| Encryption in transit | **present** (platform) | HTTPS to Firebase and Vercel |
| Encryption at rest | **partial** (platform default) | Not configured or attested in-app; no field-level encryption |
| Asset inventory | **absent** | No technology-asset register |
| Network segmentation | **out of scope** | Cloud project architecture, not LIS screens |
| Vuln scan / annual pen test | **out of scope** | Ops cadence, not a feature |
| Idle lock | **present** | See item 8 |
| Incident report in 24h (BA) | **absent** | Same clock as item 2, extra deadline |

**Gap.** Enforce MFA (Identity Platform or Google Workspace policy) before any US or high-assurance buyer. Write down encryption-at-rest as a hosting fact on the transfer assessment (item 4). Asset inventory can be a static deployment appendix, not an app module.

---

## OPTIONAL (20–23)

### 20. ISO/IEC 27001

**Status:** **out of scope (config/legal, not product)**  
No ISMS, SoA, or internal-audit module. Existing audit log, rules, and PIN are *inputs* to an ISMS, not a certificate. Do not build a “we are 27001” badge.

### 21. ISO/IEC 27701

**Status:** **out of scope (config/legal, not product)**  
Same as 20. Items 1, 4, 5, and 15 are the PIMS evidence a certifier would ask the product for.

### 22. SOC 2 Type II

**Status:** **out of scope (config/legal, not product)**  
No control-operation evidence window in the product. Idle lock, audit, access reviews (staff + pre-approvals) would be sample evidence.

### 23. Ratification tracking (Malabo / ECOWAS revision)

**Status:** **out of scope (config/legal, not product)**  
Watch the memo’s sources. No product hook. If either instrument tightens transfers, items 4–5 are the code that changes.

---

## Priority map (product only)

| Pri | Items | Build |
|---|---|---|
| P0 | 1, 2, 3 | Lawful-basis cleanup; erasure + DSAR path; incident clock + evidence pack |
| P1 | 4, 5, 10, 11, 12, 13, 14, 15 | Transfer/disclosure register; residency as config; LIS evidence + tested offline; rules actually deployed; retention classes; DHIS2-shaped aggregate once the dataset is known |
| P2 | 6, 8 (if US), 16, 17, 19 | DPIA dump; MFA; aggregate export; privacy notice on print |
| P3 | 18 | License + interop only if donors are a target |
| — | 7, 9, 20–23 | Counsel, contracts, certs, treaty watch |

---

## Could not verify in this pass

- Whether interim `firestore.rules` are **deployed** to `labflow-6cb9e` (repo notes say no as of 22 Aug 2026).
- Firestore database **edition** (census: CLI/MCP could not list databases). **Region is now recorded as `nam7`** on the 23 August 2026 transfer-assessment seed; that is a hosting fact, not a legal conclusion.
- Whether `/api/health` is currently 200 (OIDC/Admin). Export, claims sync, and join depend on it.
- Whether a `patient.erasure` or `patient.correct` **write path** exists outside permissions/audit vocabulary — none was found under `app/`.
- Whether Google Workspace / Identity Platform MFA is enabled on the Firebase project (no product code either way).
- Browser exercise of offline continuity (explicitly still outstanding in `OFFLINE.md`).
- Live Resend/Vercel encryption and DPA status (platform, not repo).

This file does not implement any of the gaps.
