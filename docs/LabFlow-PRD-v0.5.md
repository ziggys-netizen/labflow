# LabFlow — Product Requirements Document v0.5

**Status:** Current working specification  
**Date:** 22 August 2026  
**Owner:** Isaac Kanu  
**Market:** The Gambia, West Africa (first deployments)  
**Supersedes:** `docs/LabFlow-PRD-v0.4.1.md` (audit reconstruction), `docs/PRD.md` (v0.2), and the unaudited research-grounded v0.3/v0.4 text (those files are **not** in this repository)

**Method.** Everything unverified is marked. The v0.4 claim “Nothing is guessed” is withdrawn. Status on a requirement is one of: **built** · **partially built** · **specified, not built** · **specified, built, rules not deployed** · **unverified** · **needs counsel** · **needs source**. No assessor-facing claim is made that the product cannot support.

**Provenance.** The research-grounded PRD v0.4 that the 22 August 2026 adversarial audit examined lived in a Claude tree (`/home/claude/labflow/`) and is **not on this disk**. This document is a full working specification: it applies every audit Fix, re-imports the operational modules from PRD v0.2 so a developer can build from **one** file, and records where application code in `C:\Users\kanui\Documents\LF1` already differs from the audited draft.

**Incorporation (audit 4.1).** Research-grounded v0.3 is also not in this repo. **v0.5 revises the listed sections and restates v0.2 §§4, 5, 6, 7 and 8 in force below.** The join-code disclosure is restored in §12 regardless of that missing file.

**This document is a specification.** Where code already implements a Fix, the status is **built** (or **partially built**). Where it does not, the intended behaviour is stated and labelled **specified, not built**. Do not treat a “built” library as a complete user-facing control if the UI or rules still contradict it.

---

## Priority list (Top 5)

These are first-class product properties, not a footnote.

1. **Make the offline story true.** Conflict handling, PIN identity, collision-free IDs, dual timestamps, server-enforced release with a signed print token **or** an honest advisory residual risk, and a provisional report so an offline laboratory can still hand the patient paper. (§2.2, §3, §8, §12.1, §13)
2. **Resolve the legal triangle before the first real patient record.** Erasable audit log; 2025 Act commencement and penalties marked unverified; real patient data gated on **rules deployed AND residency answered by counsel AND a lawful basis/retention default**. (§11, §12.4, §16)
3. **Result data model and a rejection lifecycle.** Numeric / qualitative / semi-quantitative / text types; units; panels; range dimensions; `rejected` and `cancelled` with reason codes feeding a nonconforming-event record. (§5, §6)
4. **Keep this document a superset of v0.2’s operational modules, and specify the data model v0.4 never had.** Inventory, onboarding/join, import, dashboard, audit action vocabulary; join-code disclosure; patient record; Lab ID; specimen identifier. (§4, §6.3, §12, §13)
5. **Evidence discipline.** SLIPTA access rights as a gap analysis; full Firestore `get()` limits (10 and 20); EQA figures with CI/heterogeneity/bias or not at all; no unsourced device statistics; dated power figure; citations that match Sources; arithmetic that software cannot deliver a SLIPTA star.

---

## 0. Why this version exists

PRD v0.2 described the built multi-tenant product and specified inventory, dashboard, import, and Firestore rules as not-yet-built. The application then ran ahead of v0.2.

A later research-grounded v0.3 / v0.4 (Claude tree) revised market, SLIPTA, offline, and Gambian data-protection sections. That v0.4 was audited on 22 August 2026. The audit’s method standard was v0.4’s own claim that nothing was guessed. That claim did not hold. v0.4.1 reconstructed the affected sections. **v0.5 is the full replacement:** every Fix applied, modules restored, and status reconciled with the 22 August 2026 working tree.

**Finding 3 (reworded, audit 1.1).** v0.3’s citation to a 2023 Act was wrong; the correct instrument discussed in the later PRD is the **2025** Act, **whose commencement is not established**. Do not state “the law is the Act of 2025” as settled fact.

Q3R (`DEPLOY-2026-08-21.md`) instructed not to write PRD v0.4 while Stage C (rules deploy) was ungated. This v0.5 is an **audit-corrected specification**, not a claim that Stage C is green.

---

## 1. Product summary

**LabFlow** is a multi-tenant clinical laboratory management platform for small and medium laboratories in West Africa, designed to align **progressively** with WHO/SLIPTA and ISO 15189. It replaces paper registers and disconnected spreadsheets with patient registration, test ordering, results entry, supervised result release, inventory records, and management reporting.

It is **not** an on-premises LIS. There is no local server replica. Resilience is a **browser cache plus a queued-write log**. That is narrower than a site with an on-premises server. State it that way; do not list “centralised cloud-only architecture” under “deliberately not built” — that **is** the architecture (audit 2.9).

### 1.1 Harms the product exists to reduce

Duplicate patient records; unreleased or unattributable results; stock that cannot be reconciled to lot and expiry; reports that cannot be produced for a supervisor or directorate.

### 1.2 Operating context

| Constraint | What this document treats as established | Status |
|---|---|---|
| Intermittent connectivity | Design assumption, confirmed by Firestore persistence (`app/lib/firebase.ts`) | Design constraint |
| Shared bench workstations | Founder/context; drives PIN-session requirement (§8.5) | Design constraint |
| Printed hard copy is the clinical delivery mechanism | Founder/PRD v0.2; print route exists | Design constraint |
| Cost sensitivity | Design constraint; monthly cloud cost **not estimated** (§15.4) | needs source |
| Power in Greater Banjul | World Bank recording parts of the capital region on **two to three hours of power per day in November 2017**, via a **2018** project appraisal document — **unverified here** (PAD not in this repo) | **Current figure not established** (audit 1.8) |
| Adult literacy / languages | National literacy figures do **not** justify staff UI. Laboratory staff are certificate-trained; the staff constraint is **English as a second or third language under time pressure**. Patient literacy belongs on the **printed report** (§13.2). First-language share does not decide localisation. Two-decimal “UNESCO 2022” figures sourced to countryeconomy.com are **not restated** (aggregator; modelled estimates). | needs source (comprehension data) |
| Internet / finance stats | DataReportal “Oct 2025” vs Sources “Digital 2026”, FinScope 2025 with no Sources entry, unreconciled with an AFI 19%→82% inclusion figure vs “~20% hold a bank account.” **Those percentages are not restated here.** | needs source |
| Mobile device mix (v0.4: 60% / 64%) | **Deleted.** No GSMA (or other) source in this repo. | needs source |
| “Seven health regions” | **No source in this repo.** Do not hard-code seven. | needs source |

**No native mobile app for laboratory staff (REQ-13.4-01).** The bench is a fixed workstation. A phone in a wet lab is a contamination and shared-credential problem, not a coverage problem (research §5 item 10 as cited by the audit; `lims-research.md` **not in this repo**). Low-end Android **browser** support remains desirable; it is not justified here with unsourced GSMA percentages.

---

## 2. Market and offline claim

### 2.1 Position

Open-source clinical LIS peers at this scale include OpenELIS Global, Bahmni/OpenMRS, GNU Health LIMS (see `RESEARCH-result-review.md`, 21 August 2026). LabFlow’s intended niche is a small Gambian laboratory: tens of tests a day, one manager and shift supervisors, paper still leaving the building.

### 2.2 Offline taxonomy (audit 1.3)

Research (as quoted by the audit from `lims-research.md` §0.1 — **file not in this repo**) distinguishes:

- (a) cloud-only, unusable without a link;
- (b) store-and-forward without a local replica;
- (c) a device holds a local replica and syncs **with conflict handling**.

The category-(c) phrase “with conflict handling” is part of the taxonomy. **Do not silently delete it.** LabFlow does **not** currently occupy (c).

Firestore client persistence is **per-field last-write-wins**. This document specifies that as the **current** behaviour: no merge, no user-visible conflict UI today.

**Claim (REQ-8.0-01):** LabFlow is an **offline-capable client with queued writes and no conflict resolution**. Concurrent edits of the same order from two devices: the later commit wins per field; the other technician’s values can disappear without a prompt.

**Intended (REQ-8.5-02, specified, not built):** version the order document; on flush, detect concurrent modification; route conflicts into the Sync problems panel with **both versions** shown. Until that ships, sales language must not say “with conflict handling.”

**ISWE LIMS (Zambia).** The audit’s citation of research §1.7: vendor self-description of “100% offline autonomy at every site” via a syncing PWA, plus SMS/WhatsApp alerts, EQA management, and lot-to-lot verification. **Vendor self-description, not independently verified in this repo.** It is the contrary data point v0.4 omitted. “Of every system surveyed” is forbidden unless the survey set is listed.

NHLS-style centralised outage: if Firestore or Vercel is down **and** the browser profile has no cache, the laboratory has no system. That is narrower than a local server.

---

## 3. Technical stack (current, verified in-repo)

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 16.3.0 App Router, TypeScript, React 19.2 | `package.json` |
| Styling | Tailwind CSS 4 | |
| Database | Firebase Firestore (`firebase` 12.17.1) | Project `labflow-6cb9e` |
| Auth | Firebase Auth, Google **popup** (`signInWithPopup`) | Redirect requires `/__/firebase/init.json` (Firebase Hosting). **Popup only — do not revisit.** |
| Hosting | Vercel | Live URL `https://labflow-six.vercel.app` |
| Trusted server | Next.js Route Handlers + OIDC/WIF | ADR-001 **Accepted**, Option B. `/api/health` **503** until GCP/Vercel OIDC is finished (`DEPLOY-2026-08-21.md`) |
| Mail | Resend | `RESEND_API_KEY` **not** on production |
| Offline cache | `persistentLocalCache` + multi-tab | `app/lib/firebase.ts`. Deprecated `enableIndexedDbPersistence` is not used. |
| Version control | GitHub `ziggys-netizen/labflow`, branch `main` | Local path `C:\Users\kanui\Documents\LF1` |

**Firestore security rules `get()` / `exists()` limits (audit 1.5, from ADR-001 quoting Google’s rules documentation):**

- **10** access calls per **single-document request or query request**;
- **20** per **multi-document read, transaction, or batched write**;
- Exceeding either limit → permission denied (looks like a permissions bug);
- LabFlow writes an audit-log entry alongside clinical writes: that is a **batched write**. The 20-call cap applies **per operation and in aggregate** (ADR-001). Custom claims `{ clinicId, role, shift }` exist to keep rules off `get()` where possible; claims-first with `get()` fallback is in `firestore.rules` (**not deployed**).

**HIPAA / BAA (audit 1.10).** HIPAA does not apply. The 2025 Act’s sensitive-data and cross-border provisions **do, if and when that Act is in force** — which is **not established**. Google’s and Vercel’s (and Resend’s) contractual terms are an input to §16 q3, not “irrelevant.”

---

## 4. Tenancy, roles, onboarding

### 4.1 Scope of a role

**Built:** A role is held **at a clinic**. `users/{uid}.clinicRoles` is a map keyed by clinic id. `activeClinicId` selects which membership is live. Legacy `role` / `clinicId` / `status` mirror the active membership (`app/lib/membership.ts`).

**Owner:** never a clinic membership. Acting clinic is **session-only** (never written to Firestore as a membership). Matches ADR-001 and `firestore.rules` comments.

**Audit 2.13:** v0.4’s “every non-owner has exactly one clinic” contradicted `activeClinicId`. Reality is multi-clinic membership for staff; owner is the exception. **`activeClinicId` is retained and documented.** Do not delete it.

### 4.2 SLIPTA §9 access rights — gap analysis (audit 1.2)

SLIPTA §9 (as cited by the audit; checklist **not in this repo**) expects four **separately controlled** rights: view patient data; enter results; modify data/results; release results.

**Do not put this mapping in an accreditation evidence pack until it is true.** The “evidence pack” instruction in v0.4 is **deleted** until the four rights are separately enforced in **deployed** rules.

| Right | UI matrix (`permissions.ts`) | Undeployed `firestore.rules` | Deployed in production |
|---|---|---|---|
| 1 View patients | `canViewPatients` (intern ❌ list; intern ✅ `canViewOwnRegisteredPatients` unused by the list page; storekeeper ❌; clinic_admin ✅) | `allow read` on `patients` requires `canReadPatients()` (intern **included** for duplicate detection) | **Not deployed** (Stage C) |
| 2 Enter results | `canEnterResults` | `orderResultsTouched()` requires `canEnterResults()` | **Not deployed** |
| 3 Modify data/results | Pre-release: same as enter, except `canModifyOthersUnreleasedResult` (manager/supervisor/owner) is a **UI** predicate; intern registration update is not time-boxed in rules | Enter and pre-release modify share the result-value write restriction; amend shares `canApproveResults()` | **Not deployed** |
| 4 Release | `canApproveResults` | approval/amendment fields require `canApproveResults()` | **Not deployed** |

**Honest count today (working-tree rules, not live):** of the four separately controlled rights, **release is enforced in rules** (approval fields). Patient **read** is gated by capability (with intern extra-read). Result-value **write** is gated by `canEnterResults()`. Right 3 is **not** separately controlled from enter (pre-release) or from release (amendment). Three of the four remain UI-only **in production** because rules are not deployed.

**Rule changes that close each remaining gap:**

1. **View.** Keep per-collection `patients` read on `canReadPatients()`. Close intern over-read: intern may `get`/`list` only documents they created, or the collection read stays as today **only** for duplicate detection via a server callable. Intended: intern read+edit of **own** patients for 8 hours (§13.5).
2. **Enter.** Keep `orderResultsTouched()` → `canEnterResults()`. Already in the undeployed file.
3. **Modify.** Add a distinct modify-after-entry policy if enter and correct must split (another person’s unreleased result → `canModifyOthersUnreleasedResult`). Amendment already shares release.
4. **Release.** Keep approval-field restriction. Close the offline hole with a **server** release route (§8.4).

### 4.3 Capability matrix (authoritative predicates: `app/lib/permissions.ts`)

Columns: **Own** owner · **Adm** clinic_admin · **Mgr** lab_manager · **Sup** lab_supervisor · **Tech** technician · **Asst** technician_assistant · **Int** intern · **Str** storekeeper

| Capability | Own | Adm | Mgr | Sup | Tech | Asst | Int | Str | Status |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|---|
| Create / see all clinics | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | built |
| Manage staff / join code / clinic profile | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | built |
| Register patients | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | built |
| View patient list | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌* | ❌ | *intern: specified 8-hour own list, **not built** as the list page (`canViewPatients` false; `/patients` redirects intern to `/register`) |
| Order tests | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | built |
| Enter results | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | built |
| Approve / release / send back / amend | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | built |
| Self-release override | ✅* | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | **built** on `/orders/[id]`: always available to an approver, reason code + `selfReleased: true`. Owner acting in a clinic uses the same path. No “on duty at 03:40” test (audit 2.7). |
| Record critical-result notification | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | **built** (order page + `criticalResults.ts`) |
| Enter referral result / dispatch | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | **specified, not built** |
| Read audit log | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | built (`/owner/clinics/[id]/audit`; rules: owner or `canManageStaff`) |
| Edit catalogue | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | built |
| Dashboard | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | built |
| Export reports | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | built (server email; supervisor cannot export by design) |
| Import clinical data | ✅ | ❌ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | **built** (`canImportData` = owner + lab_manager) |
| Import staff pre-approvals | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **built** |
| Soft-delete patients | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | **partial:** audit 2.12 intended to **remove** Adm; code and undeployed rules still grant `clinic_admin` |
| Record stock in/out | ✅ | ❌ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ | built |
| View stock | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ❌ | ✅ | built |
| Reject specimen | ✅ | ❌ | ✅ | ✅ | ✅ | ✅ | ❌ | ❌ | **built** |
| Cancel order | ✅ | ❌ | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | **built** (same set as order tests) |
| Execute erasure | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | ❌ | **partial:** owner-only capability exists; full erasure runbook **not built** |

**Audit 2.12 — resolution retained as the spec, with a code delta.** Principle: the person who runs the clinic is not the person who creates or destroys the clinical record. **`clinic_admin` does not register patients.** Clinical spreadsheet import has already moved to `lab_manager`. **Intended:** patient soft-delete also moves off `clinic_admin` (lab_manager; owner break-glass; optionally lab_supervisor as a clinical act). **Code today:** `canDeletePatient` still includes `clinic_admin`. Staff pre-approval import stays with admin.

**Audit 2.7 — shift.** Shift is a **static** attribute on `lab_supervisor` membership (`morning` \| `afternoon` \| `night`). It answers “which shift are they assigned to,” **not** “were they on duty at 03:40.” No roster is specified for v1. The self-release override **does not** test availability (uncomputable). It is always available to an approver, with a **reason code**, `selfReleased: true`, and a dashboard rate (**dashboard rate specified, not built**).

**Role presets (audit 3.10, specified, not built).** At clinic creation offer named presets: “solo/small lab” (manager + technicians); “with intern”; “with storekeeper”. Dashboard warning when fewer than two distinct approvers exist, or when >80% of releases are `selfReleased` (**not built**).

### 4.4 Separation of administration from laboratory

**REQ-4.4-01.** `clinic_admin` cannot approve results and cannot edit reference ranges. Those are laboratory judgements. Admin access to the patient **list** is for accountability, not clinical decision-making. (ISO 15189 technical competence for release — as a design alignment, not a certification claim.)

### 4.5 Onboarding (v0.2 §4, still in force)

Self-service clinic signup is deferred (no payments entity). Owner creates the clinic (name, address, TIN, business registration, responsible person), system generates a join code, owner assigns first `clinic_admin` by email. Staff: Google sign-in → pending → enter code → **confirm clinic name** → wait for approval → role assigned.

Join lookup is **not** a client query on `clinics`. See §12.1 (disclosure) and §12.2 (server redeem).

**Staff page (v0.2 §8, built in `StaffPanel` / clinic staff pages).** Pending approvals pinned at the top. Clinic-admin sees only their clinic. Owner groups by clinic on the owner console.

### 4.6 Owner protection

Assigning a clinic role to `owner` is rejected. `ProtectedRoute` allows owner through destination checks; capability predicates still apply if a page `require`s them (owner is included in those predicates). The staff dropdown never offers `owner`. Acting clinic is a banner + session stamp for audit accuracy, not a rules constraint (ADR-001 §6.3).

---

## 5. Orders, results, quality

### 5.1 Lifecycle (REQ-5.1-01)

Internal enums stay English. **Displayed** labels are next actions (audit 3.7). Test labels with actual staff before locking copy.

| Enum | Display | Colour | Icon (name) | Queue column | Terminal? |
|---|---|---|---|---|---|
| `pending` + no collection | Collect sample / Awaiting {specimen} | Neutral grey | vial | Pre-analytics | No |
| `pending` | Enter results | Blue | pencil | Bench | No |
| `results_entered` | Ready to release | Amber | clipboard | Review | No |
| `needs_correction` | Fix this | Red | return | Bench | No |
| `approved` | Done | Green | check | Released | **No** (audit 2.5) |
| `amended` | Corrected | Green + badge “vN” | check-plus | Released | **No** — repeatable, incrementing `version` |
| `rejected` | Cannot test | Red | block | NCE | Specimen/order path; reason code required |
| `cancelled` | Stopped | Neutral | dash | Closed | Order-level; reason code required |

**`approved` is not terminal.** Amendment writes a **new version**; the original is never overwritten. Every reprint shows version and the amendment chain (REQ-5.5-01). **Built** (`resultAmendment.ts`; `RELEASED_RESULT_STATUSES`; comments no longer call released results terminal). Print shows “AMENDED REPORT” and original-vs-current values; it does **not** yet print `version` as “vN” on every page.

**`rejected` / `cancelled` (audit 2.6).** Controlled reason codes. Both feed a rejection-rate indicator and a nonconforming-event record. **Built** on the order page: reject writes `nonconformingEvents/{orderId}_reject`; cancel requires a cancel code. Dashboard rejection-rate QI **specified, not built**.

Without this path, staff fabricate a result, leave `pending` forever (dropped from TAT), or delete the patient.

### 5.2 Turnaround and collection time

TAT = **latest specimen collection → approval**. Orders missing a collection time, or flagged disputed, are **excluded** from statistics, never counted as zero. **Built** (`datetime.ts` / `sampleCollection.ts`).

**Audit 2.15 (REQ-5.2-01).** The owner repair tool must **not clear** collection times. Keep the value, set `collectionTimeDisputed: true`, exclude from TAT on that flag, print the value with a note, log a data-quality event. **Specified, not built.** Code today still **deletes** fields (`COLLECTION_TIME_FIELDS_TO_DELETE` in `dataQuality.ts`; `/owner/clinics/[id]/data-quality`).

**Audit 3.11 (REQ-5.2-02).** Default **one collection time for the order**. An explicit “specimens collected at different times” toggle reveals per-specimen fields. Record which mode was used. **Specified, not built as that UX.** Code today is **per-specimen-first** (`sampleCollections` map). A patients-table checkbox is a quick action only when exactly one current single-specimen order can be identified. Multi-specimen orders must be opened.

### 5.3 Review

Dedicated review queue **built** (`/review`): oldest-first, stale >24 h, abnormal flag, no row-level approve. Approval happens on the order. Send-back uses a **reason code** (`SEND_BACK_CODES`), not a 10-character English essay (audit 3.3). `REVIEW_NOTES_MIN_LENGTH = 10` in `reviewQueue.ts` is **withdrawn** as a quality signal; the live path uses `justificationReady`.

### 5.4 Entry/release separation and self-release

**Analytic judgement, not field evidence (audit 1.4).** Research commentary (uncited in `lims-research.md` §5 item 5, per the audit) that “in a three-person lab, mandatory dual sign-off produces workarounds — the technologist signs both” is about **two people verifying the same result**. LabFlow’s control is **different person releases**. In a three-person lab (manager + two technicians) that is not a deadlock. The actual problem is the **single-approver shift** (manager or lone supervisor entered the result).

**REQ-5.4-01 (built).** When the releaser is the same person who entered: require a reason **code** (`sole_approver_on_duty` / `urgent_clinical_need` / `other`), set `selfReleased: true`. Always available to `lab_manager` and `lab_supervisor`. **Owner acting in a clinic uses the same path** (`isSelfRelease` is email-based; owner is not exempt). No “if another approver is on duty” test. Dashboard self-release rate **specified, not built**.

### 5.5 Amendment

Repeatable. Reason **code** + optional note (`AMENDMENT_CODES`). Second-approver confirm when the original releaser amends: **built**. Character-minimum free text is **withdrawn**.

If an amendment turns a value **critical**, follow §5.6 before the new version is treated as notified. **Specified; path not fully wired.**

Amendment is **blocked offline** (`amendmentBlockedOffline`). That is a product choice: do not amend the laboratory record without a live server confirmation.

### 5.6 Critical results (REQ-5.6-01)

Detection is **type-aware** (`parameterFlag` / `orderHasCriticalResults`): numeric `criticalLow`/`criticalHigh`; qualitative designated-critical answers. Print currently still calls the numeric-only `resultFlag` for H/L — **partial**.

**Do not block the patient on a successful read-back (audit 3.5).** Model **attempts**: timestamp, means, outcome (`no_answer` / `wrong_number` / `voicemail` analogue `could_not_reach` / `read_back_ok` / `informed_no_readback`). Allow release when ≥1 attempt is recorded; flag “critical — notification pending”; escalate after N minutes (`CRITICAL_NOTIFY_WINDOW_MINUTES` = 30) to a configured second contact; dashboard metric = time to **successful** notification.

**Built:** communication record on the order (`criticalNotification` object); PIN not required for this write. **Not built:** block/allow release based on ≥1 attempt; pending flag on the printed report; escalate; dashboard time-to-notify; second contact.

**Offline (audit 2.8):** the communication record is an §8.2 offline-permitted write (it records something that physically happened). Critical thresholds are part of the **mandatory offline cache** (catalogue documents). **Built** as ordinary queued writes.

### 5.7 Dashboard (v0.2 §5, built)

Visible to owner, clinic_admin, lab_manager, lab_supervisor. Windows: today / yesterday / this week (Monday–now). Metrics **built:** registered, ordered, by type, pending, awaiting review, sent back, awaiting sample, released, median TAT with exclusion copy, amendment count.

**Specified additions, not built:** self-release rate, notification time, unresolved sync rejections with age, single-approver warning, rejection rate.

---

## 6. Catalogue, result model, inventory

### 6.0 Result data model (audit 4.2, 3.4) — **built as types; ranges still mostly unstructured strings**

Define result types **first**. Flags and critical detection are type-aware. Do not run numeric H/L on a qualitative malaria film.

| Concept | Meaning | Status |
|---|---|---|
| **Test** | Orderable item (may be a panel). | built |
| **Parameter / analyte** | A result-bearing line (FBC has many). | built |
| **Panel** | One order line, many parameters. | built (e.g. FBC, UA) |
| **Result type** | `numeric` (value, unit, range, critical limits); `qualitative` (closed answer set; some answers abnormal/critical); `semi_quantitative` (ordered scale); `text`; `calculated` (reserved). | **built** (`resultModel.ts`) |
| **Unit** | Catalogue field; SI on the printed report (SLIPTA §9 as cited). | built as a string; SI not enforced |
| **Range dimensions** | Sex, age band, pregnancy, method. | **partial:** sex parsed from `M: …, F: …` in the range **string**. Age, pregnancy, method are **not** first-class fields |
| **Method** | Catalogue field, printed. | **specified, not built** |
| **Decimal / number format** | Per clinic; default `.` with grouping off on print. | **specified, not built** |

**Named rapid tests (not a single “RDT” row):** Malaria RDT (`MAL-RDT`), HIV Rapid Test, HBsAg, HCV, Pregnancy (urine hCG), Syphilis (VDRL/RPR), plus microscopy (`MAL-MICRO`). **Built** in `TEST_CATALOG`.

**Seed source** is marked `onNationalMenu` / `tiers` (primary / secondary / tertiary). **Exact national menu: not established** against a source document in this repo. The seed is a product catalogue, not a claim of ministerial adoption.

### 6.1 Two catalogue states (audit 2.16)

**Rule A — no catalogue at all (REQ-6.3-01).** Block ordering and results entry. Show a single blocking screen: seed or import a catalogue. Do not paper over with an in-memory fallback. **Built** on `/orders/new/[patientId]` (empty catalogue disables submit).

**Rule B — catalogue exists but some rows are unreviewed (REQ-6.3-02).** **Do not block.** Banner: count + link to review (**built** `CatalogReviewBanner`). One-click “confirm seeded range as-is” that records the confirmer: **specified, not built** (settings review exists; one-click confirm-as-is is not a single control). On **print**, caveat **only unconfirmed rows** (`UNREVIEWED_RANGE_CAVEAT`) — **built**. Suppress the banner at zero — **built**.

### 6.2 Order fields (audit 4.10)

| Field | Required | Status |
|---|---|---|
| Patient + Lab ID (denormalised) | yes | built |
| Tests[] `{ code, name, specimenType }` | yes | built |
| Requester name | yes at registration as `referringClinician` | **partial:** not a structured requester (facility, contact) on the **order** |
| Requester facility / contact | yes for SLIPTA §9 print | specified, not built |
| Clinical information | optional | **partial:** `reasonForVisit` on the **patient**, not the order |
| Consent given / basis / timestamp / by whom | yes | **partial:** `consentGiven: true` at registration; no basis/timestamp/actor |
| Catalogue method | printed | specified, not built |
| Patient location (ward / station) | print | specified, not built |

### 6.3 Inventory (v0.2 §6 — in force; **built** in `app/lib/inventory.ts`)

Three clinic-scoped collections. **Balance is calculated from the ledger, never stored, never typed.**

**Item master (`inventoryItems`):** name, category, associated test code, manufacturer, supplier, catalogue/product code, packing unit, units per pack, base unit, unit size, packs per carton, storage condition, department, minimum stock, active.

**Lot (`inventoryBatches`):** lot/batch number, expiry, manufacture date, supplier, location, acceptance (`accepted` / `untested` / `rejected`).

**Movements ledger (`inventoryMovements`):** type (receipt, issue, transfer, return, adjustment, disposal), quantity, **`occurredAt` (client-declared)** and **`recordedAt` (written as client ISO today — see §8.7)**, actor, supplier, delivery note, condition on arrival, issued-to, purpose, destination, reason, note.

**Stock issue attribution (DECIDED 20 Aug 2026, still in force):** person and purpose only. **Not** linked to individual test orders. Consumption per period ÷ tests performed is the usable approximation.

**FEFO (REQ-6.3-03).** When issuing, sort/recommend the lot that expires soonest (`fefoSort`). Do not hard-block another choice; record what was issued. Flags: expired (red), ≤30 days (amber), below minimum (amber).

**Specimen custody (`specimenMovements`)** is separate from inventory and **must not** set `sampleCollectedAt` (conflating them corrupts TAT).

**Deferred:** photo capture of reagent packaging (Firebase Storage).

### 6.4 Patient record field spec (audit 4.3)

| Field | Required | Notes |
|---|---|---|
| `name` | yes | Single string, letters only, ≥2 characters (`NAME_REGEX`). Not structured given/family. |
| `preferredName` | no | Same alphabet rules |
| `sex` | yes | Catalogue/UI values as built on `/register` |
| `dob` | yes | Date; not in the future. Age-if-unknown **not** a field |
| `phone` | yes | Country code + 6–10 local digits |
| `address` | yes | ≥2 characters; free text |
| `nationalId` | no | 4–30 letters/numbers |
| `nextOfKin` | no | |
| `referringClinician` | yes | Letters-only name (stand-in for requester) |
| `reasonForVisit` | no | |
| `consentGiven` | yes | Must be true to save |
| `labId` | system | Generated; unique **intent** per clinic |
| `clinicId` | system | |
| `createdAt` | system | Client ISO today |
| Location (ward/station) | print | **specified, not built** |

**Dedup key (built):** (normalised name + DOB) **or** exact phone. Confirm dialog; user may proceed. Fuzzy matching **not built**.

**Offline (REQ-8.2-01, specified, not built):** warn that checking is limited to **cached** patients; set `dedupPending: true`; server-side sweep on sync; candidates in Sync problems. Today: the same `getDocs` queries run; they see cache if persistence is on, with no flag and no sweep.

---

## 7. SLIPTA / ISO alignment (honest)

### 7.1 EQA figures (audit 1.6)

As **quoted by the audit** from `lims-research.md` §Q12 (file not in this repo; **needs source** to quote externally): pooled African EQA performance **71.25% (95% CI 63.1–79.4)**, with very high heterogeneity (**I² = 96.4%**) and evidence of publication bias — **read as a direction, not a benchmark.** West Africa **65.38%**, malaria testing **53.47%**, Egger **P = .002**, 17 studies, South Africa 1,915 of 4,509 labs — same caveat.

### 7.2 What software can and cannot deliver (audit 1.9)

v0.4 claimed a lab could “press one button and hand an assessor most of” SLIPTA §§1, 7, 9, 10. That contradicts its own gap table.

Arithmetic **as stated in the audit** (checklist not in this repo — **unverified** against the official form): 86 software-touchable points is **23%** of 375; **one star needs 206 (55%)**; §12 (57) + §3 (34) = **91 points** of essentially **non-software** work. **Software cannot deliver a star.** The laboratory must still earn on the order of **~42% of the remaining (non-software) sections** regardless of how complete LabFlow is. Do not sell “most of four sections.”

| SLIPTA section (audit’s grouping) | Honest software status | Unbuilt items (named) |
|---|---|---|
| §1 Document control | Not built | Controlled documents, versioning, review dates |
| §7 Supplier / inventory | Partial | Item/lot/movement **built**; supplier list as a register, incoming inspection records beyond `conditionOnArrival`, preparation/stability, consumption rate, storage-temperature monitoring, disposal records as a QI: **not built** |
| §9 LIS operations | Partial | Release workflow **built**; backup records, pre-implementation/upgrade verification, calculation/transfer checks, analyzer/HIS interface records, archived-result retention: **not built** |
| §10 Nonconforming events | Partial | Rejection **creates** an NCE document; register UI, CAPA close-out, complaints: **not built** |

### 7.3 Gap table (completed, audit 4.14)

| Gap | Status |
|---|---|
| Nonconforming event register (rejection forces a record) | **partial:** write on reject; no register screen |
| Sample rejection log / quality indicator | specified, not built (codes exist; no QI) |
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
- A session already open dies within the token lifetime unless a **device-level session** exists.
- Offline operation is available only to someone **already authenticated**.

This is the night-shift scenario §8 exists for.

**REQ-8.5-01 (partially built).** Device-level session + per-staff **4–6 digit PIN** (`pinIdentity.ts`, `pinSession.tsx`, `PinGate`). PIN re-entry for release, amendment, erasure, export, staff changes (`SENSITIVE_PIN_ACTIONS`). Idle lock default **5 minutes**. Acting staff UID from PIN identity on writes that use `useWriteIdentity()` (order page). Roster cached in `localStorage` so unlock can work after first online set.

**Not built:** encrypted-at-rest session beyond `sessionStorage` + PIN hash cache; **maximum offline lifetime**; forced Google re-auth **as a hard stop** after that lifetime (reconnect does `getIdToken(true)` in `ConnectionContext`, which is token refresh, not a PIN/device lifetime). PIN hashes live in Firestore `clinicPins` and in localStorage — treat as attribution, **not** authorisation. Firestore rules still trust `request.auth.uid` (the Google account), not the PIN identity.

### 8.2 Permitted offline (client queue)

Registration, ordering, results **entry**, sample collection, inventory movements, **critical-result communication attempts** (audit 2.8), specimen rejection (queued write).

**Not permitted as a completed laboratory record:** amendment (blocked in UI). Release is currently **allowed offline in the UI** (see §8.4 — this is a defect against REQ-8.4-01).

**Duplicate detection (REQ-8.2-01):** specified in §6.4; **not built**.

### 8.3 Sync problems (audit 3.13)

A rejected write is a **clinical** event. Show what, when, which patient, why. **Built** (`writeQueue.ts`, `ConnectionContext` Sync problems panel). Queue entries carry `actorUid` / `actorLabel`.

**Remedies (specified, not built):** transient → retry; permission/validation → re-enter with payload pre-filled; stale permissions → escalate to a named approver. **Today:** a single **Acknowledge** control, which **disposes** the rejection from this device’s log. Acknowledgement must not silently dispose an unresolved clinical miss: unresolved rejections appear on the manager dashboard with age (**not built**).

### 8.4 Release and print — enforcement (audit 2.1)

Firestore rules **cannot** see whether the client was offline. A queued write is indistinguishable from an online write on arrival. Therefore “must not release or print unsynced results offline” is **not enforceable** as a rule.

**Intended control (REQ-8.4-01, specified, not built):** release is a **server** operation. Route handler verifies order state (`results_entered`, capability, not rejected/cancelled), writes approval (and version 1), returns a **signed release token**. Print view refuses to render without a verifiable token. There is **no** `/api/orders/.../release` route today.

**Current code (delta — do not claim the intended control):** `/orders/[id]` writes `status: "approved"` from the client, including while offline (`needsFinalReprint: !isOnline`). Copy says the print will be marked provisional. The print page **blocks** if any released order on the patient has `metadata.hasPendingWrites` — it does **not** render a watermarked provisional report. `provisionalReport.ts` exists and is unit-tested; the print page does not call `isProvisionalPrint`. `reviewQueue.ts` still exports `OFFLINE_RELEASE_MESSAGE` (“Results can only be released when online”), which **contradicts** the order page.

**Until REQ-8.4-01 ships, §8.4 guards are advisory client-side.** Residual risk: a stale tab, a bug, or a crafted client can write approval fields (subject to role rules once deployed) and can bypass the print-block. Recorded in §16.

**Provisional report (audit 3.2, REQ-8.4-02, specified, not built in UI).** Distinguish: printing an **unreleased** result (forbidden) vs printing a **released, locally confirmed** result during an outage. SLIPTA §9 includes provisional reports (as cited by the audit). Headed and watermarked **PROVISIONAL — not yet confirmed to the laboratory record**; reconcile on sync and reprint final. That is the 03:00 deliverable. Constants live in `provisionalReport.ts`.

### 8.5 Conflict semantics (audit 1.3, 4.7)

**Today:** last-write-wins per field.

**Intended (REQ-8.5-02):** `currentVersion` (or equivalent) on the order; flush compares; concurrent modification → Sync problems with both versions. Two technicians entering results for the same order offline: **both payloads are shown**; a named approver chooses; the discarded version is retained on the order as a rejected draft. Not silent LWW.

### 8.6 Queue contract (audit 4.6, specified, not fully built)

| Topic | Intended | Today |
|---|---|---|
| Flush triggers | Reconnect, visibility, timer | Firestore SDK flush + `trackedWrites` watchers |
| Ordering | Per-document, author order | SDK order; not specified |
| Retry/backoff | Exponential on transient | SDK default |
| User-switch with pending writes | Do not flush user A’s queue as user B | `actorUid` stored; **not** a hard bind on flush |
| Sign-out | Keep queue; do not re-attribute | unspecified |
| TTL / quota / eviction | Document IndexedDB quota; never silently drop clinical writes | unspecified |
| Multi-tab | One flusher | `persistentMultipleTabManager` |
| Disappearance detection | Interval + read-back of server document | `hasPendingWrites` / rejected watch; no dedicated interval |
| Bind to authoring staff | PIN identity | Order page yes; register/inventory/patients often Google `user.uid` |

### 8.7 Time (audit 4.5, REQ-8.7-01)

Every clinical event: `occurredAt` (client, declared) and `recordedAt` (server, assigned on commit). Capture clock offset at sync; flag skew above a product threshold (default **5 minutes** until measured — **not established** as a clinical constant). Print `occurredAt`; audit both. Firestore `serverTimestamp()` on an offline write is **sync time**, not event time.

**Partial:** inventory and specimen movements have `occurredAt` + `recordedAt`, but `recordedAt` is `new Date().toISOString()` in the browser, not Admin SDK `FieldValue.serverTimestamp()`. Orders, results, collection, audit `at` are client ISO.

---

## 9. Referrals (specified, not built)

Dispatch record: destination laboratory, which **specimen id**, tests, time, transporter. Returning results enter as referral results (capability in §4.3). Unimplementable without specimen IDs (§13.3). `specimenIdentifier(labId, specimenType)` exists as a string helper; there is no referral workflow.

---

## 10. Reporting and export

### 10.1 Completeness vs lateness (audit 1.11)

v0.4 summarised completeness 80.3% and timeliness 74.6% as “roughly a quarter of reports were **late**.” If ~20% were **missing**, that is not lateness. **Those percentages are not restated as facts here** (needs source). When using directorate statistics, distinguish **late** from **missing**.

### 10.2 Traceability (audit 1.11, 3.12)

Emailing a file to the requester’s registered address makes exfiltration **attributable**, not prevented. The recipient can forward the file.

**REQ-10.2-01.** **In-browser download is the primary path**, logged (actor, range, row count, clinic). Email is optional (Resend). Current-period and historical use the **same** log.

**Delta:** `S7-EXPORT.md` and `/dashboard` implement **email-via-Resend** as the only path (`Email spreadsheet`). `RESEND_API_KEY` is not on production. Limits **built:** 90-day range, 8,000 rows, 5 exports/user/hour. Audit action `report.exported`.

---

## 11. Data protection

**Status line (audit 1.1):** Commencement of the 2025 Act is **not established**. Everything in §11.2 that v0.4 stated as operative law was drawn from **secondary commentary** (TechHive, Malagen, Data Protection Africa — as named by the audit) and is **unverified against the enacted text**. Replace any row with an Act section number when counsel provides one, or leave it `not established`.

**Do not quote Appendix A penalties externally.**

### 11.1 Instrument

v0.4 stated the Bill was passed by the National Assembly on **29 September 2025** and “treated by government as in force” from late 2025, while also stating exact assent and commencement were **not established**. A passed bill is not law until assent and commencement. “Treated as in force” is not a legal status in this document. **Needs counsel + needs source.**

Oversight commission: v0.4 itself said it was unknown which Commission exists. Do not specify “notify the Commission” as if the addressee were known.

### 11.2 Lawful processing (unverified)

| Topic | v0.4 claim | v0.5 |
|---|---|---|
| Lawful bases | Seven, including “research/archiving” | **not established.** GDPR-lineage statutes typically have **six** bases; research/archiving is often a special-category or compatible-purpose provision. Do not implement a seven-basis enum until counsel maps the enacted text. |
| 72-hour notification | stated | **not established** |
| Sensitive-data threshold | stated | **not established** (health records are treated as sensitive **as a product assumption**, not as a cited section) |
| Cross-border adequacy | stated | **not established** — counsel input to §16 q3 |
| Retention | must be configurable | **legal** requirement; period **needs counsel**. Technical audit-log delete is a different problem (§11.5) |

Consent checkbox at registration: **built** (`consentGiven: true`). That is not a complete lawful-basis model.

### 11.3 Soft-delete

Patient records are soft-deleted (flag + reason **code** + optional note on the entity). Hard `deleteDoc` is denied in undeployed rules. **Built** (`patientSoftDelete.ts`) with `PATIENT_DELETE_CODES` in the vocabulary; the API still accepts a formatted string.

### 11.4 Erasure vs audit log (audit 2.3)

v0.4’s “remove identifying fields, keep an audit row of the erasure” does **not** erase: (a) **pre-existing** audit rows; (b) free-text reasons that copy identifiers; (c) IndexedDB replicas; (d) Firestore backups/PITR; (e) **staff** as data subjects (actor email). Staff are data subjects too.

**Intended (partially built):**

- Store `targetId`; resolve a label **at read time** from the live entity (or a redacted placeholder if erased).
- Controlled **reason codes** on the log; optional prose on the **entity** (erasable).
- State in every erasure runbook: local replicas and backups are **out of reach** of a server-side field clear.
- Staff erasure is a separate, unanswered counsel question.

**Code today:** `auditTargetLabel(labId, recordType)` **does not store patient name** (audit 2.3 closed for **new** rows). Historical rows written before this change may still contain names. `auditLogs` remain create-only. IndexedDB and PITR are **not** addressed by any job.

### 11.5 Audit log — legal vs technical retention (audit 2.4)

**Legal:** produce records on request; keep no longer than needed (**retention period needs counsel** — §16).

**Technical today:** create-only; no update/delete including owner (`firestore.rules`).

**Intended archival (specified, not built):** after the retention period, export to signed cold storage; a **server job** is the only principal with delete rights on `auditLogs`; the export itself is logged.

**Action vocabulary (`AUDIT_ACTIONS`):** `patient.register`, `patient.softDelete`, `patient.restore`, `patient.correct`, `patient.erasure`, `order.create`, `order.sampleCollected`, `order.resultsEntered`, `order.approved`, `order.sentBack`, `order.amended`, `order.rejected`, `order.cancelled`, `order.selfReleased`, `order.criticalNotified`, `order.provisionalPrinted`, `staff.pinReset`, `staff.pinSet`, `catalogue.update`, `catalogue.seeded`, `catalogue.reviewed`, `staff.approve`, `staff.reject`, `staff.roleChange`, `clinic.create`, `clinic.update`, `joinCode.regenerate`, `joinCode.failedAttempt`, `import.run`, `legacyRecords.claim`, `dataQuality.clearCollectionTime`, `preApproval.create`, `preApproval.revoke`, `preApproval.consume`, `preApproval.lapse`, `report.exported`. Extend when referral dispatch and inventory-named actions are written as first-class audit actions (inventory currently uses generic writes).

### 11.6 Geography enum

Do not hard-code “seven health regions.” **Needs source.**

---

## 12. Security, join code, LIS operations

### 12.1 Join-code disclosure (audit 4.1) — restored unconditionally

**Historical (P4):** Firestore rules cannot inspect query filters. Join-by-code therefore required **any signed-in user to read `clinics`**, including name, address, TIN, and business registration of **every** clinic. That is an acknowledged breach of tenant isolation.

**Specified fix (ADR-001, coded):** `POST /api/join/redeem` and `POST /api/join/confirm` (Admin SDK). Client does not query `clinics` by `joinCode`. Rate limit: **five attempts per user per hour**; failures logged (`joinCode.failedAttempt`). Working-tree rules: clinic read = owner or member, **not** any signed-in user.

**Live:** those routes exist. **Rules are not deployed.** Until Stage C, the production database may still expose whatever the current Firebase ruleset allows (historically: open or blanket clinic read). Treat the disclosure as a **live risk until rules deploy and a playground pass exists**.

**Why `/api/health` gates rules (audit 2.2 + Q3R).** Join **depends on the Admin SDK**. If rules are tightened to deny client clinic listing **before** OIDC/WIF makes `/api/health` ok, **join breaks** (no client fallback that is safe). That ordering is not “identity theatre”; it is the join-break rationale. The audit’s concern remains: **rules-not-deployed on a live URL is a security exposure**. Both statements are true. Sequence: health green → deploy rules → still **no real patient names** until §12.4’s full conjunction. `/api/health` is an Admin SDK probe, **not** a claim that rules are deployed.

### 12.2 Rules posture

Client checks are interface convenience. **Undeployed** `firestore.rules` are the intended data-plane enforcement. Default deny on unspecified paths. Claims-first identity with `get()` fallback (ADR-001 §8.1).

Users may write their own `username`, `usernameUpdatedAt`, `activeClinicId`, and `pinSet`. Owner does not use `activeClinicId` in Firestore.

`RULES-TESTING.md` still says intern patient read stays Deny; **current `firestore.rules` include intern in `canReadPatients()`**. Treat the rules file as authoritative over that checklist paragraph.

### 12.3 Interns and duplicate detection

Interns: `canRegisterPatient` true, `canViewPatients` false, `canViewOwnRegisteredPatients` true. Duplicate detection **reads** `patients`. Undeployed rules **allow** that read (`canReadPatients`). The list UI still redirects intern away from `/patients`. Intern `update` on `patients` is allowed whenever `canRegisterPatient()` — **not** limited to own documents or 8 hours. That is broader than §13.5. Close it before onboarding interns.

### 12.4 Gate on real patient data (audit 2.2)

**REQ-12.4-01.** No real patient name enters any LabFlow environment until **all** of:

1. Firestore rules (and indexes) are **deployed** and playground-tested;
2. Cross-border / processor residency is **answered by counsel** (§16 q3);
3. A lawful basis and a **retention default** are set.

Deploying rules alone does **not** unblock real data. Q3R Stage C green is necessary, not sufficient. `/api/health` ok is a **precondition for deploying rules without breaking join**, not a substitute for (2) or (3).

### 12.5 LIS operations records (audit 4.9, specified, not built)

Backup policy and restore-test cadence; upgrade verification checklist; incident/downtime log with RCA; archival of results per retention. Add each to accreditation evidence only when they exist. Word “backup” must appear in the runbook, not only here. Listed in §7.3.

---

## 13. Identity, print, UX, training

### 13.1 Staff UI language (audit 3.6)

Do not justify staff-screen design with national adult literacy. Justify with **second-language English, time pressure, turnover**. **Do not close localisation** on first-language share. Re-open when comprehension data exists.

### 13.2 Printed report (REQ-13.2-01)

**Page header on every page:** patient name, Lab ID, collection date-time, “Page n of m”.  
**Once, large, on page 1:** Lab ID in an **ambiguity-free alphabet** (Crockford base32 or equivalent) **with a check digit**. Monospace **does not** disambiguate `0`/`O` (audit 1.11).

**Delta:** print CSS is A4 (`@page { size: A4 }`). Lab ID appears **once** in the patient-record grid with `font-mono`. There is **no** running header, **no** page n of m, **no** check digit, **no** large page-1 rendering.

**Patient-facing block (audit 3.6, specified, not built):** plain-language line per abnormal result; one “return to the clinic / no action needed”; non-textual normal/abnormal marker. This is where literacy evidence belongs.

**Mechanism (audit 4.11):** browser `window.print()`, **A4**. No printer: user still gets a print dialog / PDF via the browser. **Released, locally confirmed** reprints while offline: allowed once §8.4’s distinction exists; **unreleased** print remains forbidden. **Reprints are audited** (`order.provisionalPrinted` is in the vocabulary; **not wired** on the print page).

SLIPTA §9 print list (as cited): requester, method, location, sample type, SI units, interpretation space. Capture gaps: §6.2.

### 13.3 Lab ID and specimen ID (audit 4.4)

**Built today:** `LF-YYYYMMDD-` + 2-character **device** id (Crockford alphabet, no I/L/O/U) + 2-digit per-device daily counter (`generateLabId`). Two offline devices on the same day do not collide **if device ids differ**. **Not** clinic-prefixed. **No check digit.** Counter is two digits (`slice(-2)`): a device registering more than 99 patients in a calendar day **wraps**. Server-side uniqueness is not enforced.

**Intended (REQ-13.3-01):** clinic prefix + device/session prefix + monotonic counter **or** a ULID rendered in an ambiguity-free alphabet **+ check digit**. Uniqueness **per clinic**, including a server reject on collision. Specimen/accession ID distinct from patient Lab ID; linked to order, collection time, referral dispatch. Helper `specimenIdentifier(labId, specimenType)` is a string; not a stored accession document.

**Labels (audit 4.8, specified):** v1 = **handwritten Lab ID on the tube**, defined layout (Lab ID, specimen type, collection time). Optional QR later. Unfunded printer cost is a **documented deployment risk** (Ivorian CFIR / APHL as cited by the audit; files not in this repo).

### 13.4 No native app

See §1.2. Bench-as-workstation. **GSMA figures deleted.**

### 13.5 Intern corrective window (audit 3.8, specified, not built)

Intern may **read and edit patients they created within 8 hours** (one shift). Corrective edit writes `patient.correct` with `PATIENT_CORRECT_CODES`. Build this **before** onboarding interns into production. Today `internAllowedPath` includes `/register`, `/profile`, `/patients`, and print, but `ProtectedRoute` + `canViewPatients` sends intern back to `/register`. Rules over-allow intern update (§12.3).

### 13.6 Training and turnover (audit 4.16, specified, not built)

First-run guidance; demo clinic with synthetic data; handover checklist when a lab manager leaves. Offboarding remains §16.

### 13.7 Import (v0.2 §7 — in force; **built**)

`.xlsx` / `.csv`; column mapping; per-row validation; `clinicId` stamp; no silent overwrite. Staff import = **pre-approvals**, not accounts; 90-day lapse (`/api/cron/pre-approvals/lapse`; `CRON_SECRET` **not** live). Clinical importer role: owner + lab_manager. Staff pre-approvals: owner + clinic_admin.

---

## 14. Product name

v0.4 said “at least seven” other products use the name and then enumerated **six**; Sources added `laboratoryflow.com` (a different name). **Count: six named collisions in that draft, not seven.** This repo does **not** re-enumerate them (needs source to publish a list). Treat “LabFlow” as a collision-prone name for trademark search; do not claim uniqueness.

---

## 15. Build status (grounded 22 August 2026)

### 15.1 Built in this repository (not all production-verified)

Homepage, Google popup auth, PIN gate, protected routes, patient registration (consent, phone, name+DOB/phone duplicate prompt), patients list, soft-delete, print page, named-test catalogue seed with result types + review banner, orders, per-specimen collection, results entry (type-aware fields), review queue, self-release with reason codes, versioned amendments, reject/cancel + NCE write, critical-notification record, dashboard, inventory (items, batches, movements, specimens, FEFO sort), spreadsheet import / migration, staff + pre-approvals, owner console, clinic profile, join **API** (5/hour), audit log writer + owner/admin viewer (`targetId` + Lab ID label), write queue / sync panel, `firestore.rules` **file**, Route Handlers (`/api/health`, join, export, claims sync, pre-approval lapse).

### 15.2 Specified, not built (or only a library)

Server release token; watermarked provisional print; conflict UI with both versions; dual timestamps on clinical events (server `recordedAt`); collision-free Lab ID with clinic prefix + check digit; intern 8-hour own-edit; role presets + single-approver dashboard warning; collection-time **dispute** flag (code still **clears**); move soft-delete off `clinic_admin`; in-browser export download; sync remedies that do not dispose; max offline PIN lifetime; audit archival job; LIS backup/RCA records; referral workflow; SMS; EQA/MU/complaints/validation.

### 15.3 Result-ready SMS (audit 4.13)

**Roadmap**, not silence. Ethics constraints **as cited by the audit** from `lims-research.md` §Q8 (file not in this repo): opt-in; never the diagnosis in the SMS body; per-patient direct-vs-coded choice; consent in existing forms; documented reversal of a national programme that texted results to mothers. **Needs source** to implement; do not ship diagnosis-in-body SMS.

### 15.4 Cost (audit 4.15)

**Not estimated.** Unfunded operating cost (printing, SMS, Blaze, Vercel) is a documented LIS-abandonment risk in the audit’s research citations. **Who pays for consumables: the clinic** (product assumption).

Working assumptions (not a quoteable model): Spark free tier is 50,000 reads / 20,000 writes / 20,000 deletes per day (Firebase pricing page — **confirm at build time**). Rules `get()` on `users/{uid}` **doubles** many operations until claims replace it (ADR-001). A resync of a clinic’s patients+orders+catalogue is a burst of billed reads. Vercel Hobby/Pro function duration and body size cap export (already encoded as 90 days / 8,000 rows). **Firestore free-tier headroom for a live clinic: not established.**

### 15.5 Production

See `DEPLOY-2026-08-21.md`. Site `https://labflow-six.vercel.app`. `/api/health` 503; rules not deployed; Resend not configured; OIDC/WIF not bound; **no real patient names**. Rollback SHA recorded in that file.

---

## 16. Open questions

1. **Retention period** for clinical records and for audit logs — **needs counsel**. Oldest open item in this lineage (v0.2 §12).
2. **Is processing on Firestore (Google) and Vercel (and Resend) lawful** under the 2025 Act if commenced, including cross-border / adequacy / safeguards? **Needs counsel. Most serious compliance question.**
3. **Commencement and operative text** of the 2025 Act; lawful bases; notification addressee; penalties — **needs counsel + needs source**. Act section numbers: **not established**.
4. Storekeeper / patient data: matrix grants none. **Confirm** (v0.2 q4). Rules match: storekeeper cannot read patients.
5. Offboarding when a PIN-session model exists — PIN is attribution on a shared Google account; revoke means lock the Google account **and** delete `clinicPins` + local cache.
6. National primary-tier catalogue source document — **needs source**.
7. Current electricity reliability (2026) — **needs source**.
8. Health-region list — **needs source**.
9. Residual risk of advisory §8.4 until REQ-8.4-01 ships — **accepted until built**.
10. Staff display-label testing (§5.1) — **product**.
11. Founder call: keep `clinic_admin` on patient soft-delete (code today) or move it to lab_manager (this spec’s 2.12 resolution).
12. Clock-skew threshold for REQ-8.7-01 — product default 5 minutes until measured.

---

## 17. Next steps (specification order, not a command to deploy)

1. Counsel pack: commencement, residency, retention default, lawful basis.
2. Finish OIDC so `/api/health` is ok, **then** dry-run and deploy rules (Stage C) — still no real names until §12.4.
3. Do not treat Stage C as “go live with patients.”
4. Product: Top 5 in this document’s header — especially server release token vs honest advisory, and collection-time dispute vs delete.

### 17.1 Migration runbook (audit 4.12)

No real production patients yet (gate). When changing catalogue, collection-time model, claims, or rules on a **live Stage A clinic**:

1. Snapshot: record production git SHA and Vercel deployment id (see `DEPLOY-2026-08-21.md` rollback table).
2. Copy: run the change against a **production copy** (export or second Firebase project), not the live patient database.
3. Catalogue replacement: seed/import with `seededFrom` / codes; **do not** silently change meaning of existing order lines; unmatched codes stay visible as “definition unavailable” on print.
4. Remove in-memory catalogue fallback if any remains (none in current order form).
5. Per-specimen times: treat legacy `sampleCollectedAt` as `legacySingleCollection`; do not bulk-stamp.
6. Custom claims: backfill via `/api/auth/claims/sync`; force `getIdToken(true)` on pending/approval screens.
7. Rules deploy: only after `/api/health` ok; playground pass; keep Admin join routes live.
8. Rollback: promote the recorded Vercel deployment; revert rules in Firebase console to the previous ruleset. Rollback git SHA as of Q3R: `acecb8f8c31424735cc2266c7dd1f9e4df272270` (confirm before use — later production SHAs exist).

---

## Appendix A — Penalty schedule as it appeared in v0.4

**Unverified — do not quote externally.**

v0.4 stated criminal penalties (3 years / minimum D500,000; 5 years / minimum D1m or 5% of gross income; 10 years aggravated; 2 years concealment) from secondary commentary, **without Act section numbers**. “5% of gross income” did not state of whom or over what period. **This appendix exists so the audit trail is complete. It is not law.**

---

## Appendix B — High-risk requirements (audit 4.17)

Normative statements are numbered `REQ-x.y-nn`. High-risk paths need automated tests; several already have unit tests (`orderLifecycle`, `resultAmendment`, `reasonCodes`, `provisionalReport`, `pinIdentity`, `labId`, `resultModel`, `permissions`).

| ID | Statement | Acceptance |
|---|---|---|
| REQ-5.1-01 | Lifecycle includes `rejected` / `cancelled` with codes | Cannot release a rejected specimen as `approved` (`canReleaseStatus`) |
| REQ-5.2-01 | Disputed collection time is marked, not deleted | Repair tool leaves original timestamp + `collectionTimeDisputed` |
| REQ-5.4-01 | Self-release is coded + flagged, always available to approvers | Dashboard can count `selfReleased` |
| REQ-5.5-01 | Amendment is versioned and repeatable | Reprint shows chain and version |
| REQ-5.6-01 | Critical comms recordable offline; release after ≥1 attempt | Attempt survives refresh; pending flag if not `read_back_ok` |
| REQ-6.3-01 | Empty catalogue blocks order/entry | Seeded clinic can work; empty cannot |
| REQ-6.3-02 | Unreviewed catalogue does not block | Banner at N>0; print caveat on unconfirmed rows only |
| REQ-6.3-03 | FEFO recommend, not hard-block | Issue records actual lot |
| REQ-8.0-01 | Offline = queued writes, LWW, not category (c) | Docs/sales match |
| REQ-8.2-01 | Offline dedup warning + `dedupPending` | Sync panel shows candidates |
| REQ-8.4-01 | Server release + signed print token | Print without token fails; client cannot write `approved` |
| REQ-8.4-02 | Provisional report watermarked | Distinct from final; unreleased never prints |
| REQ-8.5-01 | Device session + PIN | Night shift without a new Google popup |
| REQ-8.5-02 | Conflict panel shows both versions | Two offline result entries do not silently drop one |
| REQ-8.7-01 | Dual timestamps | Print `occurredAt`; audit both; skew flagged |
| REQ-10.2-01 | Download primary, logged | Same audit as email |
| REQ-12.4-01 | Conjunction gate on real names | Checklist of three |
| REQ-13.2-01 | Header every page; large Lab ID page 1 | Multi-page print |
| REQ-13.3-01 | Collision-free Lab ID offline | Two devices, no clash; check digit |
| REQ-13.4-01 | No native staff app | Workstation argument only |
| REQ-13.5-01 | Intern own-patients 8 h | Cannot read others; can correct own |

---

## Appendix C — Sources that exist in this repository

| Document | Use |
|---|---|
| `docs/PRD.md` (v0.2) | Operational modules re-imported |
| `docs/LabFlow-PRD-v0.4.1.md` | Prior audit reconstruction (superseded) |
| `docs/ADR-001-trusted-server.md` | Trusted server, `get()` 10 and 20, batched-write aggregate, join |
| `RULES-TESTING.md` | Join disclosure history; playground (intern-read paragraph **stale**) |
| `firestore.rules` | Intended enforcement (**not deployed**) |
| `DEPLOY-2026-08-21.md` | Production / health / Stage C |
| `OFFLINE.md` | Persistence API, queue intent |
| `S7-EXPORT.md` | Export limits, email path |
| `RESEARCH-result-review.md` | Review UX peers |
| `AUDIT-2026-08-21.md` | Earlier codebase audit |
| `app/lib/permissions.ts` | Live matrix |
| `app/lib/auditTypes.ts` | Audit fields / actions |
| `app/lib/membership.ts` | Multi-clinic |
| `app/lib/resultModel.ts` | Result types |
| `app/lib/reasonCodes.ts` | Justification vocabulary |
| `app/lib/orderLifecycle.ts` | Statuses and display labels |
| `app/lib/pinIdentity.ts` | PIN session constants |

**Not in this repository:** `lims-research.md`, research-grounded PRD v0.3/v0.4 (Claude tree), `LabFlow-prompts-Q-21Aug2026.md` as a file, GSMA reports, 2025 Act text, World Bank 2018 PAD, official SLIPTA checklist.

**Sibling files (different lineage — not this spec):** `C:\Users\kanui\Desktop\LAB-FLOW\LabFlow-PRD-v0.3-Full-System.md` and `…v0.4-Full-System.md` (store/OCR/WhatsApp founder vision). `C:\Users\kanui\Documents\LabFlow-PRD-v0.2.md` matches repo v0.2.

---

## Appendix D — Adversarial audit map (22 August 2026)

Legend: **closed in v0.5** = the specification now states the Fix. **Open pending counsel/field data** = cannot close without a lawyer or a primary source. **Code gap** = specified here, not fully implemented (or implemented in contradiction).

### D.1 Audit items closed in v0.5 (specification)

Every ID in 1.1–1.11, 2.1–2.16, 3.1–3.13, 4.1–4.17, and the Top 5 is accepted. The following are **closed as document defects** (the PRD no longer makes the disallowed claim):

1.1 status line; Finding 3 reworded; penalties in Appendix A; no invented Act sections.  
1.2 §4.2 gap analysis; evidence-pack instruction deleted.  
1.3 taxonomy retains “with conflict handling”; LabFlow claim restated as queued writes / LWW; ISWE as vendor self-description; intended both-versions UI specified.  
1.4 analytic judgement; single-approver-shift trigger.  
1.5 both 10 and 20 limits; ADR batched-write aggregate note.  
1.6 EQA quoted with CI, I², bias; direction not benchmark.  
1.7 GSMA numbers deleted; no-native-app on bench-as-workstation.  
1.8 2017 power figure date-stamped; current not established.  
1.9 per-section honesty + star arithmetic.  
1.10 HIPAA does not apply; Act + processor terms → §16 q3.  
1.11 unsourced stats not restated; Lab ID alphabet; missing ≠ late; export attributable.  
2.1 intended server token; current residual risk stated.  
2.2 conjunction gate; `/api/health` rationale.  
2.3–2.4 erasable/archival design; staff as data subjects; IndexedDB/PITR named.  
2.5–2.7 lifecycle, override, matrix rows.  
2.8–2.16 offline comms, architecture wording, PIN constraint, dedup, import/delete, `activeClinicId`, print header, dispute-not-clear, two catalogue rules.  
3.1–3.13 PIN, provisional, reason codes, result types, attempts, literacy population, labels, intern window, banner, presets, collection default, download-primary, sync remedies.  
4.1–4.17 v0.2 modules restored; result/patient/Lab ID/time/queue/labels/ops/order fields/print/runbook/SMS/gaps/cost/training/REQs.

### D.2 Open pending counsel or field data

| ID | Why it stays open |
|---|---|
| 1.1 / 11 / 16.1–3 | Act commencement, section numbers, penalties, lawful bases, retention, notification addressee |
| 1.6 / 4.13 | `lims-research.md` and the EQA paper / SMS ethics source not on disk |
| 1.7 | GSMA year/page if device stats are ever restated |
| 1.8 | Current (2026) power figure |
| 1.9 | Official SLIPTA checklist point values (arithmetic taken from the audit) |
| 1.11 | DataReportal/FinScope/UNESCO/AFI/region-count/product-name list |
| 2.2 / 12.4 | Residency / processor lawfulness |
| 3.6 | Staff comprehension data before localisation |
| 3.7 | Staff testing of display labels |
| 4.15 | Measured reads/writes per clinic/day |
| 16.11 | Founder call on `clinic_admin` soft-delete |

### D.3 Code gaps still unbuilt (or built in contradiction)

Already true in code (do not re-specify as greenfield): inventory, join API + rate limit, dashboard, import, audit writer with `targetId`/Lab ID label, PIN gate, reason codes, result types + named RDTs, `rejected`/`cancelled` + NCE write, versioned amendment, self-release flag, critical-notification **record**, review queue, per-specimen collection, intern **capability** flags, `canImportData` moved to lab_manager, rules file gates patient read / result write / release (undeployed), write queue panel.

| Gap | Audit IDs | What code does instead |
|---|---|---|
| Server release token | 2.1, T1 | Client writes `approved`, including offline |
| Provisional print UI | 3.2 | Library exists; print **blocks** pending writes |
| Conflict both-versions | 1.3, 4.7 | Last-write-wins |
| Dual timestamps (server) | 4.5 | Inventory `recordedAt` is client ISO; orders have none |
| Lab ID check digit + clinic prefix + wrap | 4.4 | Device suffix + 2-digit counter |
| Collection dispute flag | 2.15 | Repair tool **deletes** times |
| Single-time default + toggle | 3.11 | Per-specimen-first |
| Intern 8-hour own list/edit | 3.8 | Predicate exists; page redirects; rules over-allow update |
| Soft-delete off clinic_admin | 2.12 | Adm still `canDeletePatient` |
| Download-primary export | 3.12 | Email only |
| Sync retry/re-enter/escalate; dashboard ageing | 3.13 | Acknowledge disposes |
| `dedupPending` + server sweep | 2.11 | Confirm dialog only |
| Print running header / page n of m / large Lab ID | 2.14, 4.11 | Mono Lab ID once in grid |
| Self-release / NCE / notify rates on dashboard | 2.7, 3.5, 5.7 | Counts not shown |
| Role presets | 3.10 | Eight roles, no preset |
| Max offline PIN lifetime | 2.10 | Idle 5 min only |
| PIN identity on every write | 3.1 | Order page yes; many pages use Google uid |
| Audit archival delete job | 2.4 | Create-only forever |
| Referral workflow | 4.10 / §9 | Helper string only |
| Method / location / structured requester / consent basis | 4.10 | Partial patient fields |
| Range dimensions age/pregnancy/method | 4.2 | Sex substring only |
| SMS | 4.13 | Unbuilt roadmap |
| LIS backup/RCA/EQA/MU/complaints/validation | 4.9, 4.14 | Unbuilt |
| Rules + claims in production | 1.2, 2.2 | File exists; Stage C stopped |

---

*End of PRD v0.5*
