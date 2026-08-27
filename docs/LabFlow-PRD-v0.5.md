# LabFlow — Product Requirements Document v0.5

**Status:** Current working specification
**Supersedes:** PRD v0.4 (22 Aug 2026). Superset — every module v0.4 specified is carried forward.
**Date:** 23 August 2026 (v0.5 published 22 August; §12 tightened 23 August)
**Owner:** Isaac Kanu
**Market:** The Gambia and West Africa

---

## 0. How to read this

### 0.1 Evidence discipline

Every claim is one of four things and says which:

- **Verified** — checked in code or in a **primary** source (statute text, standard, government publication), cited
- **Reported** — from secondary commentary, named as such, not independently confirmed
- **Decided** — a founder decision, dated
- **Not established** — researched and not found. Written as a gap, never filled with a plausible guess

v0.5 does not claim "nothing is guessed". It claims everything unverified is marked.

### 0.2 What changed from v0.4

| # | Change | Where |
|---|---|---|
| 1 | **The database is closed.** Interim rules published; anonymous reads on `patients`, `clinics`, `users`, `orders` and `auditLogs` all return 403, verified from an unrelated machine | §14 |
| 2 | **The Act's primary text was located** at the National Assembly. §12 is rewritten from the statute with section references, replacing secondary commentary | §12 |
| 3 | **LabFlow's consent checkbox is the wrong lawful basis, and under s.8(9) it may be invalid.** A patient who cannot decline without losing their test cannot give freely-given consent | §12.3 |
| 4 | **Cross-border transfer is stricter than GDPR.** s.37 has no consent, contract or vital-interests derogation — no Article 49 escape hatch exists | §12.6 |
| 5 | **There is no data localisation requirement.** Hosting outside The Gambia is lawful — but the destination's *law* is now the compliance argument | §12.6 |
| 6 | **Firestore's region cannot be changed after project creation.** With six test patients this is a cheap decision; later it is a migration | §12.7 |
| 7 | **There is no medical-records carve-out from erasure.** Unlike GDPR Art. 17(3), s.10 has no exemption list | §12.5 |
| 8 | **Regional and international posture researched** — ECOWAS, Malabo, Nigeria, Ghana, Senegal, HIPAA, GDPR, ISO | §13 |
| 9 | **§12 tightened to the Bill-PDF research pack.** Provenance, citation rule, ROPA/DPIA/DPO, breach-register clock, encryption-at-rest, living-subjects scope, and open legal gaps are now spec constraints. Citations are to the Assembly Bill, not the gazetted Act | §12 |

---

## 1. Product Summary

**LabFlow** is an offline-first, multi-tenant clinical laboratory management system for small and medium laboratories in The Gambia and West Africa, built to produce the records that WHO/AFRO SLIPTA and ISO 15189:2022 require.

It covers patient registration, test ordering, sample tracking, results entry, supervised result release, inventory, referral tracking and management reporting.

### 1.1 Who it is for

Small and medium clinics and laboratories, public and private, doing tens rather than thousands of tests a day — **explicitly including the unlicensed segment.** The National Health Laboratory Services Policy 2021–2025 records "a proliferation of unlicensed laboratories"; the 2019 Health System Assessment found private facilities materially undercounted. Two regulatory bills covering laboratories were pre-Cabinet as of June 2026.

**Market sizing cannot be built from published figures.** No count of clinical laboratories in The Gambia exists. *(Not established.)*

### 1.2 Design constraints, evidenced

| Constraint | Evidence |
|---|---|
| Connectivity is unreliable | Internet penetration 45.9% (DataReportal, Oct 2025). A May 2025 study at Edward Francis Small Teaching Hospital found departments with "no computer, no internet" and staff sharing one data card |
| Power fails routinely | Laboratory Services Policy names "unreliable supply of essential utilities such as electricity and water". **In 2017** the World Bank recorded parts of Greater Banjul on "two to three hours of power per day"; current reliability **not established** |
| Devices are shared | EFSTH study. Gambia-specific smartphone split **not established**; regionally 60% of Sub-Saharan mobile internet subscribers use feature phones or 3G smartphones (GSMA, 2024 data) |
| Print is the deliverable | "Currently, a paper-based system is used to enter information at the peripheral levels" |
| English is a working, not first, language | Adult literacy 58.67%, youth 74.70% (UNESCO 2022). Mandinka 38%, Pulaar 21%, Wolof 18% first-language share |
| Money moves through phones | 68% of unbanked adults use mobile money as their main financial service; ~20% hold a bank account (FinScope 2025) |
| Staff are scarce | "The shortage of suitably qualified human resources to work in diagnostic laboratories is severe" |

---

## 2. Competitive Position

### 2.1 The incumbent

**A-LIS** version 4.0.1 runs at `lims.moh.gm` for the Ministry of Health's National Public Health Laboratories, apparently from the BLIS/C4G lineage. Its feature set, offline capability and footprint are **not established** — the host has a redirect loop that blocked retrieval.

**The most important commercial unknown in this document.** First item of primary research.

### 2.2 What "offline" means in this field

Researched: OpenELIS Global (MPL-2.0, v3.2.2.0, Aug 2026), SENAITE (GPLv2, still Python 2.7), Bahmni's lab module (fork of a 2013 OpenELIS snapshot), GNU Health, C4G BLIS, DHIS2.

Three meanings: an offline *installer*; a *locally hosted server*; a *true offline-first client*. **Only DHIS2's Android client documents the third.** OpenELIS Global's site claims "offline-first architecture"; its own install docs describe a conventional server install. Bahmni Connect works offline for registration but **lab entry does not**.

LabFlow targets the third. §10 specifies what that costs.

The case from outside the region: in March 2026 one power failure at a Johannesburg office with no UPS took South Africa's National Health Laboratory Service offline for ~30 hours, leaving 265 laboratories unable to register specimens.

---

## 3. Technical Stack (Verified 22 Aug 2026)

| Layer | Technology |
|---|---|
| Framework | Next.js 16.3.0 App Router, TypeScript strict, React 19.2.8 |
| Styling | Tailwind CSS v4 |
| Database | Firebase Firestore, client SDK with offline persistence |
| Auth | Firebase Auth Google popup, **plus per-staff PIN identity (§5.2)** |
| Trusted server | Next.js Route Handlers on Vercel, `firebase-admin`, Vercel OIDC → Google Workload Identity Federation. No service-account key. See ADR-001 |
| Spreadsheets | `@e965/xlsx` · **Email** Resend · **Hosting** Vercel |
| Firebase project | `labflow-6cb9e` · Live `https://labflow-six.vercel.app` |

**Why a server tier** (ADR-001): rules resolving identity via `get()` are billed as a document read per request and capped at 10 access calls per single-document or query request, 20 for batched writes. Custom claims move `clinicId`, `role` and `shift` into the signed token at zero cost, and claims can only be set by the Admin SDK from a privileged server.

**Carried constraint:** not on Firebase Hosting, so `signInWithRedirect` is unusable — it needs `/__/firebase/init.json`, which 404s. Popup only.

**Region is now a compliance decision, not only an operations one.** See §12.7.

---

## 4. Onboarding and Access

### 4.1 Clinic onboarding

Owner creates the clinic with the fields in §12.9 **including tier** → system generates a 7-character join code → owner assigns the first `clinic_admin` by email → admin distributes the code.

### 4.2 Staff joining

Google sign-in → `pending` → `/join`, no patient data visible → enter code → **clinic name shown for confirmation** → `clinicId` set → holding screen → clinic admin approves, assigns role **and shift if `lab_supervisor`** → access opens → staff member sets their PIN (§5.2).

### 4.3 Staff pre-approvals

*(Specified, not built.)* Import creates pre-approvals — email, role, shift, clinic-scoped, 90-day expiry. On sign-in and code redemption a match auto-approves. `owner` may never appear. **Consumption happens server-side.**

### 4.4 The join-code disclosure

**An acknowledged, live exposure.**

Firestore rules cannot inspect query filters and reads are all-or-nothing per document. To let a user who belongs to no clinic look up a clinic by code, `clinics` must be readable to signed-in users — exposing `joinCode`, TIN, business registration number, address and responsible person.

So the join code is not a secret. Approval still gates access, so no patient data leaks, but §5.1's promise that no clinic can discover another's existence **is not currently true**.

**Fix, written and blocked behind OIDC:** server routes `redeemJoinCode` and `confirmJoinCode` returning only `{ found, clinicName }`, the blanket read removed, rate limited to five failed attempts per user per hour.

---

## 5. Identity, Roles and Permissions

### 5.1 Principle

Each clinic is a sealed tenant. Only the platform owner sees across tenants. **§4.4 is where this is currently untrue.**

### 5.2 Identity on a shared device

**The problem:** every staff member needs a personal Google account, sign-in is a popup requiring network, sessions expire in about an hour and cannot refresh offline. The device is a shared bench workstation with high turnover. In reality one Google account gets created for the laboratory and everyone uses it — the only configuration that survives a shift change during an outage. From that moment the audit log attributes everything to one identity and "who released this at 03:40" is unanswerable, which is precisely what SLIPTA §9 and ISO 15189:2022 clause 6.2.3 require.

| Aspect | Requirement |
|---|---|
| Device session | Google sign-in establishes a long-lived **device** session bound to one clinic |
| Staff identity | Each approved staff member sets a **4–6 digit PIN** |
| Acting user | Every write records the **PIN identity's** UID, role and shift |
| Idle lock | Configurable per clinic, defaulting to a few minutes |
| Re-entry required | **Release, amendment, erasure, export, staff changes** |
| Offline | PIN verification works offline against a locally cached hash |
| Reset | By `clinic_admin` or `owner`, logged. Never self-reset |

**PIN is attribution, not authorisation.** It establishes which staff member is acting on an authenticated device; it does not authenticate the device.

### 5.2.1 Rostered access windows

**Decided 23 Aug 2026.** Each staff member other than the owner may be given a roster — which weeks, which days, which hours — plus a grace period. Access is granted inside that window and withheld outside it, with a **break-glass** path so a hard lock cannot push the laboratory back onto shared logins.

| Situation | Behaviour |
|---|---|
| Inside the window, or within grace | Normal access |
| Outside the window | Refused by default, with the next window named and a **Work outside my roster** action |
| Break-glass used | Access for a bounded period. A reason code is required. Every subsequent action is stamped `offRoster: true` |
| Reporting | Off-roster sessions appear on the dashboard per staff member |

A hard lock would produce shared logins and destroy the audit trail the PIN exists to protect. A rising off-roster rate is a staffing signal; `roster incorrect` is a listed reason so a wrong roster is visible as itself.

**This is the same category of control as the PIN: attribution and deliberate friction, not a security boundary.** It is enforced at PIN unlock, on trusted-server routes, and again on release, amendment and export. It is **not** enforced in Firestore rules — recurrence cannot be evaluated there within the `get()` ceiling, and a device clock can be spoofed. Offline, the check uses the cached roster and the device clock (§9.3). A queued write that syncs outside the window is retained; rejecting it would lose a clinical record to a scheduling rule.

Rostering is **opt-in per clinic**. A clinic with no roster entries behaves as today. `clinic_admin` is rostered but is never locked out of staff management. Unsaved result text is held locally before a session locks.

`shiftLabel` on a roster entry is **derived from `startTime`**. A supervisor membership's `shift` is a derived read of the current roster entry where one exists; the manually-set value remains the fallback.

### 5.3 The eight roles

`owner` · `clinic_admin` · `lab_manager` · `lab_supervisor` · `technician` · `technician_assistant` · `intern` · `storekeeper` · `pending`

Eight roles is more structure than a three-person laboratory needs. Clinic setup presents a **suggested subset by tier**; the full list is a menu, not a requirement.

### 5.4 Capability matrix

**Own**=owner · **Adm**=clinic_admin · **Mgr**=lab_manager · **Sup**=lab_supervisor · **Tech**=technician · **Asst**=technician_assistant · **Int**=intern · **Store**=storekeeper

| Capability | Own | Adm | Mgr | Sup | Tech | Asst | Int | Store |
|---|:--:|:--:|:--:|:--:|:--:|:--:|:--:|:--:|
| Register patients | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| View patient list | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| View patients they registered | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ |
| Order tests | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Record sample collection | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| Enter results | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ |
| Reject a sample | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ |
| **Approve / release results** | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Amend a released result** | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Send back for correction | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Edit test catalogue | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| Management dashboard | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Export data** | ✅ | ✅ | ✅ | **❌** | ❌ | ❌ | ❌ | ❌ |
| Approve / reject staff | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View join code | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Edit clinic profile | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Import data | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| Soft-delete patients | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |
| **Execute an erasure request** | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ |
| View stock | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |
| Record stock in / out | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| Manage inventory items | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ✅ |
| Record specimen movement | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ |

**Implementation rule:** named predicates in `app/lib/permissions.ts`, imported by pages, API routes, and mirrored in Firestore rules. **No page tests a role string.** The clinical loop was severed for weeks because one file compared `role === "admin"` after the vocabulary changed.

### 5.5 The four access rights — gap analysis

SLIPTA §9 requires four separately controlled rights; ISO 15189:2022 clause 6.2.3 names LIS authorisation.

| Required | Status |
|---|---|
| Access patient data | `canViewPatients` — **enforced** |
| Enter data and results | `canEnterResults` — **enforced** |
| **Modify** data and results | Partial. Amendment is gated; **editing an unreleased result carries no separate right**. **Gap** |
| **Release** results | `canApproveResults` — **enforced** |

Three of four. **Do not present this as satisfied in accreditation evidence until `canModifyResult` exists.**

### 5.6 Separation of administration from laboratory

`clinic_admin` cannot register patients, order tests, enter results, approve results, or edit reference ranges. Their access exists for accountability and audit. This mirrors the ISO 15189 principle that technical competence, not administrative authority, governs release.

### 5.7 Owner protection and the acting clinic

Owner has no `clinicId`, passes every route guard, cannot be assigned a clinic role. Acting clinic lives in `sessionStorage`, never Firestore. Reads unfiltered; writes take that clinic's `clinicId` and carry `actingAsOwner: true`. Persistent banner while active.

**Closed as working-as-intended:** rules cannot see the acting clinic, and that is correct. The owner is *defined* as the account permitted to write into any clinic. Deliberately not a custom claim — claims propagate on token refresh, which would make switching slow for no gain.

---

## 6. The Clinical Record

### 6.1 Patient record

| Field | Required | Notes |
|---|---|---|
| `labId` | Generated | §6.6 |
| `name` | Yes | |
| `preferredName` | No | |
| `sex` | Yes | |
| `dob` **or** `ageYears`/`ageMonths` | One of | Date of birth is frequently unknown; demanding it produces fabricated dates |
| `phone` | No | Default +220 |
| `address`, `nationalId`, `nextOfKin` | No | |
| `referringClinician` | **Yes where the request came from outside** | SLIPTA §8 requires requester name |
| `referringFacility`, `reasonForVisit` | No | Clinical information, SLIPTA §8 |
| **`lawfulBasis`** | **Yes** | **§12.3 — s.5(2) gate, set per clinic type. Default is not consent** |
| `consentRecorded` | No | Record of what the patient was told, **not** the lawful basis. Live writes still use `consentGiven` |
| `region` | No | One of seven health regions |
| `clinicId`, `createdAt`, `createdByUid`, `createdByRole` | System | PIN identity per §5.2 |

**Correction after registration:** a misspelled name on a released report is a clinical problem. A corrective-edit path exists for `lab_manager` and above, writing before-and-after values to the audit log.

### 6.2 Result data model

The national primary-tier menu is mostly **qualitative** — malaria blood film, stool microscopy, sickle cell, RDTs. A numeric-only model cannot record "trophozoites seen" or "positive".

Each catalogue **parameter** carries a `resultType`:

| Type | Entry | Flagging |
|---|---|---|
| `numeric` | Number + unit | H / L against reference interval; Critical against critical limits |
| `qualitative` | Choice from a defined value set | Abnormal flag on values marked abnormal |
| `semi_quantitative` | Ordered choice | Abnormal above a threshold position |
| `text` | Free text | None |

Rules: reference intervals and critical limits apply to `numeric` only. A `qualitative` parameter must define an **Invalid / Not done** option — RDTs fail, and forcing a positive/negative choice on a failed test falsifies the record. Units are mandatory on `numeric`; SLIPTA §9 requires **SI units** on the report. A test may combine types — urinalysis is the normal case.

**Reference intervals must vary by sex and age band on numeric parameters.** Haemoglobin ranges differ materially for adult male, adult female, child and infant. With sickle cell on the national primary menu and anaemia routine, a single range per parameter flags most patients wrongly. **Confirm this is implemented; if it is one range per parameter, that is a schema change now and a migration later.**

### 6.3 Order lifecycle

| Status | Meaning |
|---|---|
| `pending` | Ordered, results not entered |
| `results_entered` | Awaiting release |
| `approved` | Released. Printable |
| `amended` | Released then corrected. **Can be amended again** |
| `needs_correction` | Returned with a reason code |
| `rejected` | Sample not testable. **Terminal** |
| `cancelled` | Withdrawn before testing. **Terminal** |

Only `rejected` and `cancelled` are terminal. A bad correction must be correctable or the second error is permanent.

**Display overlay:** an order with any uncollected specimen shows **Awaiting sample**, naming which.

### 6.4 Sample rejection and nonconforming events

SLIPTA §8 requires acceptance/rejection evaluation at receipt; §10 (13 points) requires a nonconforming event register with risk level, root cause, owner and effectiveness verification. OpenELIS Global makes the event record **mandatory before a rejection completes**.

Reason codes: haemolysed · clotted · insufficient volume · wrong container · unlabelled · mislabelled · leaked in transit · delayed beyond stability · wrong test requested · other. Free text optional alongside. A recollection order can be created from the rejection, linked to the original. Rejection rate by reason code is a SLIPTA §6 quality indicator, computed automatically.

### 6.5 Result review and release

Order-level queue of everything `results_entered`, oldest first — a tab on the orders list and a direct route for approvers. **Single approval step.** No multi-level validation, worksheets, auto-release, instrument interfacing or batch approval.

**No approve control in a table row.** Clicking a row opens the review panel showing every value, its reference interval or value set, and its flag; approve sits below the numbers. A release button in a list invites releasing without reading.

Release records PIN identity, role, shift, timestamp, and `actingAsOwner` where applicable.

### 6.6 Lab ID and specimen identifiers

- **Lab ID** `LF-YYYYMMDD-XXXX`, unique within a clinic
- **Offline generation must not collide.** The suffix incorporates a per-device identifier. A collision detected at sync reissues the later record's ID and logs the change — **never silently merges two patients**
- **Specimen identifier** `{labId}-{specimenType}` — writable on a tube by hand, unambiguous read back
- **Barcodes are not required.** SLIPTA §8 requires *traceable* identification, not *machine-readable*. Printing costs are a documented barrier to LIS adoption in West Africa. A barcode option may be added; a barcode dependency must not

### 6.7 Amendment after release

**Decided 21 Aug 2026:** any approver may amend.

SLIPTA §9 requires revision identification **referencing the original report**, its date and the patient ID; **user notification** that a revision exists; a revised record showing **change time, date and responsible person**; and **the original report entry retained**. ISO 15189:2022 clause 7.4.1.8 requires the same traceability.

An amendment writes a new version and never overwrites. Required reason code plus optional note. Reprints are headed **AMENDED REPORT** showing amendment date, original release date, and which values changed. **The dashboard counts amendments** — a rising rate is a quality signal assessors ask for.

### 6.8 Self-release

SLIPTA §9 requires the **authorised releaser be identified** — not that two people touch the result. In a three-person laboratory mandatory dual sign-off produces workarounds.

Separation of entry from release is the **default**, enforced wherever another approver is available. An explicit **override** permits self-release with a reason code, recording `selfReleased: true`. The trigger is not "nobody else is on shift" — that remains an operator judgement even with a roster (§5.2.1 records who was *supposed* to be on duty; it does not compute whether another approver is present). The override is always offered to an approver releasing their own entry, and every use is recorded. **Self-release rate is a dashboard quality indicator** and a staffing signal.

### 6.9 Reason codes, not free text

Every mandatory justification — rejection, send-back, amendment, self-release, deletion, erasure, **working outside the roster** — is a **required code from a short controlled list**, with optional free text alongside.

A minimum character count guarantees the length of a string, not its information content. In an English-as-second-language setting under time pressure, mandatory free text produces `"error"` repeated. Codes can be counted and charted; prose cannot. Codes also keep patient identifiers out of the strings that feed the audit log, which §12.5 depends on.

### 6.10 Critical result communication

SLIPTA §9 requires a **record that a named person was told, by whom, and when**.

`criticalLow` / `criticalHigh` per numeric parameter, or a critical value set for qualitative. **Blank by default** — critical limits are clinical decisions specific to a laboratory's population and methods. A critical result **can be released**; the communication record is required within a configured window and the order is flagged until it exists. `Could not reach` is a valid outcome with its own code, escalating to the lab manager. **Release is never blocked by an unanswered phone** — a critical result is the one a clinician most needs.

---

## 7. Test Catalogue

### 7.1 The problem

Until a clinic edits Settings, LabFlow serves 16 hardcoded tests with ranges written for the product rather than any laboratory. **A clinic can release a result validated against a range nobody there ever approved.** SLIPTA §8 requires reference intervals **with a documented basis and communication of changes**.

### 7.2 The national tier menu

The National Health Laboratory Services Policy 2021–2025 defines what each tier performs. There is no national essential diagnostics list — The Gambia joined the FIND/WAHO regional process in Dakar in October 2022; adoption **not established**.

**Primary tier:** urinalysis (mixed) · malaria blood film (qualitative + text) · stool microscopy (qualitative + text) · haemoglobin (numeric) · blood glucose (numeric) · **sickle cell (qualitative)** · RDTs (qualitative).

Note how few are numeric. This is why §6.2 exists. **Sickle cell is on the national menu and LabFlow does not carry it.**

**Secondary:** plus haematology, blood transfusion, basic microbiology, basic clinical chemistry.
**Tertiary:** full haematology, transfusion, histology, cytology, clinical chemistry, medical microbiology.

**Widal** is widely used in West African practice but **not named in the Gambian policy**. If carried, mark it as not on the national menu.

### 7.3 Seeding and review

Tier-appropriate catalogue copied into the clinic's own records at creation, marked `reviewed: false`, with `specimenType`, `resultType` and value sets. **The in-memory fallback is removed entirely.** A lab manager or supervisor confirms each test, recording who and when — SLIPTA's "documented basis". **Flag, do not block**: a hard block pushes staff toward not recording results at all.

**On warning fatigue:** one persistent item in a dashboard setup checklist showing progress, not a banner on every screen; the caveat prints **only** on reports for tests still unreviewed.

**Existing clinics need a migration path.** Tier seeding applies to clinics created from now on; MedicAid still holds sixteen bare code documents with no `resultType`, no `specimenType`, no `reviewed`. Not built.

---

## 8. Accreditation as Product Strategy

### 8.1 The situation

> *"None of the public laboratories has yet been accredited as ISO 15189 and none has yet been awarded any stars by WHO SLIPTA."*
> *"There is only one ISO 15189 accredited laboratory in The Gambia, a private laboratory at the Medical Research Council."*
> — National Health Laboratory Services Policy 2021–2025

MRCG's, accredited by the Kenya Accreditation Service since July 2015.

Regionally, a meta-analysis of 17 studies covering 4,509 African laboratories found pooled EQA performance of **71.25% (95% CI 63.12–79.39%)**, **West Africa at 65.38%**, malaria worst at 53.47%. *(Reported: I² = 96.36%, Egger P = .002 — indicative of a real problem, not a precise measurement.)*

### 8.2 What SLIPTA scores

**Checklist v3:2023**, aligned to ISO 15189:2022: **145 questions, 12 sections, 373 points.** One star at **206 (55%)**.

| § | Section | Points | Software-deliverable |
|---|---|---:|---|
| 1 | Documents and Records | 22 | Largely |
| 2 | Organisation and Leadership | 26 | Partly |
| 3 | Personnel | 34 | Storage only |
| 4 | Customer Focus | 24 | Complaints register only |
| 5 | Equipment | 44 | Partly |
| 6 | Assessments | 24 | Partly |
| 7 | Supplier and Inventory | 27 | Largely |
| 8 | Process Management | **71** | Substantially |
| 9 | Information Management | 24 | Almost entirely — this section *is* the LIS |
| 10 | Nonconforming Events | 13 | Largely |
| 11 | Continual Improvement | 7 | Partly |
| 12 | Facilities and Safety | 57 | No |

### 8.3 The honest arithmetic

§1 + §7 + §9 + §10 = **86 points, 23%.** One star needs 206.

**Software alone cannot deliver a star.** §12 Facilities (57) and §3 Personnel (34) are 91 points of physical and human work no system touches. What LabFlow does is remove the record-keeping burden from the sections where paper is the bottleneck.

**The product consequence:** a **SLIPTA evidence pack** — a per-section export generated from data entered in the course of work. No system surveyed targets the checklist directly, no Gambian public laboratory has a star, and two regulatory bills are pending.

### 8.4 What that requires beyond what exists

Nonconforming event register (§10) · daily environmental monitoring — room, storage, fridge, freezer, incubator, water bath (§8) · equipment register with calibration and service dates (§5) · document control (§1) · reagent lot verification before use (§8) · internal QC with Levey-Jennings **including evaluation of patient samples run since the last successful QC** (§8) · **EQA participation records** with root cause and corrective action (§8) · **measurement uncertainty** — a stored value with a documented basis satisfies the checklist; a statistics engine adds no score · **complaints register** (§4) · method validation records (§8) · referral tracking (§8, §9) · continuity plan covering power outages (§8).

**ISO 15189:2022 clause 7.6** is the most concretely actionable standard for this product: supplier validation before introduction plus laboratory verification; authorised, documented, validated change control; protection against unauthorised access, tampering and loss; **recording of system failures with immediate and corrective actions**; systematic checking of calculations and data transfers; downtime plans (7.6.4); and for hosted deployments, external provider compliance (7.6.5). **The laboratory remains ultimately responsible (7.6.2)** — so the product must give the lab the evidence to discharge that.

---

## 9. Offline-First

### 9.1 Why

Internet penetration 45.9%. Departments at the national teaching hospital with "no computer, no internet". ISO 15189:2022 makes continuity an explicit clause — **7.8** — requiring plans that are **"periodically tested and the planned response capability exercised"**. SLIPTA §8 requires a documented plan covering power outages specifically.

**For an offline-first product this is an asset — but only if the continuity path is exercised and evidenced.**

### 9.2 What works offline

Registration, ordering, sample collection, results entry, rejection, stock movements, specimen custody, PIN unlock.

**Duplicate detection offline** works against the local cache only. A patient registered offline on device A is invisible to device B until both sync; on sync, potential duplicates surface for **human merge**, never automatic.

### 9.3 Clock and identifiers

Every record carries **both** the device clock (`recordedAt`) and the server timestamp on sync (`syncedAt`). Turnaround uses the device clock; the pair makes drift visible. A device more than a configurable tolerance from the server warns and asks for correction. Lab ID generation is collision-safe per §6.6.

### 9.4 Release and print offline

Printed hard copy is *the* deliverable, so a system that cannot produce it during an outage is not used during an outage — and then holds a partial record, worse than none.

| Action | Offline |
|---|---|
| Enter results | **Allowed** |
| Release a result | **Allowed**, queued like any write |
| Print a released, locally-confirmed result | **Allowed as a PROVISIONAL REPORT** — SLIPTA §9's report-content list includes provisional reports |
| Print as final | **Blocked until synced** |
| Amend a released result | **Blocked** — an amendment corrects something already outside the laboratory |

The provisional report is headed as such, watermarked, and carries *"Provisional — not yet confirmed to the laboratory record. A final report will follow."* On sync the order is marked for **final reprint**, with a dashboard queue so nothing is forgotten.

**If a queued release is rejected on sync**, the provisional report already issued becomes a **recall event** — surfaced as a named clinical action with the patient, the order, and instruction to retrieve or supersede the printed copy.

### 9.5 Sync problems

An offline write is applied to the cache immediately, so the interface reports success. If rules reject it on reconnect, Firestore discards it. **Without handling, a technician sees a saved result that does not exist.**

Every locally-initiated write is recorded in the application's own IndexedDB queue. Server confirmation clears it. A write that disappears without confirmation is treated as **rejected** and surfaces in a **Sync problems** panel with what was attempted, when, on which patient or order, why where known, **and what to do about it**. Dismissible only by explicit acknowledgement; survives a refresh.

**A rejected write is a clinical event, not a network event.**

### 9.6 Conflict resolution

| Case | Resolution |
|---|---|
| Two devices enter results for one order | **Both retained.** Order flagged conflicted; an approver chooses; the discarded version stays in history |
| Two devices register a matching patient | Both retained; surfaced for human merge |
| One releases while another edits | Release wins; the edit becomes a rejected write |
| Stock movements | Additive; balance recalculates |

**No clinical record is ever silently overwritten by a later sync.**

### 9.7 Enforcement honesty

Firestore rules are the only server-side enforcement for data-plane operations, so **the offline rules in §9.4 are client-side guards.** That is acceptable where they protect users from mistakes. For release it is not — so rules enforce role, and the sync-time rejection path catches an unauthorised release, surfaced as a recall event. **The control is real; it operates at sync rather than at the click.**

### 9.8 Stale permissions

Tokens expire in about an hour and cannot refresh offline. A user offline whose role changed will sync writes made under permissions they no longer hold. The message must be intelligible: *"Your permissions changed while you were offline. These changes were not saved."* On reconnection, force a token refresh before flushing the queue.

---

## 10. Sample Referral

The Laboratory Services Policy documents a named harm:

> *"an alarmingly high rate of patient referrals simply because of the lack of onsite laboratory testing and national sample referral system guidelines. This greatly hinders the timely management of clinical cases"*

and that where samples are referred, *"efforts are not made to ensure quick turnaround times."*

Referral list of named laboratories per clinic · dispatch record (tests, specimen, to whom, by whom, when, transport condition) · tracking dispatched → acknowledged → resulted → returned · result entered on return, **attributed to the referral laboratory, never presented as the clinic's own** · referral laboratory identified on the printed report (SLIPTA §9) · turnaround measured separately, generating the first data on a gap the policy names but does not quantify.

---

## 11. Inventory, Reporting and the Dashboard

### 11.1 Inventory

Record keeping for accountability — what came in, what went out, what remains. Not procurement authority.

**Item record:** name · associated test code · manufacturer · supplier · catalogue code · **lot / batch number** · **expiry date** · manufacture date · packaging form · unit size · units per pack · packs per carton · storage condition · department · minimum stock threshold · active flag. Lot and expiry mandatory on any batch including imported. SLIPTA §7 also requires receipt/entry/exit dates, inspection records, consumption-rate monitoring and routine stock counts.

**Movements.** In: date, quantity, lot, expiry, supplier, received by, condition on arrival. Out: date, quantity, issued to, purpose, issued by. **Balance is calculated, never stored, never typed.**

**Attribution — decided 20 Aug 2026:** issues record person and purpose only, not linked to individual orders. Linking every issue would enable cost-per-test but requires that discipline on every issue; in a busy clinic it collapses, and partial data produces confident cost figures built on a fraction of usage.

**FEFO.** SLIPTA §7 requires **documented FEFO practice**. On issue the system shows which lot expires soonest and recommends it, does not hard-block another choice, and records what was actually issued. Flags: expired (red), expiring within 30 days (amber), below minimum (amber).

**Specimen register** — a separate custody log. **It does not set collection times on orders.** Chain of custody and the analytical clock are different records.

**Not built, deliberately:** automated reordering and purchase orders. SLIPTA §7 requires min/max levels, consumption monitoring, stock counts and FEFO — **not** automated procurement. Where supply runs through a national programme or donor pipeline, a purchase-order engine models a process the laboratory does not control.

### 11.2 Dashboard

Visible to owner, clinic_admin, lab_manager, lab_supervisor. Windows: Today · Yesterday · This week; beyond that is export-only.

Patients registered · tests ordered · tests by type · **pending tests** (the operational priority) · awaiting review · returned for correction · **rejected by reason code** · approved · **amended** · **self-released** · **critical results awaiting communication** · **pending final reprints** · turnaround median with **excluded count stated**.

**Turnaround exclusions.** Orders missing a collection or release time are excluded, never counted as zero. A statistic that hides its denominator is worse than no statistic.

**Known data-quality issue:** an earlier defect bulk-stamped identical collection times. A one-time owner-only repair tool identifies suspicious timestamps and clears them per row with confirmation, **writing the original value to the audit log before removing it** — SLIPTA §9 requires a revised record showing what changed.

### 11.3 DHIS2 and regional reporting

DHIS2 is the national HMIS. Facilities report **monthly** to Regional Health Directorates, aggregating to the HMIS Unit. **2021 completeness 80.3%, timeliness 74.6%.**

The Laboratory Services Policy names the direction: *"The opportunity of introducing a LIMS to link to the District Health Information System Version 2 (DHIS2)… could be exploited to expand it for all laboratory services."*

**Regionally, WAHO runs a DHIS2 data warehouse across all ECOWAS states including The Gambia**, focused on IDSR data against a core set of 80 essential health indicators. So DHIS2-shaped export serves both national and regional channels.

**Blocking unknown:** the specific dataset laboratories must report is **not established**. Confirm with the HMIS Unit. Do not guess a dataset.

**Approach:** the two documented DHIS2 laboratory integrations in Africa (Tanzania, Ethiopia) were **custom adapters, not standards-based**. A CSV the HMIS Unit accepts is a legitimate first version.

### 11.4 Export and email

Manager selects dates and report type; the system generates `.xlsx`. **Download is the default**; email to the requesting manager's registered address is optional and never to an address supplied in the request. Every export logged with row count and range. `lab_supervisor` excluded per §5.4.

Email creates the traceable record; download gets the file to the person standing there in a 45.9%-connectivity market.

### 11.5 Bulk import

**Claim unassigned legacy records** — a one-time repair. Never touches a record already belonging to a clinic; previews what will move; requires confirmation; logs the result; hides itself when nothing remains.

**Spreadsheet import** — `.xlsx`, `.xlsm`, `.csv`. **Column mapping always shown and always confirmed**, pre-filled by fuzzy matching; nothing written before confirmation. Rows validated; valid import while invalid are skipped and offered back. Duplicates flagged and **skipped by default**. Every record stamped with `clinicId`, `importedAt`, `importedBy`, `importSource` and the migration history ID.

**AI column mapping — specified, deferred.** Send only the header row and three sample rows; **pre-fill** the confirmation panel. Patient data must not be sent to a third-party model wholesale — that is a **cross-border transfer** under §12.6 as well as a disclosure, and s.37 has no consent derogation to rely on.

---

## 12. Data Protection — The Gambia

**Rewritten in v0.5 from the primary text; tightened 23 August 2026.** Product constraints below. The regional research note is `DATA-PROTECTION-FRAMEWORKS-2026-08-22.md` — do not treat that file as the spec where it conflicts with this section.

> **This is research, not legal advice.** Every operative decision still needs a Gambian lawyer's sign-off.

**Citation rule.** Cite provisions as **s.X of the Bill as published by the National Assembly; not verified against the enacted 2025 text.** Do not quote penalty figures. Do not invent an assent date, a commencement date, or a grace period. Do not assume the Act is in force.

### 12.1 Status and provenance

| Fact | Status |
|---|---|
| Tracker page | [assembly.gm/bills/364](https://assembly.gm/bills/364) · PDF [assembly.gm/bills/364/download](https://assembly.gm/bills/364/download) |
| Tracker title | **DATA PROTECTION AND PRIVACY BILL, 2024** |
| Short title inside the document (s.1) | **Personal Data Protection and Privacy Bill, 2024** |
| Tracker stage | **Assented**. A July 2026 timestamp on the tracker is a **record-entry date, not the assent date** |
| Passed by the National Assembly | **29 September 2025** — **Reported** (secondary sources, consistently). Not read off the Gazette |
| Structure of the retrieved PDF | 45 sections, 9 Parts |
| What this PDF probably is | The **tabled 2024 Bill**, not the enacted 2025 Act. Committee amendments are likely. **Penalties are the known divergence** — Tech Hive Advisory's December 2025 review is of the enacted Act. **Do not put figures in this spec** |
| Assent date | **Not established** |
| Commencement / whether in force / any transition | **Not established.** Tracker "Assented" is not commencement. **Do not design as if the Act is already operative law** |
| Architecture that independently matches Tech Hive's review of the enacted Act | Seven lawful bases · health as sensitive · 72-hour Commission notice + high-risk subject notification · DPO for public authorities and large-scale sensitive processing · transfers by receiving-country law or Commission-adopted instruments |

**The enforcing authority is the existing Information Commission** under the **Access to Information Act (Act No. 10 of 2021)** — **s.38 of the Bill as published by the National Assembly; not verified against the enacted 2025 text.** It is not a new data-protection agency. Secondary commentary that named a "National Data Protection Commission" or a new "DPA" is wrong on the Bill text.

**s.39** requires the Commission to include a commissioner specialised in personal data protection. **Whether that person has been appointed is not established** — no public evidence found.

**Corrects v0.2 and v0.3**, which cited a "2023/2025" Act. No Gambian data protection Act of 2023 exists.

**Extraterritorial reach — s.3(1)(c):** processing outside The Gambia is in scope. **Vercel and Firestore processing is in scope.**

**Who is a data subject.** The Bill protects **living individuals only**. It does not protect decedent records. Do not implement next-of-kin access or memorialisation as a data-subject right under this instrument.

### 12.2 What LabFlow must satisfy

| Requirement | Section of the Bill (not verified against the enacted 2025 text) | Consequence |
|---|---|---|
| Health (also genetic, biometric, criminal, racial/ethnic, political, trade-union, religious, gender) is a **special category** | s.2 | Every patient record. **Two gates: s.5(2) and s.6(1). Both.** |
| Erase once the purpose is achieved · accountability | s.4(8), s.4(11) | Retention is a justified policy, not a forever store. Named owner, recorded justification |
| Proportionality duty | s.5(1) | Standalone obligation independent of lawful basis |
| **Seven lawful bases** | s.5(2)(a)–(g) | §12.3. **s.5(3):** public authorities cannot use legitimate interests |
| **Nine special-category conditions** | s.6(1)(a)–(i) | Clinical path: **s.6(1)(c)** |
| Right to erasure | s.10(2)(a)–(e) | §12.5 — **no medical carve-out** |
| **Record of processing activities (ROPA)** | s.30 | **Internal.** Not a filing. Must include retention periods (s.30(2)) |
| **DPIA** | s.31 | **Pre-go-live.** s.31(2) large-scale special categories. "Large scale" is **undefined**. s.31(4) Commission list is unpublished |
| Breach register + Commission within **72 hours** of becoming aware | s.32 | **All** breaches documented. Auditable `becameAwareAt` drives the clock. Notify unless unlikely high risk |
| High-risk notice to subjects | s.33 | **s.33(a) defence: encryption with no known vulnerabilities.** Encrypt clinical records at rest |
| **DPO** | s.34 | Three limbs. Plan for a DPO: public authorities, and s.34(c) large-scale sensitive processing. "Large scale" undefined |
| Exceptions only where **provided for by law** | s.36 | §12.5 |
| Cross-border transfer | s.37 | §12.6 — **stricter than GDPR. No consent/contract/vital-interests derogation** |
| Regulator | s.38 | Information Commission (ATI Act 2021), not a new DPA |
| **No controller registration or fee today** | — | **Monitor s.45** — the Minister may make regulations. Do not assume a register/fee exists; do not assume one never will |
| **No data localisation requirement** | — | Searched; none in the text. **Do not require hosting inside The Gambia** |
| **No retention period named** | — | Controller-defined. No Gambian clinical retention statute was found |
| Penalties | — | **Criminal liability, corporate liability, and a concealment-of-breach offence are established.** Figures are contested between the Bill PDF and Tech Hive's review of the enacted Act. **No numbers in this spec** |

### 12.3 The consent checkbox is the wrong lawful basis

**This is the most consequential finding in v0.5.** Do **not** design the primary clinical path on consent.

LabFlow required a mandatory consent checkbox at registration and treated it as the legal ground. Under the Bill as written, that is wrong in two ways.

**First, a patient cannot validly consent.** s.8(9) of the Bill as published by the National Assembly; not verified against the enacted 2025 text:

> *"Consent is not considered freely given if the data subject cannot refuse or withdraw consent without suffering any disadvantage or undue influence."*

A patient who must tick the box to receive their test cannot refuse without disadvantage. The consent is not freely given. **A mandatory consent checkbox does not create a lawful basis; it documents reliance on one that fails.**

**Second, consent is not needed.** s.6(1)(c) provides a non-consent condition for this use case:

> *"The processing is necessary in the management of health services or pursuant to a contract with a health professional, subject to professional secrecy and conditions provided for by law."*

**The correct structure is two gates:**

1. A lawful basis under **s.5(2)** — for a private clinic, typically (b) contract or (f) legitimate interests. **s.5(3):** legitimate interests are **not available to public authorities** performing statutory duties, so a state laboratory must use (b), (c) legal obligation, or (e) public task
2. A special-category condition under **s.6(1)** — **(c) management of health services**

**What changes in the product:**

- The patient record gains a **`lawfulBasis`** field, set per clinic type at configuration and recorded per patient. Default for a private clinic is contract or legitimate interests, **not** consent
- The consent checkbox is **retained as `consentRecorded`** — a record of what the patient was told (SLIPTA §8) — **not** the legal ground, and **not** a registration gate
- Registration copy stops implying that refusing consent changes whether the test proceeds. That is the s.8(9) problem in words
- Where consent *is* genuinely optional — SMS result notification (§15.6) — s.8 applies in full: granular per purpose (8(4)), withdrawable (8(5)), withdrawal right disclosed **before** consent is taken (8(6))

**Also required by s.6(1)(c): professional secrecy.** Organisational duty on the clinic; the product supports it — role-scoped access, the four access rights, the audit log.

### 12.4 Children

**s.7.** Best interests primary (7(1)(b)); child-comprehensible language (7(3)); *"A child's consent shall not be deemed valid where processing of the child's data creates a risk to or infringes the best interests of the child"* (7(4)); lawful grounds at 7(5) including parental consent and preventive or counselling services offered directly to a child.

**Product consequence, not yet specified:** LabFlow registers patients of any age and has no distinct handling for minors. Paediatric records also drive the retention question in §12.11. **Gap.**

### 12.5 Erasure — no medical carve-out

**s.10(2)** grants erasure where: (a) the data is no longer necessary for its purpose; (b) consent is withdrawn and no other basis exists; (c) the subject objects and the controller cannot demonstrate overriding grounds; (d) processing is unlawful; (e) erasure is required by a legal obligation.

**Unlike GDPR Article 17(3), s.10 contains no exemption list.** No public-health exemption, no preventive-medicine exemption, no legal-claims exemption.

The available defences are structural:

1. **s.10(2) is conditional.** If the data remains necessary for its purpose, (a) is not triggered. **If the clinic relies on s.6(1)(c) rather than consent, (b) is not triggered either** — which is a second, independent reason to fix §12.3
2. **s.10(5)** — impossibility or disproportionate effort
3. **s.36** — but exceptions are permitted *"only when provided for by law"*, and **no Gambian law imposing a clinical-record retention period was found**

**So a Gambian clinic facing an erasure request today has no statutory retention obligation to point to.** Refusal logic = still necessary for the purpose (**s.10(2)(a)**) **plus** a continuing **s.6(1)(c)** basis — **not** a retention statute. No medical carve-out was found in s.10.

**s.10(4):** a valid erasure must be **communicated to all recipients** of the data. For LabFlow that means referral laboratories (§10) and anyone who received an export (§11.4). **The system must be able to enumerate who received a patient's data.** Not built.

**⚠️ Drafting flag — verify before implementing objection or restriction.** s.10(3)(c) of the Bill as published by the National Assembly refers to objection *"based on section 6(1)(e) or (f)"*. Public-task and legitimate-interest bases are at **s.5(2)(e) and (f)**; s.6(1)(e)/(f) are vital interests and national security. This looks like an un-renumbered GDPR Art. 6(1)(e)/(f) carry-over. **Do not implement objection/restriction logic from that cross-reference until it is checked against the gazetted 2025 text.**

### 12.6 Cross-border transfer — stricter than GDPR

**Part VII is a single section, s.37.**

> **s.37(1)** — *"Cross-border transfers of personal data to other countries or international organisations are permitted when an appropriate level of protection is ensured, for legitimate purposes, and with mutual benefit to both jurisdictions and can be achieved through –*
> *(a) the law of the receiving country or international organisation, including adherence to applicable international treaties or agreements; or*
> *(b) ad hoc or standardised safeguards provided by legally binding and enforceable instruments **adopted by the Commission**…"*

Plus: **s.37(2)** the controller must assess the receiving jurisdiction's protection; **s.37(3)** *"The Commission must be involved in assessing whether the criteria are met"*; **s.37(4)** the assessment must be **documented**; **s.37(5)** produced to the Commission on request, which may demand demonstration of effectiveness; **s.37(6)** the Commission may **prohibit, suspend or impose conditions**.

**Three consequences that matter more than they first appear:**

**There is no derogation.** No consent, no contractual necessity, no vital interests, no legal claims. **No equivalent of GDPR Article 49.** A controller who satisfies neither limb has **no lawful way to transfer at all**. On this axis the Act is stricter than GDPR.

**Limb (b) is currently unusable.** It depends on instruments *"adopted by the Commission"*. **No evidence was found that any s.37(1)(b) instrument has been adopted.** Executing EU standard contractual clauses does not help — the instrument must be Commission-adopted. **s.37 has no consent, contract, or vital-interests fallback.** **So limb (a) — a receiving-country law that is a recognised data-protection law — is the only practically available route today.** Prefer hosting in a jurisdiction that has one.

**"Mutual benefit to both jurisdictions"** sits in the chapeau and applies to both limbs. It is undefined, untested, and has no analogue in GDPR or Convention 108+.

**There is no data localisation requirement.** Hosting outside The Gambia is lawful. **Do not build a localisation constraint the law does not impose.**

### 12.7 Hosting jurisdiction — a decision, not a default

Because limb (a) turns on the *receiving country's law*, where LabFlow's data physically sits becomes a compliance argument rather than an operations preference.

| Destination | s.37(1)(a) argument |
|---|---|
| **EU / EEA region** | **Strong.** GDPR is a comprehensive data protection law; the argument writes itself |
| A Convention 108+ party | Strong |
| An African state with a comprehensive law and an operational authority | Reasonable |
| **United States** | **Weak.** No comprehensive federal data protection law. The argument would rest on sectoral law and contractual terms, and there is no Commission-adopted instrument to fall back on |

**Firestore's location is chosen at project creation and cannot be changed afterwards.** Moving means a new Firebase project and a data migration.

**With six test patients that is a weekend. With six thousand real ones it is a project.**

**Location, established 23 August 2026:** `labflow-6cb9e` Firestore is **`nam7`** (Iowa, Northern Virginia, Oklahoma — United States multi-region). Vercel functions stay **`fra1`**.

**Decided 23 August 2026:** remain on that project and seek legal advice on the s.37 question, rather than pre-emptively rebuilding in a European region. **No real patient data until counsel answers.** Factual seed: `app/lib/transferAssessments.ts` (`firestore-nam7`). Counsel brief: `TRANSFER-ASSESSMENT-FIRESTORE-NAM7-2026-08-23.md`. **`receivingCountryLawAssessment` is `PENDING LEGAL REVIEW`** — do not store a machine-drafted conclusion.

**Earlier recommendation (superseded as an action, kept as the fallback if counsel rejects the US position):** if the receiving-country-law argument does not hold, create the production project in an EU/EEA region before any real patient data. Firestore's region cannot be changed.

**Build requirements from s.37(2), (4) and (5)** — these are features, not policy. The controller assesses; the Commission must be involved (s.37(3)); the record is produced on demand (s.37(5)).

- A **documented transfer assessment per destination**, covering nature of data, purpose, duration and receiving-country law
- **Every sub-processor region, backup region, DR region and support-access location is a separate destination** — Firestore, Vercel, Resend, and any AI provider used for column mapping (§11.5)
- The assessment is **retrievable on demand** — not a memo in someone's inbox

**Regionally, the same shape recurs.** ECOWAS Supplementary Act A/SA.1/01/10 Article 36 imposes an adequacy-or-safeguards test **and an obligation to notify the data protection authority of transfers**; Senegal requires the CDP be informed of every transfer with sender, recipient, data and purposes. **A system that cannot enumerate what left, to whom, and why cannot satisfy these.**

### 12.8 Breach

**s.32 of the Bill as published by the National Assembly; not verified against the enacted 2025 text** — notify the Commission *"without undue delay and no later than 72 hours"* of becoming aware, unless the breach is unlikely to result in high risk. The notification must describe nature, likely consequences, mitigation, and **time, location, duration and the data subjects affected**. **All breaches must be documented, including those not notified.**

**Product:** a **breach register** for every incident, with an auditable **`becameAwareAt`** timestamp. That stamp **is** the 72-hour clock. Do not start the clock from "when we finished investigating" or "when we told the patient".

**s.33** — notify data subjects without undue delay where high risk. **Exempt where** the controller had implemented appropriate protections **such as encryption with no known vulnerabilities** (s.33(a)), where the risk has been mitigated, or where notification would require disproportionate effort (then an equivalent public communication).

**Encrypt clinical records at rest.** That is a product/hosting requirement, not a nice-to-have: it is the s.33(a) defence to subject notification. Confirm the live Firestore/Vercel encryption posture; do not assume it from vendor marketing copy.

**Concealment of a breach is an established offence.** Figures are contested — they do not belong in this spec.

### 12.9 Clinic registration fields

Gambian clinics operate under a TIN from the Gambia Revenue Authority and a business registration certificate from the Registrar of Companies.

Clinic profile: name · **tier** · address · region · TIN · business registration number · responsible person · **licence number and expiry (optional today)** · active flag · **`dataResidencyRegion`** (§12.7) · **`retentionPolicy`** (per-class period, **named owner**, **recorded justification** — §12.11). **No `hostedInGambia` flag.** Do not add one.

**On licensing:** there is **no Gambia Medical Laboratory Council Act**; the Laboratory Services Policy says so and names "a proliferation of unlicensed laboratories". The **Health Facility Regulatory Authority Bill** and the **Allied Health Professionals Licensing Bill** (the latter explicitly covering laboratories) were pre-Cabinet as of 22 June 2026, the Health Minister stating substandard facilities will be closed. **Enactment dates not established.**

### 12.10 Audit log

A single append-only `auditLogs` collection: clinic, actor UID, email, role and shift, whether acting as owner, action, target, human-readable label, timestamp, and a small detail object.

**Designed to be erasure-compatible, per §12.5:**

- **No patient names.** `targetLabel` holds the Lab ID and a record type. Names resolve by joining to the patient record at read time
- **Reason fields hold codes, not prose** (§6.9), so no free text can smuggle an identifier in
- Erasing a patient erases the name everywhere it exists; audit entries survive and display `[erased]` where the join fails — the *fact* of the action remains, the *identity* does not
- An **archival path**: entries older than the retention period are exported to a signed archive and removed. Create-only does not mean unbounded forever; storage limitation applies to logs too
- An erasure is itself logged, and **the record of the erasure is not erasable**

**Create-only at the database level.** Read requires staff-management rights for that clinic, or owner. Exportable as CSV — the requirement is that the log be *producible on request*.

**Known live defect:** the census found at least one existing entry with a name-shaped `targetLabel`, and every existing order still copies `patientName`. New writes are fixed; **six orders and one audit entry are not migrated.**

### 12.11 Retention

**The Bill names no period.** No Gambian health regulation, Ministry policy or Council rule specifying clinical-record retention was found. The HMIS Policy 2017–2025 and the MDCG Code of Conduct and Medical Ethics 2011 / MDCG Regulations were **not read at document level** — they remain open, not a hidden statute. *(Not established — and searched for specifically.)*

Retention is **controller-defined**: configurable **per record class**, with a **named owner** and a **recorded justification** (ss. 4(11), 30(2) of the Bill as published by the National Assembly; not verified against the enacted 2025 text). International anchors run roughly 2 to 30 years depending on class and jurisdiction. SLIPTA defers to "national/international guidelines". **Do not hard-code a number and present it as statutory.**

**Minimum structure required:**

- Distinct classes for **patient results**, **QC and EQA records**, and **paediatric records** — the last keyed to a birthday rather than a duration
- Each class: period, named owner, written justification
- The configured policy recorded on the clinic profile
- The archival path in §12.10 keyed to the same policy

**A specific number needs the lawyer conversation** (§17). No Gambian rule constrains the choice, so the choice must be justified rather than assumed.

### 12.12 Accountability artefacts (not built)

These are organisational duties the product must make dischargeable. They are not filings with the Commission unless a later s.45 regulation says otherwise.

| Artefact | Bill | Product |
|---|---|---|
| **ROPA** | s.30 | An internal record of purposes, categories, recipients, transfers, and retention periods. Retrievable. Not a registration |
| **DPIA** | s.31(2) | **Before first real-patient go-live.** Large-scale special-category processing is the trigger; "large scale" is undefined, so plan as if it fires. s.31(4) list unpublished |
| **DPO** | s.34 | Plan for one. Public-authority clinics trigger a limb; multi-clinic special-category processing may trigger s.34(c). Confirm with counsel, do not wait for a complaint |
| **Transfer assessments** | s.37(2)(4)(5) | §12.7 |
| **Breach register** | s.32 | §12.8 |

### 12.13 Open legal gaps

Do not close these in the product. They are open.

- **Bill PDF vs enacted Gazette text**, especially penalties
- **Assent date**, and **whether the Act is in force** (commencement not found)
- **HMIS Policy 2017–2025** — full text unread
- **MDCG Code of Conduct and Medical Ethics 2011** and **MDCG Regulations** — unread at document level
- **Whether the Commission has adopted any s.37(1)(b) transfer instrument** — no evidence
- **Whether a data-protection commissioner under s.39 has been appointed** — no public evidence
- **s.10(3)(c) cross-reference** — may cite s.6(1)(e)/(f) instead of s.5(2)(e)/(f); verify before objection/restriction work

---

## 13. Regional and International Acceptance

**New in v0.5.** What LabFlow must do to be credible beyond one clinic in Banjul.

### 13.1 West Africa

| Instrument | Status | What it requires |
|---|---|---|
| **ECOWAS Supplementary Act A/SA.1/01/10** | The Gambia is an ECOWAS member. Binding **in principle**. Article-level text **not verified** (full machine-readable text was not retrieved). **The domestic Bill/Act is the operative instrument for LabFlow** | Reported: Article 30 health-data conditions; Article 36 adequacy-or-safeguards **plus DPA notification of transfers**. Under revision. Do not implement ECOWAS articles as if they were read |
| **AU Malabo Convention** | **Signed 02/12/2022. Not ratified. Not binding treaty law for The Gambia** | Adequate protection required before transfer outside the AU *if* it bound. Specific health-data wording **not established**. Track ratification; do not design as if it applies |
| **Nigeria NDPA 2023** | In force. The regional benchmark | Sensitive data conditions (s.30); transfers ss.41–43; **DPIA mandatory** for health care services and for cross-border transfer under GAID 2025. No localisation, but s.43 leaves room for future category restrictions |
| **Ghana Act 843** | In force | "Special personal data". **Controller registration with the Data Protection Commission is mandatory before processing**, valid two years, criminal penalties for non-compliance |
| **Senegal Law 2008-12** | In force | The CDP must be **informed of every transfer** with sender, recipient, data and purposes |

**No data localisation obligation exists in any framework examined.** Offshore hosting is lawful across the region. **Hosting location should be a per-deployment configuration, not an architectural assumption.**

**WAHO runs a DHIS2 regional data warehouse across all ECOWAS states**, focused on IDSR against 80 essential health indicators. DHIS2-shaped export therefore serves national *and* regional channels.

### 13.2 International

**HIPAA imposes nothing absent a US covered-entity customer.** If one is ever taken on: a Business Associate Agreement with its ten required elements including subcontractor flow-down, breach reporting to the covered entity within 60 days, and the Security Rule's technical safeguards at 45 CFR 164.312 — unique user identification, emergency access procedure, audit controls, person-or-entity authentication, transmission security. **LabFlow's PIN identity, audit log and role model map onto four of those five already.**

**GDPR.** **The Gambia has no adequacy decision, and no African country does.** If a European NGO, research institution or donor's personal data enters the system, Article 46 standard contractual clauses plus an EDPB six-step transfer impact assessment are the only systematic route.

**Certifications, honestly ranked:**

| | Covers | Rough cost and time | Worth it when |
|---|---|---|---|
| **ISO/IEC 27001** | Information security management | ~6 months; £5,000–£50,000, or $30,000–$85,000 first year on higher estimates. Three-year certificate, annual surveillance | Institutional health buyers speak this language — Gavi holds it and frames it as assurance to "partners, donors and stakeholders" |
| **ISO/IEC 27701** | Privacy management, now standalone-certifiable | 3–6 months as an add-on | The buyer base becomes privacy-regulated rather than security-conscious |
| **SOC 2 Type II** | Security controls, US commercial signal | 6–12+ months; $30,000–$150,000 first year, renewed annually | Selling to US commercial buyers |

**Whether global-health donors typically require any of these is not established.** What *is* documented is that the **Principles for Digital Development** — endorsed by 300+ organisations and having "widely influenced funder procurement policies" — and **Digital Square's Global Goods criteria** (open licensing, community governance, funding diversity, multi-country scale, interoperability) are what donor-funded digital health is actually assessed against. **For a donor conversation, those matter more than a certificate.**

### 13.3 What this means for LabFlow

**MUST**, because a named law requires it somewhere LabFlow plausibly operates:

1. The two-gate lawful basis structure (§12.3), **not** consent. s.8(9) makes a mandatory clinical consent checkbox invalid
2. Breach **register for all breaches**, with auditable `becameAwareAt` driving a 72-hour Commission clock, plus high-risk subject notification (§12.8)
3. **Encrypt clinical records at rest** — s.33(a) defence
4. Health data treated as a special category; both s.5(2) and s.6(1) gates
5. A documented transfer assessment **per destination and per sub-processor / backup / DR / support-access region** (§12.6–12.7), retrievable on demand. Prefer a receiving-country law; s.37(1)(b) instruments do not exist and there is no consent/contract fallback
6. **ROPA** (s.30), **pre-go-live DPIA** (s.31(2)), and a **DPO plan** (s.34) — §12.12
7. Retention configurable per class, named owner, recorded justification. **No statutory period**
8. **The ability to enumerate what data left, to whom, and why** — s.10(4), and (if article text is later verified) ECOWAS Art. 36 / Senegal. **Not built**
9. Ghana registration and Nigeria DPIA inputs, if those markets are entered. **No Gambian controller registration today**; watch s.45

**SHOULD**, because buyers, accreditors or the national plan expect it:

7. Build to **ISO 15189:2022 clause 7.6** as the product specification — it is the most concretely actionable standard for this product
8. Ship offline continuity as a **tested and evidenced** capability (clause 7.8), not a feature claim
9. Meet the SLIPTA §9 information-management items — secure storage, controlled access, verification of transmitted results, ongoing checks, retrievable archives
10. **DHIS2 export and SLIPTA/ISO 15189 alignment are named national commitments** in the Laboratory Services Policy, not optional differentiators
11. Retention configurable with a documented default, distinct classes, named owner and justification (§12.11)

**OPTIONAL:** ISO 27001, ISO 27701, SOC 2 — in that order of usefulness for this market.

---

## 14. Security Model

### 14.1 Where enforcement lives

Every clinical read and write goes browser-to-Firestore. **Firestore rules are the only server-side enforcement for data-plane operations.**

| Layer | Worth |
|---|---|
| Navigation | Tidiness |
| Route guards | Stops URL wandering |
| **Firestore rules** | **The security model for data** |
| **Server route handlers** | Identity operations — claims, joining, export |
| **PIN identity** | Attribution, not authorisation |
| **Rostered access** | Attribution and friction, not a security boundary. Break-glass, not a hard lock |

### 14.2 Current posture — 22 August 2026

**The interim ruleset is published.** Anonymous reads on `patients`, `clinics`, `users`, `orders` and `auditLogs` all return **403**, verified from a machine unrelated to the project. The census of the same morning had `patients` returning **200** with a real document. **The exposure documented in v0.4 §13.4 is closed.**

The ruleset enforces: clinic-scoped reads and writes with `owner` short-circuiting; **an `approved()` gate** so a pending user who self-set `clinicId` cannot read that clinic's patients; role and status writes restricted to `owner` and `clinic_admin`; **any write setting a role to `owner` rejected**; patient delete denied; `auditLogs` create-only; `preApprovals` client-deny; default deny.

**Two things it deliberately leaves open**, both marked in the file: `clinics` stays readable to signed-in users because the join lookup is a query and rules cannot see filters (§4.4); and the client-side join write is permitted, marked TEMPORARY, removed when the server routes go live.

**Still open:**

| Item | Status |
|---|---|
| Vercel OIDC — `/api/health` returns 503 | Join by code, custom claims and export are non-functional |
| The final claims-based ruleset | Waits on OIDC |
| Browser verification of the app under the new rules | **Not done.** A 403 for an anonymous caller says nothing about whether signed-in users still work |
| Two-clinic isolation | Never verified with two populated tenants |
| **Data residency / s.37 answer** | Location known (`nam7`). Counsel conclusion **PENDING LEGAL REVIEW**. §12.7 |
| Retention default | §12.11 |

**The gate on real patient data is a conjunction:** rules deployed ✅ · transfer assessment concluded by counsel ❌ · retention default set ❌. Location is written down; the legal question is not. **One of three.**

### 14.3 The intern read exception

The matrix gives an intern no patient list, but registration runs duplicate detection against `patients`. Denying that read breaks registration for the one role that exists only to register. **Resolution:** interns may read `patients` scoped to their own clinic at the rules level, with the list hidden in the interface and only their own registrations shown. Documented so a future reader does not "fix" it and break registration.

---

## 15. Designed for This Market

### 15.1 Readable under pressure

Adult literacy 58.67%; English is a working language. No indigenous language exceeds 38% first-language share.

Status carried by **colour, icon and position**, not only words. **Statuses named as next actions, not states** — "Enter results", "Ready to release", "Collect sample" tell a person what to do; "results_entered" describes a database. Queue rows scannable in a second. **Reason codes over free text throughout.** **No multi-language support yet** — with no second language above 38%, translation buys less than clarity does.

### 15.2 Print is the deliverable

SLIPTA §9 specifies report content: examination identification, issuing laboratory, patient identification and location, collection date and time, issue date — **on every page** — requester name, examination method, sample type, **SI units**, reference intervals, space for interpretation, **critical results indicated**, the authorised releaser identified, report date and time, **page numbering**, revision identification where amended, and provisional reports where applicable.

**Lab ID appears once per page**, in the patient identification block, monospaced so `0` and `O` are distinguishable read back over a telephone.

### 15.3 Power loss is a normal event

Durable local persistence, crash-safe writes, no assumption of orderly shutdown. A machine losing power mid-entry loses at most the field being typed.

### 15.4 Devices

The bench is a fixed workstation and LabFlow is built for it. **No native mobile app for laboratory staff.** Any collection-point or patient-facing component targets a low-end Android device and degrades to a non-smartphone path.

### 15.5 Money

68% of unbanked adults use mobile money as their main financial service; ~20% hold a bank account. The Central Bank licenses **Afrimobile Money** (Africell) and **QMoney** (QCell); **Wave** operates under a different category. **Whether Gambian health facilities accept mobile money is not established.** LabFlow records a price and does not handle payment; that is the correct scope until answered.

### 15.6 Result notification

**Specified, not built.** Absent from every open-source clinical LIS surveyed.

- **To the patient: a result-ready notification only** — *"Your result is ready. Please return to the clinic."* Never the value, never a diagnosis
- **To a named clinician: the result may be transmitted**
- **Opt-in with recorded consent** — and here s.8 applies in full, because this consent *is* genuinely refusable: granular per purpose (8(4)), withdrawable (8(5)), the withdrawal right disclosed before consent is taken (8(6))
- Per-patient choice of direct or discreet wording; easy opt-out without penalty

**Why not the value:** Zambia's national programme changed protocol in March 2014 to stop disclosing results to mothers by SMS. Device sharing is high — 80% of a Ugandan cohort reported multiple household phones. The same cohort nonetheless preferred direct messaging and 90% had no disclosure concern, which is why patient *choice* is in the design rather than a blanket rule.

---

## 16. Build Status — 22 August 2026

### Live, mostly unverified

Eight-role model with shifts · capability enforcement · result approval by manager and supervisor · awaiting-release queue with type-aware flags · owner acting-clinic · soft delete and recycle bin · single Lab ID on print · clinic profile and staff management inside the clinic · inventory and specimen custody · spreadsheet import and legacy-record claim · offline foundation · tier-based catalogue seeding · result data model · specimen types · amendment · rejection and cancellation · reason codes · self-release override · critical-result communication · PIN identity · **rostered access windows with break-glass** · provisional reports · audit log · permissions test suite (139 tests) · **interim Firestore rules published**.

**Browser-verified: almost none of it.**

### Blocked

| Item | Blocker |
|---|---|
| Join by code, custom claims, export | Vercel OIDC — `/api/health` 503 |
| Final claims-based ruleset | Waits on OIDC |
| Email delivery | `RESEND_API_KEY` |
| Pre-approval expiry | `CRON_SECRET` |

### Specified, not built

Lawful-basis field replacing consent as the ground (§12.3) — **partially in the register UI; still wrong in import** · paediatric handling (§12.4) · recipient enumeration for erasure notification (§12.5, §13.3) · transfer assessment records (§12.6–12.7) — **Firestore `nam7` factual seed exists; `receivingCountryLawAssessment` is `PENDING LEGAL REVIEW`; Vercel/Resend unassessed; no owner UI** · breach register with `becameAwareAt` (§12.8) · ROPA / DPIA / DPO plan (§12.12) · retention classes with named owner and justification, plus archival (§12.11) · sex- and age-varying reference intervals (§6.2) · catalogue migration for existing clinics (§7.3) · corrective patient edit (§6.1) · collision-safe offline Lab IDs (§6.6) · conflict resolution UI (§9.6) · referral tracking (§10) · DHIS2 return (§11.3) · erasure workflow (§12.5) · staff pre-approvals (§4.3) · SLIPTA evidence pack (§8.3) · environmental logs, equipment register, document control, lot verification, internal QC, EQA records, complaints register (§8.4) · result notification (§15.6) · duplicate merge · staff offboarding rules.

### Not migrated

Six orders still carry `patientName`; one audit entry still carries a name-shaped `targetLabel`. Two `approved` orders have collection recorded after release and must not be used as verification fixtures.

### Deliberately not built

Bidirectional analyser interfacing with a driver library · FHIR-native architecture as a v1 requirement · pathology and histopathology modules · biobank storage management · multi-tier verification · automated reordering and purchase orders · full ERP · measurement-uncertainty calculators · a patient portal · native mobile apps for laboratory staff · barcode dependency · data localisation.

Deferred by founder decision: Stripe and self-registration · photo capture · multi-language · cost-per-test reporting.

---

## 17. Open Questions

**For a lawyer** — the research below has narrowed these from "what does the law say" to "what should we do", which is what a lawyer's time is worth spending on:

1. **Is the Act commenced?** Tracker says "Assented"; assent date and commencement are **not established**. Do not invent a grace period. Get the Gazette text
2. **The two-gate basis in §12.3** — is s.5(2)(b) or (f) + s.6(1)(c) the right pairing for a private Gambian clinic, and s.5(2)(e) + s.6(1)(c) for a public one? What does *"conditions provided for by law"* in s.6(1)(c) currently import?
3. **Cross-border under s.37** — can a US-hosted deployment satisfy limb (a)? If not, does an EU/EEA region satisfy it, and what does the s.37(2) assessment need to contain? What does *"mutual benefit to both jurisdictions"* mean?
4. **Does the Commission need to be engaged before transfers begin**, given s.37(3)?
5. **A defensible retention default**, per record class, with named owner and justification — no Gambian rule was found; HMIS 2017–2025 and MDCG instruments are unread
6. **Does LabFlow's deployment trigger the s.34 DPO requirement**, and is a s.31(2) DPIA mandatory before go-live? "Large scale" is undefined
7. **s.10(3)(c)'s cross-reference** — may cite s.6(1)(e)/(f) instead of s.5(2)(e)/(f). Verify against the gazetted text **before** implementing objection or restriction

**For primary research, not desk research:**

8. **A-LIS** — what does the Ministry's system do, who uses it, does the Ministry intend to extend it? The most important commercial unknown
9. **The DHIS2 laboratory dataset** — what, to whom, how often, in what format? Blocks §11.3
10. **Mobile money at health facilities** — accepted today? Blocks any billing work

**Product decisions:**

11. **Data residency** (§12.7). Firestore is **`nam7`**. The open item is counsel's s.37(1)(a) answer, not the region lookup. **Highest-leverage open legal item**
12. **The name** — labflow.ai is a funded Australian clinical pathology LIMS acquired by Magentus in December 2025, and at least seven other products use the name. No live registered US trademark in the software class was found, so the risk is discoverability rather than law. Decide before first customer deployment
13. **Storekeeper and patient data** — the matrix grants none. Confirm. Open since v0.2
14. **Duplicate merge** — what merges, what is retained, who may do it? Offline registration makes this certain
15. **Staff offboarding** — what happens to results a revoked person entered or released, and is a supervisor's shift freed?
16. **Two-clinic isolation** — never verified with two populated tenants. Not a question; an unpaid debt

---

## 18. Known Gaps in This Document

- **Legal gaps that stay open** — §12.13 (Bill vs Gazette, commencement, HMIS 2017–2025 unread, MDCG unread, s.37(1)(b) instruments, s.39 appointment)
- **Backup, restore and disaster recovery** unspecified. SLIPTA §9 requires backup procedures and LIS downtime records; ISO 15189:2022 clause 7.8 requires continuity planning. Each backup/DR region is a s.37 destination
- **Cost and quota model** — Firestore free-tier limits versus expected clinic volumes never calculated
- **Onboarding and training** — with severe turnover documented, how a new technician learns the system in an afternoon is a product requirement
- **The print stack** — how reports are generated, what happens with no printer, whether PDF is retained
- **Method and instrument recording** — SLIPTA §9 requires examination method on the report; nothing captures it
- **Acceptance criteria per feature** live in the prompt packs, not here

---

## 19. Immediate Next Steps

1. **Verify the app still works under the published rules** — browser pass, console open. A 403 for an anonymous caller says nothing about signed-in users, and `isApproved()` is new
2. **Answer §12.7 with counsel** — location is `nam7`. Do not enter real patient data until `receivingCountryLawAssessment` is replaced with counsel's wording. If counsel rejects the US position, create the production project in an EU/EEA region **before any real data**. Firestore's region cannot be changed
3. **Configure Vercel OIDC** until `/api/health` is ok
4. **Finish §12.3** — register UI no longer gates on consent; **import still does**. Clinic-type default for `lawfulBasis` is not built
5. **Take questions 1–7 to a Gambian lawyer in one conversation**, with the section references above. Bring the Bill PDF, not secondary blogs. Ask for the Gazette text
6. **Populate Green Aid**, then run the isolation tests
7. **Research A-LIS** — primary research
8. Then: recipient enumeration, retention classes, sex- and age-varying reference intervals, catalogue migration

---

## Sources

**The Gambia — primary (data protection)**

- National Assembly bill tracker — [DATA PROTECTION AND PRIVACY BILL, 2024](https://assembly.gm/bills/364) · [PDF download](https://assembly.gm/bills/364/download). Short title in the document (s.1): Personal Data Protection and Privacy Bill, 2024. Tracker stage: Assented. **This is probably the tabled 2024 Bill, not the gazetted 2025 Act.** Section cites in §12 are to this PDF and are **not verified against the enacted 2025 text**
- [National Health Laboratory Services Policy 2021–2025](https://policies.gov.gm/f/5b212d8f-914f-11ef-b086-029254d29bb1)
- [Ministry of Health — Service Statistics Report 2021](https://www.afro.who.int/sites/default/files/2022-07/Final%20Service%20Statistic%20Report,%202021.pdf)
- [ALIS GAMBIA v4.0.1](http://lims.moh.gm/login_now)

**The Gambia — secondary**

- [Tech Hive Advisory — Review of Gambia's Personal Data Protection and Privacy Act, 2025](https://www.techhiveadvisory.africa/insights/review-of-gambias-personal-data-protection-and-privacy-act-2025) (December 2025 review of the **enacted** Act; used only to confirm architecture and to flag that **penalty figures diverge** from the Bill PDF) · [Data Protection Africa](https://dataprotection.africa/the-gambia/) · [Malagen explainer](https://malagen.org/media-monitoring/explainer-what-the-gambias-personal-data-protection-act-means-for-you/) · [Paradigm Initiative](https://paradigmhq.org/press-release-paradigm-initiative-lauds-the-gambias-parliament-for-passing-personal-data-protection-and-privacy-bill-urges-swift-presidential-assent/)
- [HealthPolicy Plus — Health System Assessment, Nov 2019](https://www.healthpolicyplus.com/ns/pubs/17372-17674_GambiaHealthSystemAssessment.pdf) · [DataReportal — Digital 2026: The Gambia](https://datareportal.com/reports/digital-2026-gambia) · [AFI — financial inclusion 19% to 82%](https://afi-global.org/news/the-gambias-financial-inclusion-rate-jumps-from-19-to-82-in-just-six-years/) · [Voice Out Digital — new laws to regulate clinics and labs](https://voiceoutdigital.com/health-ministry-drafts-new-laws-to-regulate-private-clinics-labs-barbing-salons-gyms-and-others/)

**Regional**

- [FPF — Towards a Continental Approach to Data Protection in Africa](https://fpf.org/wp-content/uploads/2024/02/Africa-RECs-Report-.pdf) · [Digital Watch — ECOWAS Supplementary Act](https://dig.watch/resource/suplementary-act-personal-data-protection-within-ecowas) · [AU Malabo Convention ratification status](https://au.int/sites/default/files/treaties/29560-sl-AFRICAN_UNION_CONVENTION_ON_CYBER_SECURITY_AND_PERSONAL_DATA_PROTECTION_0.pdf)
- [Nigeria Data Protection Act 2023](https://www.dataguidance.com/sites/default/files/data_protection_act_2023.pdf) · [NDPC GAID 2025](https://ndpc.gov.ng/wp-content/uploads/2025/07/NDP-ACT-GAID-2025-MARCH-20TH.pdf) · [DLA Piper — Ghana](https://www.dlapiperdataprotection.com/index.html?t=about&c=GH) · [Senegal Law 2008-12](https://www.anove.ai/en/regulations/senegal-law-2008-12)
- [DHIS2 — WAHO regional data warehouse](https://dhis2.org/waho-uses-dhis2/)

**International**

- [45 CFR § 164.312 — Technical safeguards](https://www.ecfr.gov/current/title-45/subtitle-A/subchapter-C/part-164/subpart-C/section-164.312) · [HHS — Sample BAA provisions](https://www.hhs.gov/hipaa/for-professionals/covered-entities/sample-business-associate-agreement-provisions/index.html) · [HHS — Breach notification](https://www.hhs.gov/hipaa/for-professionals/breach-notification/index.html)
- [European Commission — Adequacy decisions](https://commission.europa.eu/law/law-topic/data-protection/international-dimension-data-protection/adequacy-decisions_en) · [EDPB Recommendations 01/2020](https://www.edpb.europa.eu/our-work-tools/our-documents/recommendations/recommendations-012020-measures-supplement-transfer_en)
- [ISO 15189:2022](https://www.iso.org/standard/76677.html) · [SADCAS — ISO 15189:2022 management requirements](https://www.sadcas.org/sites/default/files/2025-10/SADCAS%20F%20134(a)%20-%20Management%20%20Requirements%20for%20Medical%20laboratories%20ISO%2015189-2022%20%5BIssue%203%5D.pdf) · [ASLM SLIPTA Checklist V3:2023](https://aslm.org/wp-content/uploads/2019/12/SLIPTA-Checklist-V3-22-Dec-2023.pdf) · [WHO AFRO SLIPTA checklist](https://www.afro.who.int/sites/default/files/2017-06/slipta-checkist0711.pdf)
- [Principles for Digital Development](https://digitalprinciples.org/) · [Global Goods Guidebook](https://globalgoodsguidebook.org/about/) · [Gavi ISO certification](https://www.gavi.org/gavis-iso-certification-information-security)

**Evidence and architecture**

- [EQA performance in African laboratories, *Am J Clin Pathol* 2025;163(5):656](https://academic.oup.com/ajcp/article/163/5/656/7953878) · [SMS result delivery, rural Zambia, *BMC Pediatrics* 2017](https://link.springer.com/article/10.1186/s12887-017-0822-z) · [Patient acceptability, Uganda, *BMC Med Inform Decis Mak* 2012](https://link.springer.com/article/10.1186/1472-6947-12-56)
- [Firestore rules conditions — `get()` billing and limits](https://firebase.google.com/docs/firestore/security/rules-conditions) · [Custom claims](https://firebase.google.com/docs/auth/admin/custom-claims) · [Vercel OIDC to GCP](https://vercel.com/docs/oidc/gcp)

---

*End of PRD v0.5*