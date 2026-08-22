# Audit v0.4 → actions (22 August 2026)

Maps every adversarial-audit ID to: **applied in spec** / **deferred to product** / **needs counsel** / **needs source**.

Working spec: [`LabFlow-PRD-v0.4.1.md`](LabFlow-PRD-v0.4.1.md).  
v0.4 source file: **not in this repo** (see [`PRD-v0.4-AUDIT-RESPONSE-2026-08-22.md`](PRD-v0.4-AUDIT-RESPONSE-2026-08-22.md)).

**Legend**

| Label | Meaning |
|---|---|
| applied in spec | v0.4.1 text incorporates the Fix |
| deferred to product | Specified in v0.4.1 as **specified / not built**. No application code in this task |
| needs counsel | Cannot close without a lawyer / data-protection advice |
| needs source | Cannot close without a primary source that is not in this tree |
| code disagrees | Live `app/` or undeployed `firestore.rules` already differ from the audited PRD |

No PIN sessions, rejection lifecycle, result types, or release tokens were implemented. Rules were not deployed.

---

## Top 5 (priority list in v0.4.1 header — not built)

| ID | Disposition | Notes |
|---|---|---|
| T1 Offline story | applied in spec + deferred to product | Conflict semantics, PIN session, dual timestamps, server release token, provisional report: specified, not built. Offline restated as queued writes, not category (c). |
| T2 Legal triangle | applied in spec + needs counsel | Gate is conjunction. Audit log erasability specified, not built. Act commencement/penalties unverified. |
| T3 Result model + rejection | applied in spec + deferred to product | Result types, `rejected`/`cancelled`: specified, not built. Code has `approved`/`amended` versions and 20-char free-text reasons. |
| T4 Restore v0.3 modules + data model | applied in spec | Re-imported from v0.2 + code. Join-code disclosure restored. Patient/Lab ID/specimen ID specified. Research-grounded v0.3 file still missing. |
| T5 Evidence discipline | applied in spec + needs source | Method claim replaced. GSMA numbers deleted. EQA quoted only via audit→research chain. Power figure date-stamped. |

---

## 1. Unsupported claims

| ID | Disposition | Notes |
|---|---|---|
| 1.1 §11 commencement / penalties | applied in spec + needs counsel + needs source | Status line on §11. Finding 3 reworded. Penalties in Appendix A labelled **unverified — do not quote externally**. No Act section numbers invented. Commencement not established. |
| 1.2 SLIPTA four rights | applied in spec | §4.2 is a gap analysis. “Evidence pack” instruction deleted. **Code disagrees:** undeployed `firestore.rules` also gates patient read and result-value write. Still not four separately controlled rights; rules not live. |
| 1.3 Offline category (c) / ISWE | applied in spec | Claim restated: offline-capable client, queued writes, **no conflict resolution** (last-write-wins). ISWE LIMS added as vendor self-description (from audit’s citation of research §1.7; `lims-research.md` not in repo). Intended conflict UI: specified, not built. |
| 1.4 Dual sign-off “field evidence” | applied in spec | Relabelled analytic judgement. Problem restated as single-approver shift. |
| 1.5 Firestore `get()` 10 / 20 | applied in spec | Both limits + ADR-001 batched-write aggregate note restored in §3. |
| 1.6 EQA CI / I² / bias | applied in spec + needs source | Quoted with CI, I², publication bias **as the audit cites `lims-research.md` §Q12**. Original paper/file not in this repo. |
| 1.7 60% / 64% mobile | applied in spec + needs source | **Numbers deleted.** No-native-app decision rests on bench-as-workstation. No GSMA source in repo. |
| 1.8 2017 power figure | applied in spec + needs source | Date-stamped (Nov 2017 / 2018 PAD as v0.4 cited). **Current figure not established.** |
| 1.9 “Most of four sections” | applied in spec | Per-section honesty + SLIPTA arithmetic (software cannot deliver a star). Point values taken from the audit’s description of v0.4/research; checklist not in this repo. |
| 1.10 BAA / HIPAA vs §11 | applied in spec | HIPAA does not apply; 2025 Act sensitive-data/cross-border **if commenced** are relevant; processor terms feed counsel question. |
| 1.11 Citation hygiene | applied in spec + needs source | DataReportal/FinScope/UNESCO/region-count/name-count not restated as facts. Lab ID: ambiguity-free alphabet + check-digit specified. Lateness vs missing distinguished. Export “attributable”. |

---

## 2. Contradictions

| ID | Disposition | Notes |
|---|---|---|
| 2.1 §8.4 vs §12.1 release/print | applied in spec + deferred to product | **Intended:** server release + signed print token (**specified, not built**). Until then, §8.4 is **advisory client-side**. |
| 2.2 Patient-data gate / `/api/health` | applied in spec + needs counsel | Gate = rules **and** residency counsel **and** lawful basis/retention. `/api/health` before rules kept: join-code lookup is a server route; rules without a working Admin SDK break join. Audit concern and Q3R rationale both documented. |
| 2.3 Audit log vs erasure | applied in spec + deferred to product | Intended: `targetId` + resolved label; reason codes; replica/backup gap list. **Code disagrees:** `auditTargetLabel` still stores name + Lab ID; `auditLogs` create-only. |
| 2.4 Retention vs append-only log | applied in spec + deferred to product + needs counsel | Archival path specified, not built. Retention period still needs counsel. |
| 2.5 `approved` / `amended` terminal | applied in spec + deferred to product | Spec: `approved` not terminal; `amended` repeatable with `version`. **Code disagrees:** `resultAmendment.ts` already versions and allows re-amend; comment still says “Released results are terminal.” |
| 2.6 `rejected` / `cancelled` | applied in spec + deferred to product | Specified with reason codes and NCE feed. **Not in code.** |
| 2.7 Override wording / availability / matrix | applied in spec + deferred to product | Dropped uncomputable “on duty” test. Override always available with reason code + `selfReleased` + dashboard rate. Owner acting in clinic uses the same path. Missing capabilities added to matrix. Roster **not** specified as v1. **Code disagrees:** no self-release capability row; shift is a static membership attribute. |
| 2.8 Critical-result comms offline | applied in spec + deferred to product | Comms record is an §8.2 offline write. Thresholds in mandatory cache. Amendment-to-critical path specified. **Not built** (no critical-notification workflow in app). |
| 2.9 “Not built: centralised cloud-only” | applied in spec | Line deleted. Architecture is centralised cloud + client cache. |
| 2.10 Offline auth / PIN | applied in spec + deferred to product | Constraint stated. Device session + PIN **specified, not built.** |
| 2.11 Offline duplicate detection | applied in spec + deferred to product | Warn + `dedupPending` + server sweep specified, not built. **Code disagrees:** register queries `patients` (interns will fail this when rules deploy — intern cannot read patients). |
| 2.12 `clinic_admin` import vs register | applied in spec + deferred to product | **Resolution chosen:** keep “admin does not create clinical records”; move **import and patient soft-delete** to `lab_manager` (owner retains both). **Code disagrees — shipped today:** `canImportData` = owner + clinic_admin; `canDeletePatient` = owner + clinic_admin + lab_manager (+ lab_supervisor in `permissions.ts`, **not** in `firestore.rules`). Human can still reverse this call. |
| 2.13 `activeClinicId` vs one clinic | applied in spec | **Documented reality:** non-owners have `clinicRoles` + `activeClinicId`; owner acting clinic is session-only (`AuthContext`). Multi-clinic membership is built. |
| 2.14 Lab ID once vs every page | applied in spec + deferred to product | Header on every page; large read-back rendering on page 1 only. Print CSS not fully specified as built. |
| 2.15 Clear collection time | applied in spec + deferred to product | Spec: mark `collectionTimeDisputed`, do not clear. **Code disagrees:** `dataQuality.ts` still **deletes** collection fields (`COLLECTION_TIME_FIELDS_TO_DELETE`). |
| 2.16 Catalogue none vs unreviewed | applied in spec | Two explicit rules. Banner in code already counts unreviewed tests (`CatalogReviewBanner`). Print-row caveat specified, not fully verified. |

---

## 3. Usability

All of 3.1–3.13: **applied in spec** as design decisions and **deferred to product** unless noted.

| ID | Disposition | Notes |
|---|---|---|
| 3.1 Shared Google account / PIN | deferred to product | Same as 2.10. Load-bearing for audit trail. |
| 3.2 Provisional report | deferred to product | Distinguished from printing unreleased results. |
| 3.3 Reason codes not free text | deferred to product | **Code disagrees:** amendment still ≥20 characters free text. |
| 3.4 Result types | deferred to product | Catalogue today is numeric-parameter shaped (`testCatalog.ts`). |
| 3.5 Critical notification attempts | deferred to product | Release after ≥1 attempt; pending flag; escalate. |
| 3.6 Literacy → patient report | applied in spec + deferred to product | Staff justification = ESL + time pressure. Patient-facing block specified, not built. Localisation reopened; no comprehension data in repo. |
| 3.7 Next-action labels / colour | applied in spec + deferred to product | Display labels specified; **test with staff before locking**. |
| 3.8 Intern create then blind | applied in spec + deferred to product | Intern: read/edit **own** patients for 8 hours; corrective edit + audit. **Code disagrees:** `internAllowedPath` is `/register` + `/profile` only; `canViewPatients(intern)` is false. |
| 3.9 Banner blindness | applied in spec | Count + link already in `CatalogReviewBanner`. Confirm-as-is one-click and print-row-only caveat: specified, not fully built. |
| 3.10 Role presets | deferred to product | Two/three presets at clinic creation. Dashboard warning for single-approver clinics. |
| 3.11 Default one collection time | applied in spec + deferred to product | Default order-level time; toggle for per-specimen. **Code disagrees:** per-specimen is already the model (`sampleCollection.ts`). |
| 3.12 Export email vs download | applied in spec + deferred to product | Browser download primary, logged. Email optional. **Code disagrees:** `S7-EXPORT.md` is email-via-Resend; `RESEND_API_KEY` not on production. |
| 3.13 Sync rejection remedies | applied in spec + deferred to product | Retry / re-enter / escalate by type. Unresolved on manager dashboard. Write queue exists (`writeQueue.ts`) without those remedies. |

---

## 4. Missing specification

| ID | Disposition | Notes |
|---|---|---|
| 4.1 Dropped v0.3 modules | applied in spec | Re-imported from v0.2 + current `app/`. Join-code disclosure restored to §12 **unconditionally**. Research-grounded v0.3 file still absent — incorporation line states that. Inventory/join/import/dashboard **are built** in this repo. |
| 4.2 Result data model | applied in spec + deferred to product | §6.0 test / parameter / panel / type / unit / range dimensions. |
| 4.3 Patient field spec | applied in spec | Fields from `app/register/page.tsx` + v0.2. Dedup key: name+DOB **or** phone (as built). Fuzzy matching **not built**. Location field specified for print. |
| 4.4 Lab ID / specimen ID / offline | applied in spec + deferred to product | Intended: clinic prefix + ULID in Crockford base32 (or equivalent ambiguity-free alphabet) + check digit. Specimen ID specified. **Code disagrees:** `LF-YYYYMMDD-` + 4-digit random (`generateLabId`). Collision-prone offline. |
| 4.5 Dual timestamps | applied in spec + deferred to product | `occurredAt` (client) + `recordedAt` (server). Skew flag. **Not built** (client ISO strings). |
| 4.6 Sync queue contract | applied in spec + deferred to product | §8.6. Queue exists; identity-binding on user switch, quota, multi-tab, disappearance interval: specified, not complete. |
| 4.7 Conflict resolution | applied in spec + deferred to product | Version + both-versions in sync panel. Today: Firestore last-write-wins. |
| 4.8 Specimen labels | applied in spec + deferred to product | v1: handwritten Lab ID on the tube. Printing-cost risk recorded. No barcode mandated. |
| 4.9 Backup / LIS ops records | applied in spec + deferred to product | §12.5. Added to §7.3 gaps. Nothing built. |
| 4.10 Requester / method / location / consent | applied in spec + deferred to product | Consent checkbox **is built**. Requester exists as referring clinician. Method, patient location: specified. |
| 4.11 Print stack | applied in spec | Browser `window.print()`, A4 (`patients/[id]/print`). Offline reprint of locally confirmed released results: specified. Reprint audit: specified, not built. |
| 4.12 Live-clinic migration | applied in spec | §17.1 runbook. No production patient data yet (gate). |
| 4.13 Result SMS | applied in spec + deferred to product | Roadmap item with ethics constraints **as cited by the audit** from research §Q8 (file not in repo). Not on “deliberately not built” silence. |
| 4.14 EQA / MU / complaints / validation / rejection log | applied in spec | Gap table completed. None built. |
| 4.15 Cost and quota | applied in spec + needs source | No invented cost. Assumptions listed; **estimate not established**. Consumables payer: clinic (stated as product assumption). |
| 4.16 Training / turnover | applied in spec + deferred to product | §13.6 first-run, demo clinic, handover. |
| 4.17 Acceptance / REQ ids | applied in spec | High-risk statements numbered `REQ-*`. Not independently tested in this task. |

---

## Remaining human decisions

1. **Counsel:** 2025 Act commencement; lawful bases; retention; cross-border Firestore/Vercel/Resend; whether penalties exist as v0.4 claimed.
2. **Sources:** attach `lims-research.md` and GSMA/power/literacy/region-count primary pages, or keep those figures unmarked for external use.
3. **Product — `clinic_admin`:** v0.4.1 chooses *move import and soft-delete to lab_manager*. Reverse that if the founder wants admin to own onboarding data.
4. **Product — PIN / provisional print / server release token:** specified; scheduling is a build call.
5. **Staff label testing (3.7)** before locking display strings.
