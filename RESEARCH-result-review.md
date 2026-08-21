# P9 — Research: result approval and review UX

**Date:** 21 August 2026  
**Branch:** `wip/inventory-and-migration`  
**Scope:** How established open-source LIMS present supervised result review and release, and what LabFlow should adopt for one lab manager and three shift supervisors, at tens of tests a day.  
**Method:** Public user documentation, product pages, release notes, and (where user docs are silent) public design specs or source. Application code was not changed.

**How this note treats evidence**

- **User documentation** (wikis, official manuals, product how-tos) is treated as shipped behaviour.
- **Design / FRS documents** that are not mirrored in the user how-to are labelled **design, not confirmed in the user manual**.
- **Source / GitHub implementation** is used only when public user docs do not answer the question, and is labelled as such.
- Screenshots are not used as evidence of behaviour that the surrounding text does not state.

---

## LabFlow context (for the recommendation only)

LabFlow already has a two-step clinical path on the order: technician submits (`results_entered`) → supervisor releases (`approved`) or sends back (`needs_correction`). Release is gated to `owner`, `lab_manager`, and `lab_supervisor`. The order stores `reviewedBy`, `reviewedAt`, `reviewedByUid`, `reviewedByRole`, `reviewedByShift`, and `reviewNotes`. There is no dedicated review queue page; review happens on `/orders/[orderId]`. There is no post-release amendment path, no out-of-range flag on the review screen, and no block on approving one’s own entry. This note does not propose code; it proposes the UX to build next.

---

## 1. OpenELIS Global

Closest peer for West African clinical laboratories. National-scale LIS used with OpenMRS/Bahmni and as a stand-alone system. User how-to cited below is DIGI Wiki **Part 13**, updated 25 October 2024. Later **design** work (February 2026) specifies a multi-level pipeline that Part 13 does not describe; those items are separated.

### Reviewer’s queue

Shipped how-to: after the technician enters results, a **biologist / validator** opens **Validation** (under Results). Results are shown **by laboratory unit**, listed in **laboratory number (accession) order**. Additional search modes:

- Search by Routine (select a lab unit → all results ready for validation in that unit)
- Search by Study
- Search by Order (accession number)
- Search by Test Date
- Search by Order Numbers / range of order numbers (load the next 99 records from a starting laboratory number)

This is a **worklist of pending results**, filtered first by **lab unit (section)**, not a per-analyte worksheet and not a per-patient chart. By-order mode is documented as the way to pull a single accession (useful for STAT). By-range is a **contiguous accession batch** (end-of-shift / day’s batch). By-date is all results matching that date.

A February 2026 design FRS also describes a role-filtered queue (“N awaiting your validation”) and search-before-load with lab-unit, date, analyzer, and entered-by filters. That richer queue is **design**, not in Part 13.

Sources: [Part 13: Results Validation](https://uwdigi.atlassian.net/wiki/spaces/oeg/pages/284196875); [Result Validation Page FRS v2.0](https://github.com/DIGI-UW/openelis-work/blob/main/designs/analyzer-integration/validation-page.md) (design).

### One-at-a-time or batched?

**Both, on the same page.** Each result row has Save (validate) and Retest (reject) checkboxes. Page-level actions:

- **Save All Normal** — validate every result on the page that is within the normal range
- **Save All Results** — validate every result on the page
- **Retest All Results** — reject every result on the page

The user still clicks **Save** (3.2.1.11 release notes later relabel the submit button **Validate** — [3.2.1.11](https://github.com/DIGI-UW/OpenELIS-Global-2/releases/tag/3.2.1.11)) at the bottom to commit. So approval is **row-wise or page-batch**, not “one click releases an analyzer run” as a first-class object.

Design FRS adds “Validate & Release Selected” with mixed-level copy. That is **design**.

### Out-of-range and critical values before approve

**Documented at entry and on the report; only weakly documented on the validation screen itself.**

- Results entry how-to: each row shows **Normal Range**; a **red flag** next to an order means a **non-conforming sample/event**, not necessarily an abnormal numeric result. [Part 12](https://uwdigi.atlassian.net/wiki/spaces/oeg/pages/278626329/PART+12+ENTERING+LAB+TEST+RESULTS)
- Product capabilities: “Results Entry — out-of-range values flagged for immediate attention”; “normal, reportable, and critical ranges enforced with clear visual indicators.” [Capabilities](https://openelis-global.org/features-and-functionality/)
- Bahmni’s OpenELIS integration docs (same engine): age/sex limits; out-of-range results “automatically marked as abnormal and displayed in red”; printed report flags **A = Above Normal, B = Below Normal**. [Advanced Lab Configuration](https://bahmni.atlassian.net/wiki/spaces/BAH/pages/107708437/Advanced+Lab+Configuration); [Validating lab tests](https://bahmni.atlassian.net/wiki/spaces/BAH/pages/1164050590/Validating+the+Lab+Test+s+Result+and+Printing+the+Lab+Report)
- Part 13’s **Save All Normal** implies the validation page can tell normal from not-normal. Part 13 does **not** document a critical/panic highlight, HH/LL chips, or a “review criticals first” filter on the validation table.

HH/LL critical presentation on the **patient report** is specified in a design doc, not in Part 13. [Patient report redesign](https://github.com/DIGI-UW/openelis-work/blob/main/designs/reports/patient-report-redesign.md) (design).

**Not documented publicly:** how critical values are called out *on the validator’s queue* (colour, sort, blocking approve). Do not infer that from screenshots.

### Send-back for correction; is a reason mandatory?

Reject is labelled **Retest**. Rejected results “return to the lab unit for re-testing or other verification.” Notes:

- Valid results: comments for patient/provider; those **appear on the patient report**.
- Invalid results: comments for the lab technician; those **do not appear on the patient report**. Past notes are shown in the last column.

Part 13 wording is “enter any comments” — it does **not** say the note is required. A design spec for electronic signatures requires a free-text `rejection_reason` when the supervisor signs a reject; the **shipped e-signature how-to** only says that Save/Validate prompts for password, and does not mention a mandatory reject reason. [Electronic Signatures](https://uwdigi.atlassian.net/wiki/spaces/oeg/pages/1242759175); [e-signature FRS](https://github.com/DIGI-UW/openelis-work/blob/main/designs/system/electronic-signature.md) (design).

**Not documented in Part 13:** toast/notification to the technician, or whether reject is per-analyte while siblings on the same accession stay validated.

### Second-level review or single step?

**Shipped default is a single validation step** (technician enters → validator accepts/rejects → accepted results appear on the patient report). Bahmni documents a site flag `validate all results` that can skip validation entirely. [Advanced Lab Configuration](https://bahmni.atlassian.net/wiki/spaces/BAH/pages/107708437/Advanced+Lab+Configuration)

A **draft** admin page lists “Two-person Validation / Require a second validator” as a configuration topic; that wiki page is marked DRAFT. [DRAFT: Admin — General Configuration](https://uwdigi.atlassian.net/wiki/spaces/oeg/pages/1188757510/DRAFT+Admin+General+Configuration+Site+Branding+Workflow+Settings)

The February 2026 FRS specifies **0–5 sequential validation levels**, per lab-unit overrides, and an “Abnormal Results Only” trigger that auto-releases in-range results. Part 13 and the 3.2.1.11 release notes do **not** document that pipeline as live user behaviour. Treat multi-level as **design unless a later how-to confirms it**.

Electronic signatures (optional, off by default, shipped in 3.2.1.5) add a password re-prompt on validation; they do not add a second human. The e-signature FRS restates that a user cannot validate their own authored results; the user how-to does not repeat that rule.

### What is captured at release?

Public how-tos do not publish the audit schema. What is documented:

- Validator is the logged-in user with validation permission (Bahmni: department HOD or authorised validator).
- When e-signatures are enabled, the signed action is recorded in the audit trail; meanings in the FRS are `AUTHORED` (entry) and `VALIDATED_AND_RELEASED` (validation). [Electronic Signatures](https://uwdigi.atlassian.net/wiki/spaces/oeg/pages/1242759175)
- Results entry rows include **Test Date** and **Analyzer**.
- Design FRS validation history: level, user id, timestamp, role, action (VALIDATE / RETEST / AUTO_VALIDATE), optional notes. **Design.**
- Capabilities page: “Comprehensive audit trails — every login, entry, and modification logged with user and timestamp.”

**Not documented in the user how-to:** whether method version is stored on the released result (Bahmni does document associating a **method** with a test in Administration).

### Amendment after release

**No public user how-to describes amending a result that has already been validated and printed.**

What *is* documented is change-during-entry: the result row has **Current Result** and **Notes**; the Accept checkbox is used when a result was changed and the technician wants the biologist to see a note. [Part 12](https://uwdigi.atlassian.net/wiki/spaces/oeg/pages/278626329/PART+12+ENTERING+LAB+TEST+RESULTS)

Bahmni (same engine): after **Validation Failed**, the technician re-enters; **notes become mandatory if the result is changed**; the result goes back to validation. That is pre-release correction, not a post-release amendment. [Validating lab tests](https://bahmni.atlassian.net/wiki/spaces/BAH/pages/1164050590/Validating+the+Lab+Test+s+Result+and+Printing+the+Lab+Report)

A design export schema lists result status values Preliminary / Final / **Corrected**. That is **design**, not a user procedure. [Custom data export FRS](https://github.com/DIGI-UW/openelis-work/blob/main/designs/reports/custom-data-export.md)

**Say so:** post-release amendment UX (corrected report banner, original retained, who was notified) is **not documented publicly** for OpenELIS Global.

---

## 2. SENAITE (Plone / Bika LIMS lineage)

Clinical-chemistry cousin is ISO/IEC 17025 more than ISO 15189, but the review UX is the most explicit of the four systems. SENAITE’s current quickstart and the Bika lineage manual describe the same states. Where they differ, both are cited.

### Reviewer’s queue

- After **Submit**, the sample is **To be verified**. There is a **To be Verified** sample list of analysis requests whose results are all submitted.
- **Blind verify from that list is forbidden:** “Bika does not allow blind verification of results from Sample lists, and no [Verify] button on the lists. The Verifier has to see the results on the Sample.” [Verifying Results](https://www.bikalims.org/new-manual/workflow/verifying-results)
- **Preferred practice:** verify on a **Worksheet**, where the same session’s QC, duplicates, and peer results are visible. The worksheet can be verified as a whole or analysis-by-analysis. [Results Verification. Retesting](https://www.bikalims.org/new-manual/worksheets/results-verification-retesting)
- Official SENAITE quickstart: open the **sample** and click **Verify**. [Quickstart](https://www.senaite.com/docs/quickstart/)

So the queue is **samples (and worksheets) awaiting verification**, not a flat analyte list and not a patient chart. Verification is **per analysis**, rolling up to the sample when the last child analysis is verified (“a Sample's status is always equal to the lowest status among all the individual child analyses”).

### One-at-a-time or batched?

- On the sample: select analyses, then **Verify** or **Retract**.
- On the worksheet: **verify the worksheet as a whole** or individually. That is the batch analogue of an analyzer run / worklist.
- **Publish** (COA) is a later, separate batch action from verified-sample lists. Verification ≠ publication.

### Out-of-range and critical values before approve

Documented:

- **Save** (before Submit) runs server-side recalculations and **out-of-range checks**. [Quickstart](https://www.senaite.com/docs/quickstart/)
- **Specifications** define valid ranges and trigger out-of-range warnings. Custom comment for an out-of-range result is a core feature ([senaite.core #2369](https://github.com/senaite/senaite.core/blob/2.x/CHANGES.rst)).
- Worksheet verification shows QC out of range next to patient results. [Results Verification. Retesting](https://www.bikalims.org/new-manual/worksheets/results-verification-retesting)
- **Panic / critical** is **not in core user docs**. It is an add-on, [senaite.panic](https://senaitepanic.readthedocs.io/en/latest/quickstart.html): red alert icon beside the result; a notification panel prompting email to the client contact. That addon’s docs describe the icon and email prompt; they do not say verification is blocked until the email is sent.

### Send-back for correction; is a reason mandatory?

Three different transitions; do not collapse them:

| Action | When | Effect | Reason mandatory? |
| --- | --- | --- | --- |
| **Retract** | To be verified | Selected analyses return to **Received**; sample demotes from To be Verified | **Not stated** as mandatory in the verifying-results how-to |
| **Retest** (worksheet) | Similar to retract; retest can be submitted without re-saving | Earlier result kept for traceability, **never shown to the client** | Not stated |
| **Reject** (worksheet) | Removes the analysis from worksheet and sample | — | Not stated |
| **Invalidate** | Already **verified or published** | Sample → Invalid; clone for retest; email client and lab managers | Changelog: invalidation **form supports entering a reason** ([#2732](https://github.com/senaite/senaite.core/blob/2.x/CHANGES.rst)). The Bika how-to describes the email text but does not say the form field is required. |

A 21 CFR Part 11 gap analysis **proposed** a compulsory reason popup for retractions as something SENAITE did not yet enforce. [Part 11 GAP analysis](https://community.senaite.org/uploads/default/original/1X/a6e03781b654c28c7844b37e34443b98b00568da.pdf)

### Second-level review or single step?

- Default: **one verification** after submit, by Lab Manager or **Verifier** role. Analysts do not verify their own results unless that guard is disabled for small labs (alerts remain; activity stays in the log). [Verifying Results](https://www.bikalims.org/new-manual/workflow/verifying-results)
- **Number of required verifications** is set in Bika Setup → Analyses, and can be refined **per Analysis Service**. Community confirmation: two verifications is a configuration, not a second product. [SENAITE community: signatures](https://community.senaite.org/t/signature-policies-and-regulated-environments-including-validation/181)
- **Publish** is a second *role* (Publisher / Lab Manager), not a second scientific review. Clients with portal access can already see verified results before publication.

### What is captured at release?

Riding Bytes (SENAITE maintainers), July 2026:

- Every transition: acting user, **server** timestamp, transition, optional comment. Append-only from the UI.
- Snapshot audit log: actor, roles, `review_state`, timestamp, remote address, user agent, referer, comments, field-level diff. [SENAITE and lab compliance](https://ridingbytes.com/insights/senaite-compliance-iso-17025-and-part-11/)
- Instrument and method can be set on the worksheet/analysis (source and worksheet docs); the **user how-to does not list a “method version” field on Verify**.
- Report signature: tied to the SENAITE user who **published**; published PDF stored on the sample.
- SENAITE does **not** ship 21 CFR Part 11 electronic signatures (password re-prompt + meaning declaration). Workflow actor metadata is an audit trail, not an e-signature.

### Amendment after release

**Invalidate, do not overwrite.**

- Verified analyses “cannot be reversed unless the entire sample is invalidated.” [Quickstart](https://www.senaite.com/docs/quickstart/)
- Published results: only a **Lab Manager** can invalidate. [Compliance article](https://ridingbytes.com/insights/senaite-compliance-iso-17025-and-part-11/)
- Invalidate from the sample state menu (or in bulk from verified/published lists). Original stays **Invalid**, linked to a clone (`…-R01`) in **Received**. Email to client and lab managers. New COA should carry a footer that it **replaces previous certificates** — the how-to says the software currently distinguishes COAs mainly by verification/publication datetime, and the footer is something the lab should put on the template. [Invalidating erroneously published Results](https://www.bikalims.org/new-manual/workflow/invalidating-erroneously-published-results)

---

## 3. Bahmni / OpenMRS lab module

Two different products share this heading. **Bahmni’s laboratory module is OpenELIS**, synced to OpenMRS. **OpenMRS 3 (O3)** later shipped a separate frontend laboratory app that can review results inside OpenMRS without OpenELIS. They are not the same UX.

### 3a. Bahmni (OpenELIS)

#### Reviewer’s queue

Lab Dashboard: **Samples Collected — Today / Backlog**. The authorised user finds a row whose results are already entered and clicks **Validate**, which opens **Validation By Accession Number**. That screen lists **all tests on that accession** with their results. Referred-out tests are flagged **R**. [Validating the Lab Test(s) Result and Printing the Lab Report](https://bahmni.atlassian.net/wiki/spaces/BAH/pages/1164050590/Validating+the+Lab+Test+s+Result+and+Printing+the+Lab+Report); [Laboratory — Bahmni](https://www.bahmni.org/laboratory)

So Bahmni’s day-to-day queue is **patient/sample rows on a dashboard**, and the review itself is **per accession (order)**, not per analyte and not per analyzer batch.

#### One-at-a-time or batched?

On the accession validation screen: **Accept / Reject checkboxes per test**, then **Save**. Not documented as “validate the whole dashboard at once.” OpenELIS’s Save All Normal / Save All Results (Part 13) may still exist in the Bahmni-packaged OpenELIS; Bahmni’s own how-to does not mention those checkboxes.

#### Out-of-range and critical before approve

- Out-of-range marked abnormal and shown in **red** (age/sex limits). [Advanced Lab Configuration](https://bahmni.atlassian.net/wiki/spaces/BAH/pages/107708437/Advanced+Lab+Configuration)
- Printed report flags: **R** referred out, **A** above normal, **B** below normal, **E** returned. [Validating lab tests](https://bahmni.atlassian.net/wiki/spaces/BAH/pages/1164050590/Validating+the+Lab+Test+s+Result+and+Printing+the+Lab+Report)
- **Critical / panic call-out on the validation screen is not described** in that how-to.

#### Send-back; reason mandatory?

Reject → result returns to entry with legend **Validation Failed**. Technician re-enters. **Notes are mandatory if the result is changed.** The how-to does **not** say a reject reason is mandatory on the validator’s Accept/Reject save. [Validating lab tests](https://bahmni.atlassian.net/wiki/spaces/BAH/pages/1164050590/Validating+the+Lab+Test+s+Result+and+Printing+the+Lab+Report)

A later Bahmni story (v0.93) for **Type of Test Status** states: if a technician needs to edit a status, they should **reject the test and re-enter**; test status is not required on the validation page. [Types of test status](https://bahmni.atlassian.net/wiki/spaces/BAH/pages/2306539608/Types+of+test+status)

#### Second-level review?

Single OpenELIS validation step. Can be turned **off** site-wide (`validate all results = false`). No Bahmni how-to describes a second scientific reviewer. An “Approval Required” flag on Type of Test Status is explicitly **out of scope** for that story.

#### Captured at release?

Bahmni how-to: once accepted, results appear on the **Patient Dashboard — Laboratory Result widget**. Print includes demographics, order date, accession number, flags. Who validated, at what time, and which method, are **not listed** on that page. Methods can be associated with tests in OpenELIS Administration; whether they print on the Bahmni lab report is **not stated** there.

#### Amendment after release?

**Not documented.** The documented loop is reject → Validation Failed → re-enter with notes → validate again, which is still before the result is shown on the dashboard as accepted. How a result that has already synced to the EMR is corrected, and how the widget shows the old value, is **not documented publicly**.

### 3b. OpenMRS 3 laboratory app (not Bahmni)

User-facing documentation is thin: the README states only that `enableReviewingLabResultsBeforeApproval` (default **false**) submits results for review before they are approved and finalized. [README](https://github.com/openmrs/openmrs-esm-laboratory-app/blob/main/README.md); shipped in [v1.3.0](https://github.com/openmrs/openmrs-esm-laboratory-app/releases/tag/v1.3.0) (O3-5020).

The following is **public source**, not a user manual. It is included because the README does not answer the research questions.

- Laboratory home tabs include **Tests ordered**, **In progress**, **Pending review tests** (shown only when the config flag is on), **Completed**, **Declined tests**. [routes.json](https://github.com/openmrs/openmrs-esm-laboratory-app/blob/main/src/routes.json)
- Queue shape: **patient/order tables per status tab**, not analyte worklists.
- **Approve** is per order: a confirmation modal, then `fulfillerStatus` is set to `COMPLETED`. Copy: results “marked as complete and made available to clinicians.” [approval modal](https://github.com/openmrs/openmrs-esm-laboratory-app/blob/main/src/lab-tabs/modals/approval-lab-results-modal.component.tsx)
- **Reject** is a modal with a **fulfiller comment** textarea. The source does **not** mark that field required. [reject modal](https://github.com/openmrs/openmrs-esm-laboratory-app/blob/main/src/lab-tabs/modals/reject-lab-request-modal.component.tsx)
- **Amend lab results** exists as an action for orders in `COMPLETED` or `ON_HOLD`, opening an edit-results modal. How the amended value is labelled on the chart is **not documented**. [amend action](https://github.com/openmrs/openmrs-esm-laboratory-app/blob/main/src/lab-tabs/actions/amend-lab-results-action.component.tsx)

**Not in user docs (and not claimed here):** out-of-range highlighting, second-level review, method/instrument capture, mandatory reject reason.

Bahmni implementations that still run OpenELIS should follow §3a, not this O3 app.

---

## 4. GNU Health LIMS (Occhiolino)

Official user guide: [Laboratory — GNU Health HIS](https://docs.gnuhealth.org/his/userguide/modules/laboratory.html). Same content on [Wikibooks](https://en.wikibooks.org/wiki/GNU_Health/Laboratory_Management).

### Reviewer’s queue

**No validation queue is documented.** Laboratory staff work from:

- **Health → Laboratory → Lab Test Requests** (Draft vs Ordered; Create Test)
- **Health → Laboratory → Lab Test Results** (or Relate from the patient)

Each laboratory test is a **form** (Main Info, Extra Info, Validation tabs) holding all analytes for that test type. The closest thing to a queue is the **Lab Test Results** list, which is not described as “awaiting validation only.” A 2011 mailing-list note (pre-current wording) already complained that tests with and without values were hard to tell apart in that list; that is historical, not current UI spec.

This is **per lab-test document** (roughly per panel per patient), not a pending-results worklist, not a worksheet, not a batch.

### One-at-a-time or batched?

**One lab-test record at a time** in the form UI. Batch exists only as **file import** (`gnuhealth-data-import` CSV/ODS of `test_id`, analyte, result) into already-created lab tests — that is result capture, not a supervisor batch-approve. [Laboratory user guide, Interfaces](https://docs.gnuhealth.org/his/userguide/modules/laboratory.html)

### Out-of-range and critical before approve

Documented on the **form and the printout**, not as a queue badge:

- Each criterion has Lower/Upper limit. **Warn** “will automatically be set if the value is out of range. The physician can also set it regardless of the value.”
- Anomalous values are **printed in red**.
- HIS 5.0 changelog: “New visual aids for out-of-range results.” The changelog does not describe the visual. [Changelog 5.0.0](https://docs.gnuhealth.org/his/changelog.html)

**Critical / panic limits and a blocking approve step are not documented.**

### Send-back for correction; reason mandatory?

**Not documented.** There is no described “reject / retest / send back to technician” transition. The documented states on the *request* are Draft → Ordered (after Lab: Create Test). How a manager returns a filled test to a technician, and whether a reason is required, is **not in the user guide**.

### Second-level review or single step?

Documented fields imply **one managerial validation**: the form stores **the technician who made the test**, **the lab manager who validated it**, and **the date it was validated**. Changelog: when a disease is confirmed from a positive lab test, GNU Health “automatically includes the health condition in the patient medical history **upon the validation of the lab manager**.”

Optional **digital signature / digest** lives on the Validation tab via GNU Health crypto packages (`gnuhealth-crypto-lab`). That is integrity/non-repudiation, not a second human reviewer. [gnuhealth-crypto-lab](https://pypi.org/project/gnuhealth-crypto-lab/5.0.4/)

### What is captured at release?

User guide, Main Info tab:

- Order and its date
- Requesting health professional
- **Technician who made the test**
- **Lab manager who validated it**
- **Date when it was validated**
- Per analyte: value, text result, limits, units, remarks, warn, excluded
- Extra Info: summary and diagnosis
- Validation tab: **cryptographic digest hash** and record status; optional digital signature (crypto packages)

**Instrument and method version are not listed** on that form description.

### Amendment after release

**Not documented.** The user guide does not describe locking after validation, an amended-report banner, or a clone-and-retest flow. Do not infer editability of a validated record from the Tryton form pattern.

---

## Cross-system answers (short)

| Question | OpenELIS (shipped how-to) | SENAITE / Bika | Bahmni (OpenELIS) | OpenMRS O3 lab app | GNU Health |
| --- | --- | --- | --- | --- | --- |
| Queue shape | Pending results by **lab unit**, plus by order / range / date | **To be verified samples**; preferred: **worksheet** | Dashboard sample rows → **validation by accession** | **Pending review tests** tab (if enabled) | **No queue documented** — lab test form |
| Batch approve | Yes: Save All / Save All Normal / Retest All | Yes on **worksheet**; select-many on sample; Publish is separate | Per-test checkboxes on one accession | Per **order** modal (source) | No supervisor batch documented |
| Flags before approve | Normal range on entry; Save All Normal; red NCE flag; report A/B via Bahmni. Critical-on-queue **not in Part 13** | Out-of-range on Save; specs; QC on worksheet. Panic = **addon** | Red abnormal; print A/B. Critical-on-queue **not documented** | **Not in user docs** | Warn + print in red. Critical **not documented** |
| Send-back + reason | Retest; notes **encouraged**, not stated mandatory | Retract/Retest; reason **not stated** mandatory. Invalidate has a reason form | Reject → Validation Failed; notes **mandatory if result changed** | Reject comment field; requiredness **not documented** | **Not documented** |
| Second review | Single step shipped; multi-level is **design** | Configurable N verifications **per service**; Publish is a second *role* | Single step; can disable | Single approve-to-COMPLETED (source) | One lab-manager validation + optional crypto sign |
| Release metadata | Logged-in validator; optional e-sig; analyzer on entry row | Actor, server time, transition, snapshot diff; publisher on COA | Sync to EMR widget; validator identity **not listed** in how-to | `fulfillerStatus` COMPLETED (source) | Technician, lab manager, validation date, digest |
| Post-release amend | **Not documented** | **Invalidate + clone**; original kept Invalid | **Not documented** | Amend action on completed (source); display **not documented** | **Not documented** |

---

## Recommendation for LabFlow

Audience: **one lab manager + three shift supervisors**. Volume: **tens of tests a day**, not thousands. Clinical laboratory (ISO 15189 / SLIPTA), not an environmental 17025 factory. OpenELIS is the peer to copy at this scale; SENAITE is the peer for *what not to over-build yet*.

### Adopt

**1. A real review queue, then the order.**  
Do not make supervisors hunt `/orders` for `results_entered`. OpenELIS/Bahmni/O3 all give a **list of work waiting for a human**. For this lab, one page is enough:

- Default view: **Awaiting release** — each row is an **order** (patient name, lab ID, tests on the order, entered-by, entered-at, age of the sample, whether any value is out of range or critical).
- Secondary views, cheap to add because volume is small: **by accession/order id** (STAT / clinician at the window — OpenELIS “By Order”) and **today / this shift**.
- Click a row → the existing order review pane (values + Release / Send back). Do not invent a second results editor.

Skip per-analyte worklists and analyzer-run worksheets until the lab has connected instruments and QC charts. At tens of tests a day, **per order** matches how a shift supervisor actually signs (one patient, one report).

**2. Single scientific approval, two authorised roles.**  
Technician enters; **shift supervisor or lab manager** releases. That is OpenELIS’s shipped default and GNU Health’s documented pair (technician / lab manager). Do **not** ship 2–5 sequential validation levels (OpenELIS design FRS) or SENAITE’s per-service multi-verify. Those exist for national reference labs and 17025 factories.

Keep `clinic_admin` out of release (already a LabFlow product rule; it matches ISO 15189 6.2.3 — authorise people for review/release by competence, not by being the boss).

**3. Block self-release, with a recorded emergency override.**  
OpenELIS (e-sig FRS) and SENAITE (default) both refuse submitter = verifier. At three supervisors plus a manager, this is affordable. If a skeleton night shift must self-release, do what SENAITE does for small labs: allow it only as an explicit override that **stamps the record** (“released by author — emergency”), never silently.

**4. Surface out-of-range and critical *on the queue and on the order* before Release is clicked.**  
Copy Bahmni/OpenELIS: **H / L** (or A / B) against the catalogue reference range, colour the value, and pin **critical** rows to the top of the queue. Copy OpenELIS’s **Save All Normal** as **Release all in-range on this page** only after flags are trustworthy — otherwise supervisors will batch-approve blindly, which SENAITE explicitly forbids.

Critical is not just a colour. ISO 15189:2022 **7.4.1.3** requires notifying the user and recording date, time, who notified whom, what was said, and failures to contact. The review screen should offer **“critical notified”** (who, when) or block release of a critical value until that log exists. SENAITE’s panic email addon is heavier than this lab needs; a mandatory log line is enough.

**5. Send-back as a first-class state, reason mandatory.**  
Keep `needs_correction`. Copy Bahmni: technician sees **why** (OpenELIS “lab-only notes”). Make the reason **required** (LabFlow’s placeholder already says this; OpenELIS Part 13 does not actually require it — require it anyway). Do not require a reason on successful release.

**6. Capture at release (minimum set).**  
Who (uid + display name, not only email), when (server time), **role**, **shift**. That already exists on the order. Add **cannot be edited after release**. Do **not** wait on instrument and method version: the catalogue does not version methods today, and there is no analyzer interface. When methods exist, store **method name** on the released result (ISO 15189 7.4.1.6.f “where relevant”); versioning can wait for a controlled document module.

Print/report must be able to show **who authorised release** (7.4.1.6.j) or make it one click away.

**7. Amendment: new version, never overwrite.**  
Copy the *intent* of SENAITE invalidate and of ISO 15189:2022 **7.4.1.8**, not the clone-a-whole-sample machinery:

- Released results are locked.
- **Amend** creates a new result version: original retained and still visible, new value marked **Amended**, reason mandatory, who/when recorded, user (clinician) notified — even if notification is a printed “this report replaces report of \<datetime\>”.
- Do not silently `setDoc` over `results`.

O3’s “Amend lab results” action is the right *affordance* (completed orders can be opened again). SENAITE’s email-the-client-and-clone-the-sample is right for a COA portal; this lab prints to a patient/clinician — a replacement report with a clear banner is enough.

### Skip as over-engineered (for this lab, now)

| Pattern | Why skip |
| --- | --- |
| OpenELIS 0–5 level pipeline and “abnormal-only auto-release” | Tens of tests/day; auto-release is ISO 15189 **7.4.1.5** and needs validated rules, IQC hooks, and a kill switch. Do not auto-verify until those exist. |
| SENAITE worksheets + QC-on-the-same-grid as the verify UI | No instrument QC module yet. Supervisors will review against paper LJ charts. Revisit when analyzers land. |
| SENAITE Verify vs Publish split | In a clinic lab, verification **is** release to the clinician. A separate “Publisher” role is COA-factory overhead. |
| SENAITE invalidate+clone sample IDs | Right for client-visible COAs; clumsy for one paper report per patient. Use versioned results instead. |
| senaite.panic email templates | Build the critical **log** first; email later. |
| OpenELIS / GNU Health electronic signatures (password re-prompt, crypto digest) | ISO 15189 wants authorised identity and an audit trail, not 21 CFR Part 11. Named login + server timestamp is the first mile. Add password re-prompt when an assessor asks. |
| Per-analyte worklists and “next 99 accessions” | Volume does not justify it. By-order STAT search is the only extra mode worth copying. |
| Bahmni “disable validation entirely” | Do not offer a site switch that lets technicians release. If a test is auto-released later, that is a **documented rule**, not a hidden flag. |

### What must exist before an ISO 15189 assessment

The standard does not require OpenELIS-scale screens. It does require that the **laboratory** can show these things; the LIS should make them easy.

From ISO 15189:2022 (public restatements of 7.4.1.2, 7.4.1.3, 7.4.1.5, 7.4.1.6, 7.4.1.8, 6.2.3, 8.4):

1. **Named, authorised releasers** — a list of who may review and release, mapped to LabFlow roles. Shift supervisors on that list; clinic admin not.
2. **Review against IQC (and clinical/previous results as appropriate) before release** — even if IQC lives on paper, the SOP must say the supervisor looked at it. Software cannot skip this clause by existing. A checkbox “IQC acceptable for this run/day” is the smallest honest control; do not fake Westgard charts.
3. **Specified procedure: who releases, to whom** — the queue + print path is that procedure.
4. **Critical results:** limits defined; notification recorded (7.4.1.3). Failed contact has an escalation path (often phone, not software).
5. **Report content:** patient ID, collection date, issuing lab, examinations, results, units, reference intervals, identity of the person who authorised release (or readily available), critical indicated, amended clearly (7.4.1.6–7.4.1.8).
6. **Amendments:** reason recorded; original not obscured; user informed; new report uniquely identified and refers to the original (7.4.1.8). This is the usual assessor trap. Build it before the visit.
7. **Records of changes** — who changed what, when; original remains readable (8.4.2). Today’s merge-overwrite of `results` would fail this.
8. **No silent auto-release** unless 7.4.1.5 is fully implemented (criteria approved, validated, reviewable, suspendable). LabFlow should not auto-approve for assessment 1.
9. **LIS itself validated** for this workflow (7.11 / 7.6.3 in 2022 numbering as applied by accreditation bodies): a short OQ for “enter → queue → release / send-back → print → amend.” OpenELIS and SENAITE both say the vendor does not hand you a certificate; the lab does.

SLIPTA/ISO-relevant TAT in the LabFlow PRD (sample collected → approved) only becomes meaningful once supervisors actually release through this queue.

### Suggested build order

1. Dedicated **Awaiting release** queue (order-level) + self-release block + mandatory send-back reason (closes the current “review lives only on the order URL” gap).
2. **H/L/critical** flags on queue and order, using catalogue ranges; critical notification log.
3. **Lock + amend** with versioned results and an “Amended” print banner.
4. IQC acknowledgement and method name on the released record.
5. Only then: password re-prompt, auto-verify of in-range, worksheets, instruments.

---

## Sources

### OpenELIS Global

- [Part 13: Results Validation (Biological Validation)](https://uwdigi.atlassian.net/wiki/spaces/oeg/pages/284196875) — shipped how-to, 25 Oct 2024
- [Part 12: Entering Lab Test Results](https://uwdigi.atlassian.net/wiki/spaces/oeg/pages/278626329/PART+12+ENTERING+LAB+TEST+RESULTS)
- [Electronic Signatures](https://uwdigi.atlassian.net/wiki/spaces/oeg/pages/1242759175)
- [Capabilities — OpenELIS Global](https://openelis-global.org/features-and-functionality/)
- [OpenELIS-Global2 3.2.1.5](https://github.com/DIGI-UW/OpenELIS-Global-2/releases/tag/3.2.1.5) (electronic signatures)
- [OpenELIS-Global2 3.2.1.11](https://github.com/DIGI-UW/OpenELIS-Global-2/releases/tag/3.2.1.11) (Validate button label)
- [Result Validation Page FRS v2.0](https://github.com/DIGI-UW/openelis-work/blob/main/designs/analyzer-integration/validation-page.md) — **design**, 26 Feb 2026
- [Electronic signature FRS](https://github.com/DIGI-UW/openelis-work/blob/main/designs/system/electronic-signature.md) — **design**
- [DRAFT: Admin — General Configuration](https://uwdigi.atlassian.net/wiki/spaces/oeg/pages/1188757510/DRAFT+Admin+General+Configuration+Site+Branding+Workflow+Settings) — **draft**

### SENAITE / Bika

- [SENAITE Quickstart — Sample Workflow](https://www.senaite.com/docs/quickstart/)
- [Verifying Results (Bika manual)](https://www.bikalims.org/new-manual/workflow/verifying-results)
- [Results Verification. Retesting (worksheets)](https://www.bikalims.org/new-manual/worksheets/results-verification-retesting)
- [Invalidating erroneously published Results](https://www.bikalims.org/new-manual/workflow/invalidating-erroneously-published-results)
- [Results publication. COA](https://www.bikalims.org/new-manual/workflow/results-publication-coa)
- [SENAITE and lab compliance (Riding Bytes, 21 Jul 2026)](https://ridingbytes.com/insights/senaite-compliance-iso-17025-and-part-11/)
- [senaite.panic quickstart](https://senaitepanic.readthedocs.io/en/latest/quickstart.html)
- [senaite.core CHANGES (invalidate form, out-of-range comment)](https://github.com/senaite/senaite.core/blob/2.x/CHANGES.rst)
- [21 CFR Part 11 GAP analysis (community PDF)](https://community.senaite.org/uploads/default/original/1X/a6e03781b654c28c7844b37e34443b98b00568da.pdf)
- [Community: two verifications configurable](https://community.senaite.org/t/signature-policies-and-regulated-environments-including-validation/181)

### Bahmni / OpenMRS

- [Validating the Lab Test(s) Result and Printing the Lab Report](https://bahmni.atlassian.net/wiki/spaces/BAH/pages/1164050590/Validating+the+Lab+Test+s+Result+and+Printing+the+Lab+Report)
- [Laboratory — Bahmni](https://www.bahmni.org/laboratory)
- [Advanced Lab Configuration](https://bahmni.atlassian.net/wiki/spaces/BAH/pages/107708437/Advanced+Lab+Configuration)
- [Types of test status](https://bahmni.atlassian.net/wiki/spaces/BAH/pages/2306539608/Types+of+test+status)
- [openmrs-esm-laboratory-app README](https://github.com/openmrs/openmrs-esm-laboratory-app/blob/main/README.md)
- [v1.3.0 — O3-5020](https://github.com/openmrs/openmrs-esm-laboratory-app/releases/tag/v1.3.0)
- [PR 445](https://github.com/openmrs/openmrs-esm-laboratory-app/pull/445)
- Implementation (not user docs): [routes.json](https://github.com/openmrs/openmrs-esm-laboratory-app/blob/main/src/routes.json), [approval modal](https://github.com/openmrs/openmrs-esm-laboratory-app/blob/main/src/lab-tabs/modals/approval-lab-results-modal.component.tsx), [reject modal](https://github.com/openmrs/openmrs-esm-laboratory-app/blob/main/src/lab-tabs/modals/reject-lab-request-modal.component.tsx), [amend action](https://github.com/openmrs/openmrs-esm-laboratory-app/blob/main/src/lab-tabs/actions/amend-lab-results-action.component.tsx)

### GNU Health

- [Laboratory user guide](https://docs.gnuhealth.org/his/userguide/modules/laboratory.html)
- [GNU Health/Laboratory Management (Wikibooks)](https://en.wikibooks.org/wiki/GNU_Health/Laboratory_Management)
- [HIS changelog 5.0.0](https://docs.gnuhealth.org/his/changelog.html)
- [gnuhealth-lab on PyPI](https://pypi.org/project/gnuhealth-lab/)
- [gnuhealth-crypto-lab](https://pypi.org/project/gnuhealth-crypto-lab/5.0.4/)

### ISO 15189

- ISO 15189:2022 clauses 6.2.3, 7.4.1.2, 7.4.1.3, 7.4.1.5, 7.4.1.6, 7.4.1.8 as commonly restated; see also [SimplerQMS overview](https://simplerqms.com/iso-15189/) and [ALM 2021 post-analytical review](https://doi.org/10.1515/almed-2020-0110) (2012/2013 numbering; the 2022 text is 7.4.1.x).
