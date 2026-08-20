# LabFlow — Product Requirements Document v0.2

**Status:** Current working specification
**Supersedes:** PRD v0.1 (obsolete — wrong stack, roles out of scope)
**Date:** 20 August 2026
**Owner:** Isaac Kanu
**Market:** The Gambia, West Africa (first deployments)

---

## 0. Why This Version Exists

PRD v0.1 was written for a five-milestone proof of concept: get a homepage live, get one form saving, get a list rendering. It explicitly placed authentication, user roles and compliance features **out of scope**, deferring them to "M5+, one at a time, each with its own mini-PRD."

Those mini-PRDs were never written. The build ran ahead of the document. LabFlow now has authentication, five roles, a 16-test catalogue, a results workflow with supervisor review, multi-tenancy, join codes and staff approval — none of which v0.1 describes.

v0.1 is also factually wrong about the stack: it specifies Create React App and Firebase Hosting. Neither is in use.

This document replaces it entirely.

**A note on method:** everything below is either (a) already built and verified, (b) a decision explicitly made by the founder, or (c) grounded in a cited external standard. Anything not yet decided is listed in Section 12 as an open question rather than invented. Nothing here is filler.

---

## 1. Product Summary

**LabFlow** is a multi-tenant clinical laboratory management platform for small and medium laboratories in West Africa, designed to align progressively with WHO/SLIPTA and ISO 15189 quality standards.

It replaces paper registers and disconnected spreadsheets with a single system covering patient registration, test ordering, results entry, supervised result release, inventory records and management reporting.

**Design constraints specific to this market:**

- Intermittent internet connectivity is normal, not exceptional
- Staff may be sharing a small number of devices
- Printed hard copy remains legally and practically important
- Cost sensitivity is high — the system must not assume expensive infrastructure

---

## 2. Technical Stack (Current, Verified)

| Layer | Technology |
|-------------------|------------------------------------------------------------|
| Framework | Next.js 16.3.0 (App Router, TypeScript, Turbopack) |
| Styling | Tailwind CSS |
| Database | Firebase Firestore |
| Authentication | Firebase Auth — Google sign-in (`signInWithPopup`) |
| Hosting | Vercel |
| Version control | GitHub — `github.com:ziggys-netizen/labflow.git`, branch `main` |
| Local path | `C:\Users\kanui\Documents\LF1` |
| Firebase project | `labflow-6cb9e` |
| Live URL | `https://labflow-six.vercel.app` |

**Known constraint:** the project is not on Firebase Hosting, so `signInWithRedirect` cannot be used — it requires `/__/firebase/init.json`, which 404s here. Sign-in must remain popup-based. This was tested and reverted once already; do not revisit.

---

## 3. Multi-Tenancy Model

### 3.1 Principle

Each clinic is a sealed tenant. No clinic can see, search for, or discover the existence of any other clinic. The only account that sees across tenants is the platform owner.

### 3.2 Roles

| Role | Scope | Assigned by |
|------------------|--------------------------------------|--------------------------|
| `owner` | Entire platform, all clinics | Nobody — single fixed account |
| `clinic_admin` | One clinic — administration | Owner |
| `lab_manager` | One clinic — laboratory | Clinic admin or owner |
| `technician` | One clinic — bench work | Clinic admin or owner |
| `storekeeper` | One clinic — inventory records | Clinic admin or owner |

### 3.3 Permissions Matrix

Columns: **Own** = owner · **Adm** = clinic_admin · **Lab** = lab_manager · **Tech** = technician · **Store** = storekeeper

| Capability | Own | Adm | Lab | Tech | Store |
|------------------------------------------------|:---:|:---:|:---:|:---:|:---:|
| Create clinics | ✅ | ❌ | ❌ | ❌ | ❌ |
| See all clinics | ✅ | ❌ | ❌ | ❌ | ❌ |
| Assign first clinic admin | ✅ | ❌ | ❌ | ❌ | ❌ |
| Approve / reject pending staff | ✅ | ✅ | ❌ | ❌ | ❌ |
| Assign roles within clinic | ✅ | ✅ | ❌ | ❌ | ❌ |
| View clinic join code | ✅ | ✅ | ❌ | ❌ | ❌ |
| Edit clinic profile (compliance fields) | ✅ | ✅ | ❌ | ❌ | ❌ |
| Register patients | ✅ | ❌ | ✅ | ✅ | ❌ |
| Order tests | ✅ | ❌ | ✅ | ✅ | ❌ |
| Enter results | ✅ | ❌ | ✅ | ✅ | ❌ |
| **Approve / release results** | ✅ | ❌ | ✅ | ❌ | ❌ |
| **Send results back for correction** | ✅ | ❌ | ✅ | ❌ | ❌ |
| Edit test catalogue (units, ranges, prices) | ✅ | ❌ | ✅ | ❌ | ❌ |
| Management dashboard & statistics | ✅ | ✅ | ✅ | ❌ | ❌ |
| Export reports to Excel | ✅ | ✅ | ✅ | ❌ | ❌ |
| Record stock in / out | ✅ | ❌ | ✅ | ❌ | ✅ |
| View stock balances | ✅ | ✅ | ✅ | ✅ | ✅ |
| View patient clinical data | ✅ | See 3.4 | ✅ | ✅ | ❌ |

### 3.4 Deliberate Separation of Administration from Laboratory

A founding principle, driven by clinical practice: **the person who runs the clinic is not the person who validates a result.**

`clinic_admin` therefore **cannot** approve results and **cannot** edit reference ranges. Those are laboratory judgements belonging to `lab_manager`. The clinic admin's access to patient records exists for accountability and audit, not for clinical decision-making.

This mirrors the ISO 15189 principle that technical competence, not administrative authority, governs result release.

### 3.5 Owner Protection

The owner account is structurally protected because it has been lost twice during testing:

- Assigning any clinic role to a user whose role is `owner` must be rejected with: *"The owner account cannot be assigned to a clinic"*
- `ProtectedRoute` allows `owner` through all checks regardless of `clinicId` or `status`
- The role dropdown on the staff page never offers `owner`
- Owner rows in any staff list are display-only

---

## 4. Onboarding & Access Flow

### 4.1 Clinic Onboarding (Owner-Led)

Self-service clinic registration is **deliberately deferred**. It requires payment processing (Stripe), a bank account and a registered legal entity — none of which exist yet. Until then the owner onboards each clinic personally.

1. Owner creates the clinic record with compliance fields
2. System generates a unique 7-character join code
3. Owner assigns the clinic's first `clinic_admin` by email address
4. Clinic admin distributes the join code to their staff

### 4.2 Staff Joining (Verified Working)

Google sign-in comes **first**, because it is the lowest-friction step and requires no prior setup:

1. Staff member signs in with Google → account created with `role: "pending"`, `clinicId: null`, `status: "pending"`
2. Redirected to `/join` — **no patient data is visible at any point**
3. Enters the 7-character join code
4. **System displays the clinic name for confirmation before committing** — *"You are joining Medic Aid. Is this correct?"*
5. On confirmation, `clinicId` is set, `status` remains `pending`
6. Redirected to a holding screen until approved
7. Clinic admin approves on `/staff` and assigns a role
8. Access opens

**Design decision — join code alone, no clinic ID:** requiring a clinic identifier *plus* a code was considered and rejected. The code already identifies the clinic uniquely; asking a new technician to type a database ID adds a second thing to obtain and a second thing to get wrong. The confirmation screen at step 4 delivers the same certainty with less friction.

Join codes can be regenerated by the owner if compromised.

---

## 5. Lab Manager Dashboard

### 5.1 Rationale

Research across established open-source laboratory systems (OpenELIS Global, Bahmni/OpenMRS, GNU Health LIMS) shows a consistent management layer: dashboards monitoring **turnaround times, workload and quality metrics in real time**. LabFlow adopts the same shape, scoped to what a small Gambian laboratory actually needs.

### 5.2 On-Screen Metrics

Visible to `lab_manager`, `clinic_admin` and `owner`. Scoped to the user's own clinic.

**Time windows:** Today · Yesterday · This week

Anything beyond the current week is available by export only (Section 5.3). This is deliberate — it keeps the dashboard fast and pushes long-range reporting into a traceable, archivable artefact.

**Metrics:**

| Metric | Definition |
|-----------------------------|--------------------------------------------|
| Patients registered | Count of new patient records in the period |
| Tests ordered | Total test line items ordered |
| Tests by type | Breakdown per test code (FBC, Malaria RDT, etc.) |
| **Pending tests** | Ordered, results not yet entered |
| Awaiting review | Results entered, not yet approved |
| Returned for correction | Sent back by the lab manager |
| Approved / released | Completed in the period |
| Turnaround time | Median hours from **sample collected** to result approved |

Pending tests is the operational priority — it is the queue that tells a manager what the laboratory owes its patients right now.

### 5.3 Excel Export (Traceable Reporting)

For any period beyond the current week:

1. Manager selects a start and end date
2. Selects report type (patients / orders / results / inventory)
3. System generates an `.xlsx` file
4. File is **emailed to the requesting manager's registered address**

Rationale, in the founder's words: the report must be capable of being printed as hard copy and being traceable. Emailing creates a timestamped record of who requested what and when, outside the application — which is exactly what an external auditor will ask for.

**Dependency:** email delivery requires a mail service (e.g. SendGrid, Resend, Firebase Extensions). None is currently configured. See Section 12.

---

### 5.4 Sample Collection Timestamp (New Requirement)

Turnaround time is measured **sample collected → result approved**. This is the SLIPTA/ISO-relevant measure: it captures the real delay a patient experiences, including any lag between a sample being taken and reaching the bench. Order-created timing was rejected because it flatters the laboratory by excluding pre-analytical delay.

This requires a field that does not currently exist.

**Requirements:**

| Aspect | Specification |
|-----------------------------|--------------------------------------------|
| Field | `sampleCollectedAt` (ISO timestamp) on the order record |
| Also capture | `sampleCollectedBy` (user email) — accountability |
| Where entered | On the order, at the point the sample is physically taken |
| Who enters | `technician`, `lab_manager`, `owner` |
| Default | Defaults to "now" with a single tap, editable for back-dating |
| Required? | Not blocking at order creation — an order can exist before a sample is drawn |
| Order status | An order with no `sampleCollectedAt` shows as **Awaiting sample** |

**Effect on existing data:** orders created before this field exists have no collection time. They must be excluded from turnaround statistics rather than counted as zero, which would silently flatter the average. The dashboard should state how many orders were excluded.

**Pre-analytical insight this unlocks:** with both `createdAt` and `sampleCollectedAt` recorded, the gap between them becomes visible on its own — often the largest and least examined delay in a small laboratory.

---

## 6. Storekeeper & Inventory Module

### 6.1 Rationale

The storekeeper's function, as defined by the founder, is **record keeping for accountability**: what came in, what went out, what remains. Not procurement authority, not clinical involvement.

ISO 15189 requires laboratories to keep complete records of reagents and consumables including **batch/lot numbers, receipt dates, acceptance testing, storage conditions, expiry dates and usage details**, and to maintain documented segregation between untested, accepted, expired and unacceptable materials. The fields below are chosen to satisfy that requirement.

### 6.2 Reagent Record — Fields

Each reagent/consumable item:

| Field | Notes |
|-----------------------------|--------------------------------------------|
| Item name | e.g. "Malaria RDT cassettes" |
| Associated test | Links to test catalogue code where applicable |
| Manufacturer | Required for ISO traceability |
| Supplier | Who it was purchased from |
| Catalogue / product code | Manufacturer's reference |
| **Lot / batch number** | ISO 15189 requirement |
| **Expiry date** | ISO 15189 requirement |
| Manufacture date | Where printed |
| Packaging form | Liquid / strips / cassettes / tubes / packets |
| Volume or unit size | e.g. 100 mL, or 25 strips |
| Units per box | Packaging hierarchy |
| Boxes per carton | Packaging hierarchy |
| Storage condition | Room temp / 2–8 °C / frozen / protect from light |
| Minimum stock threshold | Triggers a low-stock flag |

### 6.3 Stock Movements

**Stock In** — date received, quantity, lot number, expiry, supplier, received by, condition on arrival.

**Stock Out** — date issued, quantity, issued to (person or bench), purpose, issued by.

**Attribution — DECIDED 20 Aug 2026:** stock issues record **person and purpose only**. They are deliberately *not* linked to individual test orders.

Rationale: linking every reagent issue to a specific order would enable cost-per-test reporting, but requires the storekeeper to make that link on every single issue. In a busy clinic that discipline reliably collapses, and partial data is worse than none — it produces confident-looking cost figures built on a fraction of actual usage. Consumption per period, divided by tests performed in that period, gives a usable approximation without the burden.

*Revisit if and when cost-per-test becomes a real requirement, not before.*

**Balance** — calculated, never manually typed. Per lot and total per item.

### 6.4 Expiry Discipline

ISO 15189 requires laboratories to monitor expiry dates and practise stock rotation so older stock is used first. Bahmni implements this as **FEFO — first-expire-first-out**, which is the stricter and more appropriate rule for reagents, since receipt order and expiry order do not always match.

**LabFlow adopts FEFO.** When issuing stock, the system shows which lot expires soonest and recommends it. It does not hard-block another choice, but records what was actually issued.

**Expiry flags:** expired (red), expiring within 30 days (amber), below minimum stock (amber).

### 6.5 Deferred

**Photo capture of reagent packaging** — agreed as valuable (label, lot, expiry captured visually) but deferred until the manual entry version is proven. Requires Firebase Storage.

---

## 7. Bulk Import (Clinic Onboarding Accelerator)

Founder requirement: a "+" button on the owner/clinic page that accepts an uploaded spreadsheet, reads the columns, and populates the relevant records under that clinic automatically — so a clinic arriving with existing paper or Excel records can be onboarded quickly rather than re-typing everything.

**Scope — DECIDED 20 Aug 2026:** all record types are importable — **patients, test catalogue, inventory/reagents, and staff** — with staff handled differently (see 7.1).

**Requirements when built:**

- Accept `.xlsx` and `.csv`
- Show a column-mapping preview before writing anything
- Validate rows and report failures without aborting the whole import
- Stamp every imported record with the correct `clinicId`
- Never overwrite existing records silently
- Import is available to `owner` and `clinic_admin` only

### 7.1 Staff Import — Pre-Approvals, Not Accounts

Staff cannot be imported as live accounts. A user record is keyed to a Firebase UID that only exists once that person has signed in with Google, and creating accounts directly would bypass the join-code and approval chain in Section 4.2.

**Instead, a staff import creates pre-approval entries:**

| Aspect | Specification |
|-----------------------------|--------------------------------------------|
| Spreadsheet columns | Email address, intended role |
| Stored as | `preApprovals` collection, scoped to `clinicId` |
| On sign-in + join code | If the email matches a pre-approval, the user is auto-approved with the listed role |
| No match | Normal flow — held pending until an admin approves |
| Role validation | `owner` may never appear in an import; rows containing it are rejected |
| Expiry | Pre-approvals older than 90 days lapse and must be re-issued |

This preserves the audit trail — a pre-approval is a recorded administrative act with a named author and timestamp, the same as a manual approval.


---

## 8. Staff Management Page

### 8.1 Problem

The current `/staff` page is a flat list of Gmail addresses. At ten clinics with eight staff each, that is eighty undifferentiated rows.

### 8.2 Recommended Structure

**Single page, grouped by clinic, with pending approvals pinned to the top.**

```
┌─ PENDING APPROVAL (3) ────────────────────┐
│  fatou.jallow@gmail.com   Medic Aid       │
│  [Approve ▾ role]  [Reject]               │
└───────────────────────────────────────────┘

▾ Medic Aid                          6 staff
    Isaac Kanu          Clinic Admin
    Awa Ceesay          Lab Manager
    Modou Sanneh        Technician
    Binta Touray        Storekeeper

▸ Serrekunda Diagnostics             4 staff
```

**Why this over a click-through drill-down:** a pending staff member is blocked from working until approved. Burying approvals one level deep inside a clinic means a technician waits while an admin browses. Pinning them to the top guarantees the urgent action is always the first thing seen, while collapsible clinic groups still give the owner the organised view requested.

`clinic_admin` sees only their own clinic's group, expanded, with no other clinic visible.

---

## 9. Compliance & Regulatory Requirements (The Gambia)

### 9.1 Data Protection

**The Gambia Personal Data Protection and Privacy Act (2023/2025)** governs this system directly.

| Requirement | LabFlow implementation |
|-------------------------------------|--------------------------------------|
| Health records are **sensitive personal data requiring explicit consent** | Consent checkbox at registration — **mandatory, already built** |
| **Retention limits** — data deleted or anonymised once its purpose is fulfilled | Retention policy required; see below |
| Oversight by the **Information Commission** | Audit log must be exportable on request |

**Deletion policy:** patient records are **soft-deleted only**. No hard deletes. A deleted record is flagged and hidden from normal views but remains recoverable and auditable. This protects against both accidental loss and an audit finding that records were destroyed without trace.

### 9.2 Clinic Registration Fields

Gambian clinics operate under a Tax Identification Number from the Gambia Revenue Authority and a business registration certificate from the Registrar of Companies (Companies Act 2013; Single Window Business Registry Act 2013).

Clinic profile therefore captures: clinic name · physical address · TIN · business registration number · responsible person.

### 9.3 Laboratory Standards

Progressive alignment with **WHO/SLIPTA** and **ISO 15189**, implemented module by module rather than as a single compliance push. Currently reflected in: reference ranges on the test catalogue, the supervised result-release workflow, and the reagent record fields in Section 6.

---

## 10. Security — Outstanding Critical Gap

⚠️ **Clinic isolation is currently enforced in the browser only. Firestore security rules do not exist.**

Every query filters by `clinicId` in the application code. Someone with technical knowledge could query the database directly and retrieve any clinic's patient records, bypassing the interface entirely.

This is acceptable while the system runs on one laptop with test data. It is **not acceptable the day a real clinic enters a real patient's name**, particularly given that Gambian law classifies health records as sensitive personal data.

**Firestore security rules are a hard gate before any production use.** They must enforce, server-side:

- A user can read/write documents only where `clinicId` matches their own
- `owner` may read across clinics
- Only `lab_manager` and `owner` may write result approval fields
- Only `clinic_admin` and `owner` may write user role and status fields
- Pending users can read nothing but their own user document

---

## 11. Build Status

### Built and verified

- Homepage, Google authentication, protected routes
- Patient registration — validation, ~150 country codes, duplicate detection, consent checkbox, auto Lab ID (`LF-YYYYMMDD-XXXX`)
- Patients list
- 16-test catalogue with WHO/ISO-referenced reference ranges
- Test ordering with search
- Results entry with supervisor review workflow (pending → results_entered → approved / needs_correction)
- Clinic settings — editable units, ranges, prices, add new test
- **Multi-tenancy:** clinics collection, 7-character join codes, per-clinic test catalogue IDs (`{clinicId}_{code}`)
- **Join flow:** sign in → join → await approval → approved → access *(end-to-end tested)*
- **Staff approval page** with role assignment
- Owner console with clinic creation and one-time data migration
- Owner role protection

### Built, not yet verified

- Clinic data isolation between two populated clinics (only one clinic currently has data)

### Specified, not built

| Item | Section |
|----------------------------------------------------|:-------:|
| Firestore security rules | 10 |
| Lab manager dashboard | 5.2 |
| Sample collection timestamp (`sampleCollectedAt`) | 5.4 |
| Excel export + email delivery | 5.3 |
| Storekeeper inventory module | 6 |
| Bulk spreadsheet import (all record types) | 7 |
| Staff pre-approval import | 7.1 |
| Staff page grouping | 8 |
| Clinic profile editing by `clinic_admin` | 3.3 |
| Move result approval from `admin` to `lab_manager` | 3.3 |
| Soft-delete / recycle bin | 9.1 |
| Printing / report output (`window.print()`) | — |
| Full audit log, exportable | 9.1 |

### Deferred by decision

- Stripe subscriptions and clinic self-registration
- Photo/ID capture at registration
- Reagent photo capture
- Multi-language support
- Editing patient records after registration

---

## 12. Open Questions

These are genuinely undecided. They are recorded here rather than guessed at.

1. ~~**Bulk import scope**~~ — **DECIDED 20 Aug 2026:** all types. Staff import handled as pre-approvals, not accounts. See Section 7.1.
2. **Email service** — which provider for Excel report delivery? Affects cost and setup effort.
3. ~~**Turnaround time definition**~~ — **DECIDED 20 Aug 2026:** measured **sample collected → result approved**. See Section 5.4 for the required new field.
4. **Storekeeper and patient data** — the matrix in 3.3 gives storekeepers no patient access at all. Confirm this is correct.
5. ~~**Stock issue attribution**~~ — **DECIDED 20 Aug 2026:** person and purpose only, no order link. See Section 6.3.
6. ~~**Orphaned test data**~~ — **DECIDED 20 Aug 2026:** the six pre-multi-tenancy patient records are to be assigned to Medic Aid via the owner-page migration.
7. **Retention period** — Gambian law requires deletion or anonymisation once purpose is fulfilled, but does not state a fixed period for clinical records. A defensible retention period needs to be set, ideally with local legal input.

---

## 13. Immediate Next Steps

1. Commit current multi-tenancy work to GitHub
2. Create a second test clinic with its own data and verify isolation between the two
3. **Write and deploy Firestore security rules** — the blocking item before any real data
4. Phase 3 role migration: result approval → `lab_manager`; clinic profile → `clinic_admin`
5. Lab manager dashboard
6. Storekeeper inventory module

---

*End of PRD v0.2*
