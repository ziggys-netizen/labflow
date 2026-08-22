# LabFlow — Product Requirements Document v0.4.1

**Changelog:** v0.4.1 — adversarial audit 22 Aug 2026

**Status:** Superseded by [`LabFlow-PRD-v0.5.md`](LabFlow-PRD-v0.5.md) (22 August 2026). Do not build from this file.  
**Date:** 22 August 2026  
**Owner:** Isaac Kanu  
**Market:** The Gambia, West Africa (first deployments)  
**Supersedes:** the unaudited v0.4 text (file not in this repo) and, for the modules below, PRD v0.2 (`docs/PRD.md`)

**Provenance (read this first).** The research-grounded PRD v0.4 that the 22 August 2026 adversarial audit examined is **not in this git repository**. This document reconstructs the working spec from that audit, from PRD v0.2, from ADR-001 / rules / deploy notes, and from application code in this tree. It is **not** a line-edit of a missing file. Where a figure or legal claim cannot be verified here, it is marked **unverified**. Do not quote unverified material externally.

**Incorporation of dropped modules (audit 4.1).** Research-grounded PRD v0.3 is also not in this repo. **v0.2 §§4 (onboarding), 5 (dashboard), 6 (inventory), 7 (import) remain in force as restated in this document.** The join-code disclosure is restored in §12 regardless.

**Method.** Everything unverified is marked. The v0.4 claim “Nothing is guessed” is withdrawn. Status on a requirement is one of: **built** · **specified, not built** · **specified, built, rules not deployed** · **unverified** · **needs counsel** · **needs source**.

**This task did not implement product features.** PIN sessions, rejection lifecycle, result types, and server-side release tokens are specified here only.

---

## Priority list (Top 5 — v0.4.1)

These are specification priorities, not a build order for this document’s authoring task. None of the unbuilt items below were implemented in application code as part of the audit.

1. **Make the offline story true, or stop calling it the defining property.** Specify conflict handling, offline identity (device session + per-staff PIN), collision-free IDs, dual timestamps, and either server-enforced release with a signed print token **or** an honest “advisory client guard” residual risk. Add a provisional report so an offline lab can still hand the patient paper. (§2.2, §3, §8, §12.1)
2. **Resolve the legal triangle before the first real patient record.** Redesign the audit log for erasability; mark the 2025 Act’s commencement and penalties as unverified secondary material; gate real patient data on **rules and residency counsel and a lawful basis/retention default**. (§11, §12.4, §16)
3. **Specify the result data model and a rejection lifecycle.** Numeric / qualitative / semi-quantitative / text types, units, panels, range dimensions; `rejected` and `cancelled` with reason codes feeding a nonconforming-event record. (§5.1, §6.0, §7.3)
4. **Keep this document a superset of v0.2’s operational modules, and specify the data model v0.4 never had.** Inventory, onboarding/join, import, dashboard, audit action vocabulary; join-code disclosure in §12; patient record, Lab ID scheme, specimen identifier. (§0, §4, §6, §12, §15)
5. **Evidence discipline.** SLIPTA access rights as a gap analysis; full Firestore `get()` limits; EQA figures with CI/heterogeneity/bias or not at all; no unsourced device statistics; dated power figure; citations that match Sources; SLIPTA arithmetic that software cannot deliver a star.

---

## 0. Why this version exists

PRD v0.2 described the built multi-tenant product (roles, join codes, catalogue, supervised release) and specified inventory, dashboard, import, and Firestore rules as not-yet-built. The application then ran ahead of v0.2: inventory, join API, audit log, import, dashboard, amendments, and an undeployed rules file now exist in this repository.

A later research-grounded v0.3 / v0.4 (Claude tree `/home/claude/labflow/`) revised market, SLIPTA, offline, and Gambian data-protection sections. That v0.4 was audited on 22 August 2026. The audit’s method standard was v0.4’s own claim that nothing was guessed. That claim did not hold. This revision applies every document-level Fix.

**Finding 3 (reworded, audit 1.1).** v0.2/v0.3’s citation to a 2023 data-protection Act was wrong as a complete description of the instrument the later PRD intended. The instrument discussed in v0.4 is the **2025** Act. **Commencement of that Act is not established in this repository.** Do not state “the law is the Act of 2025” as settled fact.

Q3R (`DEPLOY-2026-08-21.md`) instructed not to write PRD v0.4 while Stage C (rules deploy) was ungated. This v0.4.1 is an **audit correction of the specification**, not a claim that Stage C is green.

---

## 1. Product summary

**LabFlow** is a multi-tenant clinical laboratory management platform for small and medium laboratories in West Africa, designed to align **progressively** with WHO/SLIPTA and ISO 15189. It replaces paper registers and disconnected spreadsheets with patient registration, test ordering, results entry, supervised result release, inventory records, and management reporting.

It is **not** an on-premises LIS. Resilience is a **browser cache plus a queued-write log**, not a local server replica with conflict handling. See §8.

### 1.1 Harms the product exists to reduce

Duplicate patient records; unreleased or unattributable results; stock that cannot be reconciled to lot and expiry; reports that cannot be produced for a supervisor or directorate.

### 1.2 Operating context

| Constraint | What this document treats as established | Status |
|---|---|---|
| Intermittent connectivity | Design assumption, confirmed by product use of Firestore persistence (`app/lib/firebase.ts`) | Design constraint |
| Shared bench workstations | Founder/context; drives PIN-session requirement (§8.5) | Design constraint |
| Printed hard copy is the clinical delivery mechanism | Founder/PRD v0.2; print route exists | Design constraint |
| Cost sensitivity | Design constraint; monthly cloud cost **not estimated** (§15.4) | needs source |
| Power in Greater Banjul | v0.4 cited World Bank recording parts of the capital region on **two to three hours of power per day in November 2017**, via a **2018** project appraisal document (**unverified here** — PAD not in this repo) | **Current figure not established** |
| Adult literacy / languages | v0.4 used two-decimal “UNESCO 2022” figures sourced to an aggregator, and national literacy to justify **staff** UI. That is the wrong population. Laboratory staff are certificate-trained; the staff constraint is **English as a second or third language under time pressure**. Patient literacy belongs on the **printed report** (§13.2). First-language share does not decide localisation. | needs source (comprehension data); do not quote 58.67% / 74.70% |
| Internet / finance stats | v0.4 cited DataReportal “Oct 2025” vs Sources “Digital 2026”, and FinScope 2025 inline with no Sources entry, unreconciled with an AFI 19%→82% inclusion figure. **Those percentages are not restated here.** | needs source |
| Mobile device mix (v0.4: 60% feature phone/3G; 64% of monthly income) | **Deleted.** No GSMA (or other) source in this repo. | needs source |

**No native mobile app for laboratory staff (REQ-13.4-01).** The bench is a fixed workstation. A phone in a wet lab is a contamination and shared-credential problem, not a coverage problem. Low-end Android **browser** support remains desirable; it is not justified here with unsourced GSMA percentages.

---

## 2. Market and offline claim

### 2.1 Position

Open-source clinical LIS peers at this scale include OpenELIS Global, Bahmni/OpenMRS, GNU Health LIMS (see `RESEARCH-result-review.md`). LabFlow’s intended niche is a small Gambian laboratory: tens of tests a day, one manager and shift supervisors, paper still leaving the building.

### 2.2 Offline taxonomy (audit 1.3)

Research (as quoted by the audit from `lims-research.md` §0.1 — **file not in this repo**) distinguishes:

- (a) cloud-only, unusable without a link;
- (b) store-and-forward without a local replica;
- (c) a device holds a local replica and syncs **with conflict handling**.

Firestore client persistence is **per-field last-write-wins**. This document specifies **no merge, no user-visible conflict UI today**. Therefore LabFlow is **not** category (c).

**Claim (REQ-8.0-01), replacing v0.4’s differentiator language:** LabFlow is an **offline-capable client with queued writes and no conflict resolution**. Concurrent edits of the same order from two devices: the later commit wins per field; the other technician’s values can disappear without a prompt. **Intended (specified, not built):** order versioning; on flush, concurrent modification goes to the sync-problems panel with both versions (audit 4.7).

**ISWE LIMS (Zambia).** The audit’s citation of research §1.7: vendor self-description of “100% offline autonomy at every site” via a syncing PWA, plus SMS/WhatsApp alerts, EQA management, and lot-to-lot verification. **Vendor self-description, not independently verified in this repo.** It is the contrary data point v0.4 omitted. “Of every system surveyed” is forbidden unless the survey set is listed.

NHLS-style centralised outage (as used in v0.4): if Firestore or Vercel is down **and** the browser profile has no cache, the lab has no system. That is narrower than a local server. State it that way in sales conversations.

---

## 3. Technical stack (current, verified in-repo)

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js App Router, TypeScript | `package.json` (16.3.x line) |
| Styling | Tailwind CSS | |
| Database | Firebase Firestore | Project `labflow-6cb9e` |
| Auth | Firebase Auth, Google **popup** (`signInWithPopup`) | Redirect requires `/__/firebase/init.json` (Firebase Hosting). **Popup only — do not revisit.** |
| Hosting | Vercel | Live URL `https://labflow-six.vercel.app` |
| Trusted server | Next.js Route Handlers + OIDC/WIF | ADR-001 **Accepted**, Option B. `/api/health` **503** until GCP/Vercel OIDC is finished (`DEPLOY-2026-08-21.md`) |
| Mail | Resend (specified) | `RESEND_API_KEY` **not** on production |
| Offline cache | `persistentLocalCache` + multi-tab | `app/lib/firebase.ts` |

**Firestore security rules `get()` / `exists()` limits (audit 1.5, from ADR-001 quoting Google):**

- **10** access calls per **single-document request or query request**;
- **20** per **multi-document read, transaction, or batched write**;
- Exceeding either limit → permission denied (looks like a permissions bug);
- LabFlow writes an audit-log entry alongside clinical writes: that is a **batched write**. The 20-call cap applies **per operation and in aggregate** (ADR-001). Custom claims `{ clinicId, role, shift }` exist to keep rules off `get()` where possible; claims-first with `get()` fallback is in `firestore.rules` (undeployed).

**HIPAA / BAA (audit 1.10).** HIPAA does not apply. The 2025 Act’s sensitive-data and cross-border provisions **do, if and when that Act is in force** — which is **not established**. Google’s and Vercel’s (and Resend’s) contractual terms are an input to §16 q3, not “irrelevant”.

**Deliberately not a local server.** There is no on-premises component. Resilience is client-cache-only — a **narrower** guarantee than a local LIS. Do not list “centralised cloud-only architecture” under “deliberately not built”; that **is** the architecture (audit 2.9).

---

## 4. Tenancy, roles, onboarding

### 4.1 Scope of a role

**Built:** A role is held **at a clinic**. `users/{uid}.clinicRoles` is a map keyed by clinic id. `activeClinicId` selects which membership is live. Legacy `role` / `clinicId` / `status` mirror the active membership (`app/lib/membership.ts`).

**Owner:** never a clinic membership. Acting clinic is **session-only** (never written to Firestore as a membership). Matches ADR-001 and `firestore.rules` comments.

**Audit 2.13:** v0.4’s “every non-owner has exactly one clinic” contradicted `activeClinicId`. Reality is multi-clinic membership for staff; owner is the exception.

### 4.2 SLIPTA §9 access rights — gap analysis (audit 1.2)

SLIPTA §9 (as cited by the audit; checklist **not in this repo**) expects four **separately controlled** rights: view patient data; enter results; modify data/results; release results.

**Do not put this mapping in an accreditation evidence pack until it is true.**

| Right | UI matrix (`permissions.ts`) | Undeployed `firestore.rules` | Deployed in production |
|---|---|---|---|
| 1 View patients | `canViewPatients` (intern ❌, storekeeper ❌, clinic_admin ✅) | `allow read` requires `canViewPatients()` | **Not deployed** (Stage C) |
| 2 Enter results | `canEnterResults` | result-value writes require `canEnterResults()` | **Not deployed** |
| 3 Modify data/results | Same as enter for pre-release; amend = `canApproveResults` | Enter and pre-release modify are **the same** rule; amend shares approval | **Not deployed** |
| 4 Release | `canApproveResults` | approval/amendment fields require `canApproveResults()` | **Not deployed** |

**Honest count:** of the four separately controlled rights, **release is the one v0.4 treated as enforced**. This tree’s **undeployed** rules also gate (1) and (2). Right 3 is **not** separately controlled from enter (pre-release) or from release (amendment). Interns still cannot read patients they create (see §4.3 intern row and §5 / 3.8).

**Intended rule changes (specified, not built as extra work in this task):** keep per-capability patient read; keep result-value write restriction; add a distinct modify-after-entry policy if enter and correct must split; intern time-boxed read of own registrations.

### 4.3 Capability matrix (authoritative predicates: `app/lib/permissions.ts`)

Columns: **Own** owner · **Adm** clinic_admin · **Mgr** lab_manager · **Sup** lab_supervisor · **Tech** technician · **Asst** technician_assistant · **Int** intern · **Str** storekeeper

| Capability | Own | Adm | Mgr | Sup | Tech | Asst | Int | Str | Notes |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| Create / see all clinics | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Manage staff / join code / clinic profile | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | |
| Register patients | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | Intern: register only, today |
| View patient list | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | Intern gap: §13.5 |
| Order tests | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | |
| Enter results | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | |
| Approve / release / send back / amend | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | Same role set — SLIPTA 3/4 collapse |
| Self-release override | ✅* | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | \*owner **acting in a clinic** uses the same override (audit 2.7). **Specified, not built** |
| Record critical-result notification | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | **Specified, not built** |
| Enter referral result / dispatch | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | **Specified, not built** |
| Read audit log | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | Built: owner + clinic_admin (`firestore.rules` audit read) |
| Edit catalogue | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | |
| Dashboard | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | Built |
| Export reports | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | Supervisor cannot export (by design) |
| **Import data (intended)** | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | **Specified, not built** — today code grants Adm not Mgr |
| **Soft-delete patients (intended)** | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | **Specified, not built** — today code grants Adm; rules omit Sup |
| Record stock in/out | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | Built |
| View stock | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | Built |

**Audit 2.12 — resolution.** Principle retained: the person who runs the clinic is not the person who creates or destroys the clinical record. **`clinic_admin` does not register, import, or soft-delete patients.** Import and soft-delete move to laboratory roles (`lab_manager`; soft-delete also `lab_supervisor` as a clinical act). Owner retains break-glass. **Status: specified, not built.** Current code: `canImportData(owner, clinic_admin)`; `canDeletePatient` includes clinic_admin.

**Audit 2.7 — shift.** Shift is a **static** attribute on `lab_supervisor` membership (`morning` \| `afternoon` \| `night`). It answers “which shift are they assigned to,” **not** “were they on duty at 03:40.” No roster is specified for v1. The self-release override **does not** test availability (uncomputable). It is always available to an approver, with a **reason code**, `selfReleased: true`, and a dashboard rate.

**Role presets (audit 3.10, specified, not built).** At clinic creation offer: “solo/small lab”; “with intern”; “with storekeeper”. Dashboard warning when fewer than two distinct approvers exist, or when >80% of releases are by the person who entered the result.

### 4.4 Separation of administration from laboratory

**REQ-4.5-01.** `clinic_admin` cannot approve results and cannot edit reference ranges. Those are laboratory judgements. Admin access to the patient **list** is for accountability, not clinical decision-making. (ISO 15189 technical competence for release — as a design alignment, not a certification claim.)

### 4.5 Onboarding (from v0.2 §4, still in force)

Self-service clinic signup is deferred (no payments entity). Owner creates the clinic (name, address, TIN, business registration, responsible person), system generates a join code, owner assigns first `clinic_admin` by email. Staff: Google sign-in → pending → enter code → **confirm clinic name** → wait for approval → role assigned.

Join lookup is **not** a client query on `clinics`. See §12.1 (disclosure) and §12.2 (server redeem).

### 4.6 Owner protection

Assigning a clinic role to `owner` is rejected. `ProtectedRoute` allows owner through. The staff dropdown never offers `owner`.

---

## 5. Orders, results, quality

### 5.1 Lifecycle (REQ-5.1-01)

Internal enums stay English. **Displayed** labels are next actions (audit 3.7). Test labels with actual staff before locking copy.

| Enum | Display | Colour (UI) | Icon (name) | Queue column | Terminal? |
|---|---|---|---|---|---|
| `pending` + no collection | Awaiting sample | Neutral grey | vial | Pre-analytics | No |
| `pending` | Enter results | Blue | pencil | Bench | No |
| `results_entered` | Ready to check | Amber | clipboard | Review | No |
| `needs_correction` | Fix this | Red | return | Bench | No |
| `approved` | Done | Green | check | Released | **No** (audit 2.5) |
| `amended` | Corrected | Green + badge “vN” | check-plus | Released | **No** — repeatable, incrementing `version` |
| `rejected` | Cannot test | Red | block | NCE | Specimen-level; reason code required |
| `cancelled` | Stopped | Neutral | dash | Closed | Order-level; reason code required |

**`approved` is not terminal.** Amendment writes a **new version**; the original is never overwritten. Every reprint shows version and the amendment chain (REQ-5.5-01). **Specified; partially built** (`resultAmendment.ts` versions; comments still call released results terminal).

**`rejected` / `cancelled` (audit 2.6, specified, not built).** Controlled reason codes (haemolysed, insufficient, clotted, mislabelled, leaked, duplicate order, patient left, …). Both feed a rejection-rate indicator and a §7.3 nonconforming-event record. Without this path, staff fabricate a result, leave `pending` forever (dropped from TAT), or delete the patient.

### 5.2 Turnaround and collection time

TAT = **latest specimen collection → approval** (v0.2 §5.4). Orders missing a collection time, or flagged disputed, are **excluded** from statistics, never counted as zero.

**Audit 2.15 (REQ-5.2-01).** The owner repair tool must **not clear** collection times. Keep the value, set `collectionTimeDisputed: true`, exclude from TAT on that flag, print the value with a note, log a data-quality event. **Specified, not built.** Code today deletes fields (`COLLECTION_TIME_FIELDS_TO_DELETE` in `dataQuality.ts`).

**Audit 3.11 (REQ-5.2-02).** Default **one collection time for the order**. An explicit “specimens collected at different times” toggle reveals per-specimen fields. Record which mode was used. **Specified, not built.** Code today is per-specimen-first (`sampleCollection.ts`).

### 5.3 Review

Dedicated review queue; **approval in a list row: forbidden** (v0.4 / research). Panel shows each value in a type-aware way (§6.0). Send-back uses a **reason code**, not a 10-character English essay (audit 3.3). **Specified, not built** (free-text still in code).

### 5.4 Entry/release separation and self-release

**Analytic judgement, not field evidence (audit 1.4).** Research commentary (uncited in `lims-research.md` §5 item 5, per the audit) that “in a three-person lab, mandatory dual sign-off produces workarounds — the technologist signs both” is about **two people verifying the same result**. LabFlow’s control is **different person releases**. In a three-person lab (manager + two technicians) that is not a deadlock. The actual problem is the **single-approver shift** (manager or lone supervisor entered the result).

**REQ-5.4-01 (specified, not built).** When the releaser is the same person who entered: require a reason **code** (e.g. `sole_approver_on_duty`), set `selfReleased: true`, show the rate on the dashboard. Always available to `lab_manager` and `lab_supervisor`. **Owner acting in a clinic uses the same path** (not a third silent grant). No “if another approver is on duty” test.

### 5.5 Amendment

Repeatable. Reason **code** + optional note on the **order** (erasable), not only in the immutable log. Second-approver confirm when the original releaser amends: already sketched in `resultAmendment.ts`. Character-minimum free text is **withdrawn** as a quality signal (audit 3.3).

If an amendment turns a value **critical**, follow §5.6 before the new version is treated as notified.

### 5.6 Critical results (specified, not built)

Detection is **type-aware** (§6.0): numeric `criticalLow`/`criticalHigh`; qualitative designated-critical answers.

**Do not block the patient on a successful read-back (audit 3.5).** Model **attempts**: timestamp, means, outcome (`no_answer` / `wrong_number` / `voicemail` / `read_back_ok`). Allow release when ≥1 attempt is recorded; flag “critical — notification pending” on screen and report; escalate after N minutes to a configured second contact; dashboard metric = time to **successful** notification.

**Offline (audit 2.8, REQ-5.6-01):** the communication record is an §8.2 offline-permitted write (it records something that physically happened). Critical thresholds are part of the **mandatory offline cache** (catalogue). Release remains online-only until server tokens exist; a recorded attempt must not be lost if release waits for sync.

### 5.7 Dashboard (v0.2 §5, built)

Visible to owner, clinic_admin, lab_manager, lab_supervisor. Windows: today / yesterday / this week. Metrics: registered, ordered, by type, pending, awaiting review, sent back, released, median TAT, plus **specified additions:** self-release rate, amendment count, notification time, unresolved sync rejections (age), single-approver warning.

---

## 6. Catalogue and result model

### 6.0 Data model (audit 4.2, 3.4) — specified, not built as a complete type system

| Concept | Meaning |
|---|---|
| **Test** | Orderable item (may be a panel). |
| **Parameter / analyte** | A result-bearing line (FBC has many). |
| **Panel** | One order line, many parameters. |
| **Result type** | `numeric` (value, unit, range, critical limits); `qualitative` (closed answer set; some answers abnormal/critical); `semi-quantitative` (ordered scale, e.g. +/++/+++); `text`. |
| **Unit** | Catalogue field; **SI on the printed report** (SLIPTA §9 as cited). |
| **Range dimensions** | Sex, age band, pregnancy, method — not a single range per test. |
| **Method** | Catalogue field, printed. |
| **Decimal / number format** | Specify per clinic; default `.` with grouping off on print. |

Flags (H/L) and critical detection **must not run on qualitative malaria films as if they were numbers**. Split “rapid diagnostic tests” into **named tests**, each with a specimen type.

**Built today:** `testCatalog` documents with `parameters[]` `{ name, unit, referenceRange }`, `specimenType`, `reviewed`, `seededFrom`. Essentially a numeric-shaped list. Qualitative work is forced into strings.

### 6.1 National primary-tier menu

v0.4 mandated a national primary tier (urinalysis, malaria film, stool microscopy, haemoglobin, glucose, sickle cell, named RDTs). **Exact national menu: not established in this repo.** Replacing the seeded 16-test catalogue is §17.1, not a silent overwrite.

### 6.2 Two catalogue states (audit 2.16)

**Rule A — no catalogue at all (REQ-6.3-01).** Block ordering and results entry. Show a single blocking screen: seed or import a catalogue. Do not paper over with an in-memory fallback. A clinic with zero tests cannot record truthful results.

**Rule B — catalogue exists but some rows are unreviewed (REQ-6.3-02).** **Do not block.** Banner: “N of M ranges unconfirmed” with a link to review and a one-click “confirm seeded range as-is” that records the confirmer. On **print**, caveat **only unconfirmed rows**, not the whole report. (Audit 3.9; banner count is **built** in `CatalogReviewBanner`.)

### 6.3 Inventory (v0.2 §6 — in force; **built** in `app/lib/inventory.ts`)

Item master, lots with expiry, movements ledger. **Balance is calculated, never stored, never typed.** FEFO recommendation on issue (not a hard block). Flags: expired, ≤30 days, below minimum. Specimen **custody** log is separate and **must not** set `sampleCollectedAt` (conflating them corrupts TAT).

---

## 7. SLIPTA / ISO alignment (honest)

### 7.1 EQA figures (audit 1.6)

As **quoted by the audit** from `lims-research.md` §Q12 (file not in this repo; **needs source** to quote externally): pooled African EQA performance **71.25% (95% CI 63.1–79.4)**, West Africa **65.38%**, malaria testing **53.47%**, **I² = 96.4%**, publication bias Egger **P = .002**, 17 studies, South Africa 1,915 of 4,509 labs.

**Read as a direction (quality assurance is weak and poorly measured), not a two-decimal benchmark.**

### 7.2 What software can and cannot deliver (audit 1.9)

v0.4 claimed a lab could “press one button and hand an assessor most of” SLIPTA §§1, 7, 9, 10. That contradicts its own gap table.

Arithmetic **as stated in the audit** (checklist not in this repo — **unverified** against the official form): 86 software-touchable points ≈ 23% of 375; **one star needs 206 (55%)**; §12 (57) + §3 (34) = 91 points of essentially **non-software** work. **Software cannot deliver a star.** The laboratory must still earn on the order of **~42% of the remaining (non-software) sections**. Do not sell “most of four sections.”

| SLIPTA section (audit’s grouping) | Honest software status |
|---|---|
| §1 Document control | Not built |
| §7 Supplier / inventory | Partially: item/lot/movement **built**; supplier list, inspection, preparation/stability, consumption rate, storage-temperature monitoring, disposal records: **not built** |
| §9 LIS operations | Release workflow **built**; backup records, pre-implementation/upgrade verification, calculation/transfer checks, analyzer/HIS interface records, archived-result retention: **not built** |
| §10 Nonconforming events | Not built; rejection should force one (OpenELIS pattern) |

### 7.3 Gap table (completed, audit 4.14) — selected **and** the items v0.4 omitted

| Gap | Status |
|---|---|
| Nonconforming event register (rejection forces a record) | specified, not built |
| Sample rejection log / quality indicator | specified, not built |
| EQA/PT enrolment, panel as routine specimens, CAPA on failure | specified, not built |
| Measurement uncertainty per quantitative test | specified, not built |
| Complaints register | specified, not built |
| Method validation / verification records | specified, not built |
| Document control | specified, not built |
| LIS backup, restore test, upgrade verification, downtime RCA | specified, not built (§12.5) |
| Result-ready SMS (ethics) | roadmap (§15.3) |

---

## 8. Offline

### 8.1 Constraint (audit 2.10) — state plainly

Google popup sign-in **requires a network**. Tokens expire on the order of an hour and cannot refresh offline. Therefore:

- A technician who arrives during an outage **cannot sign in**.
- A session already open dies within the token lifetime.
- Offline operation is available only to someone **already authenticated** who **keeps the tab open**.

This is the night-shift scenario §8 exists for. **REQ-8.5-01 (specified, not built):** device-level encrypted session established while online; per-staff **4–6 digit PIN**; PIN re-entry for release, amendment, erasure, export; idle lock in minutes; acting staff UID on every write from the PIN identity, not the shared Google identity; maximum offline lifetime; forced re-auth on reconnect. This is also the shared-workstation audit-trail control (audit 3.1).

### 8.2 Permitted offline (client queue)

Registration, ordering, results **entry**, sample collection, inventory movements, **critical-result communication attempts** (audit 2.8).

**Duplicate detection (audit 2.11, REQ-8.2-01, specified, not built):** when offline, warn that checking is limited to **cached** patients; set `dedupPending: true`; server-side sweep on sync; candidates in the sync-problems panel. Interns cannot `read` patients under undeployed rules — their duplicate query will **fail when rules go live** unless registration dedup moves server-side or intern read is time-boxed (§13.5).

### 8.3 Sync problems

A rejected write is a **clinical** event. Show what, when, which patient, why.

**Remedies (audit 3.13, specified, not built):** transient → retry; permission/validation → re-enter with payload pre-filled; stale permissions → escalate to a named approver. Unresolved rejections **do not** vanish on acknowledgement: they appear on the manager dashboard with age. Bind queue entries to the **authoring** staff identity so a user switch cannot re-attribute them.

**Built:** IndexedDB write log (`writeQueue.ts` / `trackedWrites.ts`). Remedies and dashboard ageing: not complete.

### 8.4 Release and print — enforcement (audit 2.1)

Firestore rules **cannot** see whether the client was offline. A queued write is indistinguishable from an online write on arrival. Therefore “must not release or print unsynced results offline” is **not enforceable** as a rule.

**Until the intended control exists, §8.4 guards are advisory client-side.** Residual risk: a stale tab, a bug, or a crafted client can print or write approval fields (subject to role rules once deployed). Record this in §16.

**Intended control (REQ-8.4-01, specified, not built):** release is a **server** route: verify order state, write approval, return a **signed release token**. Print view refuses to render without a verifiable token.

**Provisional report (audit 3.2, REQ-8.4-02, specified, not built).** Distinguish: printing an **unreleased** result (hazard) vs printing a **released, locally confirmed** result during an outage (not the same hazard). SLIPTA §9 includes provisional reports (as cited by the audit). Headed and watermarked **PROVISIONAL — not yet confirmed to the laboratory record**; reconcile on sync and reprint final. That is the 03:00 deliverable.

### 8.5 Conflict semantics (audit 1.3, 4.7)

**Today:** last-write-wins per field; unspecified in v0.4; **now specified as current behaviour**.

**Intended:** version the order; detect concurrent modification on flush; show both versions in §8.3.

### 8.6 Queue contract (audit 4.6, specified, not fully built)

Flush on reconnect and on a timer; preserve per-author identity; do not flush another user’s pending writes as the newly signed-in user; on sign-out, keep the queue but do not attribute to the next user; document IndexedDB quota and eviction; multi-tab: one flusher. “Disappeared without confirmation” needs an explicit interval and a read-back of the server document (Firestore does not surface per-write rejection to the client as a dedicated API).

### 8.7 Time (audit 4.5, specified, not built)

Every clinical event: `occurredAt` (client, declared) and `recordedAt` (server, assigned on commit). Capture clock offset at sync; flag skew above a threshold (threshold **not established** — product default to specify before build, e.g. 5 minutes). Print `occurredAt`; audit both. Firestore `serverTimestamp()` on an offline write is **sync time**, not event time.

---

## 9. Referrals (specified, not built)

Dispatch record: destination laboratory, which **specimen id**, tests, time, transporter. Returning results enter as referral results (capability in §4.3). Unimplementable without specimen IDs (§13.3).

---

## 10. Reporting and export

### 10.1 Completeness vs lateness (audit 1.11)

v0.4 summarised completeness 80.3% and timeliness 74.6% as “roughly a quarter of reports were **late**.” If ~20% were **missing**, that is not lateness. **Those percentages are not restated as facts here** (needs source). When using directorate statistics, distinguish **late** from **missing**.

### 10.2 Traceability (audit 1.11, 3.12)

Emailing a file to the requester’s registered address makes exfiltration **attributable**, not prevented. The recipient can forward the file.

**REQ-10.2-01.** **In-browser download is the primary path**, logged (actor, range, row count, clinic). Email is optional (Resend). Current-period and historical use the **same** log. **Specified; code today emails via `/api/reports/export` and Resend is unconfigured on production.**

---

## 11. Data protection

**Status line (audit 1.1):** Commencement of the 2025 Act is **not established**. Everything in §11.2 that v0.4 stated as operative law was drawn from **secondary commentary** (TechHive, Malagen, Data Protection Africa — as named by the audit) and is **unverified against the enacted text**. Replace any row with an Act section number when counsel provides one, or leave it `not established`.

**Do not quote Appendix A penalties externally.**

### 11.1 Instrument

v0.4 stated the Bill was passed by the National Assembly on **29 September 2025** and “treated by government as in force” from late 2025, while also stating exact assent and commencement were **not established**. A passed bill is not law until assent and commencement. “Treated as in force” is not a legal status in this document. **Needs counsel + needs source.**

Oversight commission: v0.4 itself said it was unknown which Commission exists. Do not specify “notify the Commission” as if the addressee were known.

### 11.2 Lawful processing (unverified)

v0.4 enumerated seven lawful bases including “research/archiving.” GDPR-lineage statutes typically have **six** bases; research/archiving is often a special-category or compatible-purpose provision, not a seventh basis. **Do not implement a seven-basis enum until counsel maps the enacted text.**

72-hour notification, sensitive-data threshold, cross-border adequacy: **not established** here. They are **counsel inputs**, not product facts.

Retention: **must be configurable** (legal requirement). Technical audit-log delete is a different problem (§11.5).

Consent checkbox at registration: **built** (`consentGiven: true`). That is not a complete lawful-basis model.

### 11.3 Soft-delete

Patient records are soft-deleted (flag + reason **code** + optional note on the entity). Hard `deleteDoc` is denied in undeployed rules. **Built** (`patientSoftDelete.ts`) with free-text reason today.

### 11.4 Erasure vs audit log (audit 2.3) — specified gap / intended redesign

v0.4’s “remove identifying fields, keep an audit row of the erasure” does **not** erase: (a) **pre-existing** audit rows with `targetLabel` = name + Lab ID; (b) free-text reasons that copy identifiers; (c) IndexedDB replicas; (d) Firestore backups/PITR; (e) **staff** as data subjects (actor email).

**Intended (specified, not built):**

- Store `targetId`; resolve a label **at read time** from the live entity (or a redacted placeholder if erased).
- Controlled **reason codes** on the log; optional prose on the **entity** (erasable).
- State in every erasure runbook: local replicas and backups are **out of reach** of a server-side field clear.
- Staff erasure is a separate, unanswered counsel question.

**Code today:** `auditTargetLabel(name, labId)` persists identifiers; `auditLogs` are create-only.

### 11.5 Audit log — legal vs technical retention (audit 2.4)

**Legal:** produce records on request; keep no longer than needed (**retention period needs counsel** — §16).

**Technical today:** create-only; no update/delete including owner (`firestore.rules`).

**Intended archival (specified, not built):** after the retention period, export to signed cold storage; a **server job** is the only principal with delete rights on `auditLogs`; the export itself is logged.

**Action vocabulary (from `AUDIT_ACTIONS` plus gaps):** include self-release, erasure execution, critical notification, referral dispatch, stock/specimen movements, amendment (some already present: `order.amended`, inventory not fully named).

### 11.6 Geography enum

v0.4 “one of the seven health regions” — **no source in this repo**. Do not hard-code seven. **Needs source.**

---

## 12. Security, join code, LIS operations

### 12.1 Join-code disclosure (audit 4.1) — restored unconditionally

**Historical (P4):** Firestore rules cannot see query filters. Join-by-code therefore required **any signed-in user to read `clinics`**, including name, address, TIN, and business registration of **every** clinic. That is an acknowledged breach of tenant isolation. v0.4 deleted this disclosure while keeping “view join code” in the matrix — a developer implementing §12.2 literally would either break join or reintroduce the blanket read **without risk acceptance**.

**Specified fix (ADR-001, now coded):** `POST /api/join/redeem` and `POST /api/join/confirm` (Admin SDK). Client does not query `clinics` by `joinCode`. Rate limit: **five attempts per user per hour**; failures logged (`joinCode.failedAttempt`). Working-tree rules: clinic read = owner or member, **not** any signed-in user (`firestore.rules` match `/clinics`).

**Live:** those routes exist in this repo. **Rules are not deployed.** Until Stage C, the production database may still expose whatever the current Firebase ruleset allows (historically: open or blanket clinic read). Treat the disclosure as a **live risk until rules deploy and a playground pass exists**.

**Why `/api/health` gates rules (audit 2.2 + Q3R).** Join **depends on the Admin SDK**. If rules are tightened to deny client clinic listing **before** OIDC/WIF makes `/api/health` ok, **join breaks** (no client fallback that is safe). That ordering is not “identity theatre”; it is the join-break rationale. The audit’s concern remains: **rules-not-deployed on a live URL is a security exposure**. Both statements are true. Sequence: health green → deploy rules → still **no real patient names** until §12.4’s full conjunction.

### 12.2 Rules posture

Client checks are interface convenience. **Undeployed** `firestore.rules` are the intended data-plane enforcement. Default deny on unspecified paths. Claims-first identity with `get()` fallback (ADR-001 §8.1).

Users may write their own `username`, `usernameUpdatedAt`, and `activeClinicId` (multi-clinic). Owner does not use `activeClinicId` in Firestore.

### 12.3 Interns and duplicate detection

Interns: `canRegisterPatient` true, `canViewPatients` false. Duplicate detection **reads** `patients`. When rules deploy, intern registration’s `getDocs` will **deny** unless changed. Server-side dedup or time-boxed own-patient read is required (see §13.5).

### 12.4 Gate on real patient data (audit 2.2)

**REQ-12.4-01.** No real patient name enters any LabFlow environment until **all** of:

1. Firestore rules (and indexes) are **deployed** and playground-tested;
2. Cross-border / processor residency is **answered by counsel** (§16 q3);
3. A lawful basis and a **retention default** are set.

Deploying rules alone does **not** unblock real data. Q3R Stage C green is necessary, not sufficient.

### 12.5 LIS operations records (audit 4.9, specified, not built)

Backup policy and restore-test cadence; upgrade verification checklist; incident/downtime log with RCA; archival of results per retention. Add each to accreditation evidence only when they exist. Word “backup” must appear in the runbook, not only here.

---

## 13. Identity, print, UX, training

### 13.1 Staff UI language (audit 3.6)

Do not justify staff-screen design with national adult literacy. Justify with **second-language English, time pressure, turnover**. **Do not close localisation** on first-language share (no language above 38% in v0.4 — **unverified**). Re-open when comprehension data exists.

### 13.2 Printed report (REQ-13.2-01)

**Page header on every page:** patient name, Lab ID, collection date-time, “Page n of m”.  
**Once, large, on page 1:** Lab ID in an **ambiguity-free alphabet** (Crockford base32 or equivalent) **with a check digit**. Monospace **does not** disambiguate `0`/`O` (audit 1.11).

**Patient-facing block (audit 3.6, specified, not built):** plain-language line per abnormal result; one “return to the clinic / no action needed”; non-textual normal/abnormal marker. This is where literacy evidence belongs.

**Mechanism (audit 4.11):** browser `window.print()`, **A4** (existing patient print page). No printer: user still gets a print dialog / PDF via the browser. **Released, locally confirmed** reprints while offline: allowed once §8.4’s distinction exists; **unreleased** print remains forbidden (advisory until tokens). **Reprints are audited** (specified, not built).

SLIPTA §9 print list (as cited by the audit): requester, method, location, sample type, SI units, interpretation space. Capture gaps: §4.10.

### 13.3 Lab ID and specimen ID (audit 4.4) — highest-severity unspecified item in v0.4

**Built today:** `LF-YYYYMMDD-` + four random digits (`generateLabId`). **Not collision-free** across two offline devices.

**Intended (REQ-13.3-01, specified, not built):** clinic prefix + device/session prefix + monotonic counter, **or** a ULID rendered in an ambiguity-free alphabet + check digit. Uniqueness **per clinic**. Specimen/accession ID distinct from patient Lab ID; linked to order, collection time, referral dispatch.

**Labels (audit 4.8, specified):** v1 = **handwritten Lab ID on the tube**, defined layout. Optional QR later. Unfunded printer cost is a **documented deployment risk** (Ivorian CFIR / APHL as cited by the audit; files not in this repo).

### 13.4 No native app

See §1.2. Bench-as-workstation. **GSMA figures deleted.**

### 13.5 Intern corrective window (audit 3.8, specified, not built)

Intern may **read and edit patients they created within 8 hours** (one shift). Corrective edit writes an audit action. Build this **before** onboarding interns into production. Today `internAllowedPath` is `/register` and `/profile` only.

### 13.6 Training and turnover (audit 4.16, specified, not built)

First-run guidance; demo clinic with synthetic data; handover checklist when a lab manager leaves. Offboarding remains §16 q10.

### 13.7 Import (v0.2 §7 — in force; **built** for owner/clinic_admin)

`.xlsx` / `.csv`; column mapping; per-row validation; `clinicId` stamp; no silent overwrite. Staff import = **pre-approvals**, not accounts; 90-day lapse (`CRON_SECRET` job specified; not live). **Intended importer role:** owner + lab_manager (§4.3).

---

## 14. Product name

v0.4 said “at least seven” other products use the name and then enumerated **six**; Sources added `laboratoryflow.com` (a different name). **Count: six named collisions in that draft, not seven.** This repo does **not** re-enumerate them (needs source to publish a list). Treat “LabFlow” as a collision-prone name for trademark search; do not claim uniqueness.

---

## 15. Build status (grounded 22 Aug 2026)

### 15.1 Built in this repository (not all production-verified)

Homepage, Google popup auth, protected routes, patient registration (consent, phone, name+DOB/phone duplicate prompt), patients list, soft-delete, print page, 16-test catalogue seed + review banner, orders, results entry, supervisor review, amendments (versioned), dashboard, inventory (items, batches, movements, specimens), spreadsheet import / migration, staff + pre-approvals, owner console, clinic profile, join **API**, audit log writer + owner/admin viewer, write queue, `firestore.rules` **file**, Route Handlers (`/api/health`, join, export, claims sync, pre-approval lapse).

### 15.2 Specified, not built (audit Top 5 and §3–4)

PIN device session; server release token; provisional report; result types; `rejected`/`cancelled`; NCE register; critical-result attempts; reason-code vocabulary; audit-log erasability + archival; dual timestamps; conflict UI; collision-free Lab/specimen IDs; intern 8-hour edit; role presets; collection-time dispute flag (code still **clears**); clinic_admin import/delete move; SMS.

### 15.3 Result-ready SMS (audit 4.13)

**Roadmap**, not silence. Ethics constraints **as cited by the audit** from `lims-research.md` §Q8 (file not in this repo): opt-in; never the diagnosis in the SMS body; per-patient direct-vs-coded choice; consent in existing forms; documented reversal of a national programme that texted results to mothers. **Needs source** to implement; do not ship diagnosis-in-body SMS.

### 15.4 Cost (audit 4.15)

**Not estimated.** Unfunded operating cost (printing, SMS, Blaze, Vercel) is a documented LIS-abandonment risk in the audit’s research citations. **Who pays for consumables: the clinic** (product assumption). Firestore free-tier headroom: **not established**.

### 15.5 Production

See `DEPLOY-2026-08-21.md`. `/api/health` 503; rules not deployed; Resend not configured; **no real patient names**.

---

## 16. Open questions

1. **Retention period** for clinical records and for audit logs — **needs counsel**. Oldest open item in this lineage (v0.2 §12).
2. **Is processing on Firestore (Google) and Vercel (and Resend) lawful** under the 2025 Act if commenced, including cross-border / adequacy / safeguards? **Needs counsel. Most serious compliance question.**
3. **Commencement and operative text** of the 2025 Act; lawful bases; notification addressee; penalties — **needs counsel + needs source**.
4. Storekeeper / patient data: matrix grants none. **Confirm** (v0.2 q4). Rules match: storekeeper cannot read patients.
5. Offboarding when a PIN-session model exists — **depends on 2.10**.
6. National primary-tier catalogue source document — **needs source**.
7. Current electricity reliability (2026) — **needs source**.
8. Health-region list — **needs source**.
9. Residual risk of advisory §8.4 until REQ-8.4-01 ships — **accepted until built**.
10. Staff display-label testing (§5.1) — **product**.

---

## 17. Next steps (specification order, not a command to deploy)

1. Counsel pack: commencement, residency, retention default, lawful basis.
2. Finish OIDC so `/api/health` is ok, **then** dry-run and deploy rules (Stage C) — still no real names until §12.4.
3. Do not treat Stage C as “write v0.4 and go live with patients.”
4. Product: Top 5 in this document’s header.

### 17.1 Migration runbook (audit 4.12, specified)

No real production patients yet. When changing catalogue, collection-time model, claims, or rules: ordered steps, rollback SHA at each step, **run against a copy first**. Existing orders must not silently change meaning when catalogue rows are replaced (`seededFrom` / codes). Rollback target as of Q3R: recorded in `DEPLOY-2026-08-21.md`.

---

## Appendix A — Penalty schedule as it appeared in v0.4

**Unverified — do not quote externally.**

v0.4 stated criminal penalties (3 years / minimum D500,000; 5 years / minimum D1m or 5% of gross income; 10 years aggravated; 2 years concealment) from secondary commentary, **without Act section numbers**. “5% of gross income” did not state of whom or over what period. **This appendix exists so the audit trail is complete. It is not law.**

---

## Appendix B — High-risk requirements (audit 4.17)

| ID | Statement | Acceptance (intent) |
|---|---|---|
| REQ-5.1-01 | Lifecycle includes `rejected` / `cancelled` with codes | Cannot release a rejected specimen as `approved` |
| REQ-5.2-01 | Disputed collection time is marked, not deleted | Repair tool leaves original timestamp |
| REQ-5.4-01 | Self-release is coded + flagged, always available to approvers | Dashboard can count `selfReleased` |
| REQ-5.5-01 | Amendment is versioned and repeatable | Reprint shows chain |
| REQ-5.6-01 | Critical comms recordable offline; release after attempt | Attempt survives refresh |
| REQ-6.3-01/02 | Empty catalogue blocks; unreviewed does not | Seeded clinic can work |
| REQ-8.0-01 | Offline = queued writes, LWW, not category (c) | Docs/sales match |
| REQ-8.4-01 | Server release + signed print token | Print without token fails |
| REQ-8.4-02 | Provisional report watermarked | Distinct from final |
| REQ-8.5-01 | Device session + PIN | Night shift without Google popup |
| REQ-8.2-01 | Offline dedup warning + `dedupPending` | Sync panel shows candidates |
| REQ-10.2-01 | Download primary, logged | Same audit as email |
| REQ-12.4-01 | Conjunction gate on real names | Checklist of three |
| REQ-13.2-01 | Header every page; large Lab ID page 1 | Multi-page print |
| REQ-13.3-01 | Collision-free Lab ID offline | Two devices, no clash |
| REQ-13.4-01 | No native staff app | Workstation argument only |

---

## Appendix C — Sources that exist in this repository

| Document | Use |
|---|---|
| `docs/PRD.md` (v0.2) | Operational modules re-imported |
| `docs/ADR-001-trusted-server.md` | Trusted server, `get()` 10/20, join |
| `RULES-TESTING.md` | Join disclosure history; playground |
| `firestore.rules` | Intended enforcement (**not deployed**) |
| `DEPLOY-2026-08-21.md` | Production / health / Stage C |
| `OFFLINE.md` | Persistence API, queue intent |
| `S7-EXPORT.md` | Export limits, email path |
| `RESEARCH-result-review.md` | Review UX peers |
| `app/lib/permissions.ts` | Live matrix |
| `app/lib/auditTypes.ts` | Audit fields / actions |
| `app/lib/membership.ts` | Multi-clinic |

**Not in this repository:** `lims-research.md`, research-grounded PRD v0.3/v0.4, GSMA reports, 2025 Act text, World Bank 2018 PAD, official SLIPTA checklist.

---

*End of PRD v0.4.1*
