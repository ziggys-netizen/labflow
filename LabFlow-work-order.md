# LabFlow — Standing Work Order

**From:** Isaac Kanu, founder and owner of this project
**To:** the coding agent working in this repository
**Updated:** 16 September 2026
**Status:** standing. Every instruction here is a direct command from me. It applies to every task, whether or not the prompt repeats it.

**Put this file in the repository root and reference it from `CLAUDE.md` or `.cursor/rules` so it is always in context.**

---

## How to work

**1. One item at a time. Stop and report.**
Complete a single numbered item, report what changed, and wait. Do not run ahead into the next because it looks small. Thirteen items were once built in a row without verification and it cost days to untangle.

**2. Never attempt `firebase login` or `gcloud auth login`.**
Five sessions have failed with attestation errors. If a task needs credentials you do not have, **stop and hand it back** with exactly what you need. Do not start a sixth.

**3. Never deploy anything.**
Not Firestore rules, not indexes, not functions. When a change requires deployment, print the complete file in chat for me to paste into a console, and say which console. I deploy; you write.

**4. Every new collection ships with its Firestore rules block in the same change.**
`clinicPins`, `nonconformingEvents` and the roster collections were each silently dead on arrival because the default-deny caught them.

**5. Tests and types stay green.**
`npx tsc --noEmit`, `npm test` and `npm run build` before you report anything done. If any is red, that is the report.

**6. If a test fails, the test is right until I say otherwise.**
Do not edit an assertion to make a suite go green. Report the conflict between the test and the code and stop. A suite whose assertions get adjusted to match the code stops meaning anything.

**7. Commit at each checkpoint.**
Working tree clean, pushed to `origin/main`. Do not leave finished work uncommitted overnight, and do not leave untracked files of unknown provenance in this repository.

**8. If you think a specification is wrong, say so before building it.**
You have caught real defects in specifications handed to you several times — a cross-tenant write hole, a missing analyte identity, an audience mismatch. That judgement is wanted. Push back in writing, then wait.

**9. Report what does not exist rather than inventing a field.**
If a specification assumes data the schema does not hold — turnaround targets, a stable analyte ID, an amendment date — say so and stop. A plausible field name that compiles and returns nothing is worse than a blocked task.

**10. No patient names in anything durable.**
Not in audit logs, not in reason fields, not in reports written to the repository, not in commit messages. Lab IDs and reason codes only. This is a legal requirement, not a style preference.

**11. Colour is never the only carrier of meaning.**
Around one man in twelve has red–green colour vision deficiency. Every state that uses colour also carries a word and a position. Run the greyscale check before reporting any interface work done.

**12. No real patient data enters the system** until rules are published, data residency is answered by counsel, and a retention default is set per clinic.

**13. An error handler that discards the original message is a bug**, whatever it returns. Log the caught error before mapping it. Classify on error types and anchored strings, never on a bare common word. A status code is an assertion — 503 means the service is unavailable. Do not say that when a configuration value is missing.

**14. A surface must never be able to stay in a loading state.**
Every asynchronous read that gates rendering resolves to data, empty, or a
named error the user can act on. A failed read shows what failed and offers
a retry. In a laboratory, an indefinite "Loading..." is worse than an error,
because staff wait instead of acting.

---

## Where things stand — end of 9 September 2026

**Gate B is closed.** `https://labflow-six.vercel.app/api/health` returns `{"ok":true}`. Vercel OIDC federates to Google with no service-account key. Join-by-code, staff pre-approvals, custom claims and Excel export are all live for the first time.

*What had been wrong for three weeks: the pool, provider, project number and principal string were all correct — there was simply no service account for the pool to impersonate. Everything downstream was built correctly and pointing at nothing.*

**Excel export is live in production** after `e5b5ad4` (Admin projectId pin and narrower credential errors) and `a3c89b4` (WIF ExternalAccountClient as authClient). Confirmed working.

**Still open on the export / Loading path (do not treat as closed):** the dashboard **Loading hang**, and the **ExportReports mount-time GET** — leave both for a later pass.

**Published and live in Firestore:** the approval gate · roster collections · the two cross-tenant patches (`staffUserUpdateOk`, `clinicPins` delete) · the **J1 role gates** — catalogue writes, order status transitions into approved/amended, soft-delete · **un-release blocked** (`leavingReleasedStatus`) · **audit entries bound to their author** (`actorUid == request.auth.uid`).

**The repo and the live ruleset agree.** `20a3eb3` closed a period where `main` held a weaker ruleset than production. Never let that recur — see rule 7.

**Built 2–9 September:** D1–D3, D6 design tokens, mobile layout, the two flag systems, specimen caps · E1–E3 patient list, icons, patient history with cumulative view · F footer and terms acceptance · G1–G3 expanding queue, dashboard colour, wordmark · H1–H5 operational states, currency, header, row controls, adult fixtures · I1 access audit · J1 role gates and follow-ups · K1 tinted grounds · `f99a8c5` H1 mapping, tiles and chips now share `operationalFromOrder` · Admin WIF export fixes above.

**Blocked on me, not you:** the signed-in browser pass · Green Aid population and the two-clinic isolation test · the pilot clinic's catalogue · counsel on data residency.

**Firestore region is `nam7` (United States).** Decision of 23 August: stay pending legal advice. Do not change hosting configuration. Tripwires are in the transfer assessment, §7.

---

## Recently closed (verified 16 September 2026)

This list exists because the numbered open items went unreviewed long enough that, when they were finally checked against the code on 16 September 2026, **every one of them turned out to be already built** — several of them days before this document's own "Updated" date at the time. Each line here carries its commit so the same mistake does not repeat: check the evidence before treating anything as still open, and move an item down here the day it ships.

- **E3R** — patient history remediation. All three defects were fixed together in `bec3ff8`, 8 September 2026: `page n of m` now counts real print sheets (`paginateByWeight`, `app/lib/patientHistory.ts`), a stable `analyteId` joins cumulative rows across test codes (`resultModel.ts`, `cumulativeJoinKey`), and the disclosure log names Lab IDs (`historyDisclosureDetail`). One loose end, not a defect: the same detail blob still carries a raw `orderIds` array alongside the Lab IDs.
- **I2 / I3** — the surface registry and role matrix. The four flagged rows were settled in `a8c2818`, 12 September 2026: `clinic_admin→Review` kept denied, `clinic_admin→Patient history` granted, `lab_supervisor→Catalogue` kept denied, `lab_supervisor→Recycle bin` granted restore-only (which required splitting `canRestorePatient` from `canDeletePatient`). The rules deployment that commit warned about is done — restore confirmed working by Isaac on 16 September 2026.
- **Clinical letters in the queue panel** — done since `14afd5c`, 8 September 2026, by separation rather than by a per-row mark. An order carrying an unreleased critical result is diverted out of "Awaiting review" into the Blocked tile with the word `CRITICAL` (`managerBoard.ts`), and the generic dashboard carries its own "Critical results awaiting communication" tile (`dashboardQueue.ts`). A critical result is therefore never hidden inside a plain count on either board.
- **D4** — per-test turnaround targets on the technician board. Already complete: `app/lib/technicianBoard.ts` (`computeTatClock`, `TechWorkItem.tatMinutes`, `attentionSubLabel`). Not part of this pass — found already built.
- **D5** — turnaround target on the manager board's in-progress bench. Built 15–16 September 2026: `app/lib/managerBoard.ts` (`inProgressTatClock`, `progressSubLabel`), commit `22399b6`.
- **Excel formula escaping at export** — `app/lib/reportWorkbook.ts` (`escapeForSpreadsheet`), tested in `app/lib/reportExport.test.ts`. Shipped `14270d2`, 8 September 2026 — already live before this document's prior "Updated" date.
- **Security headers** — `Referrer-Policy`, HSTS, `nosniff`, `Permissions-Policy`, and `frame-ancestors 'self'` (not `'none'` — `'self'` is required so Firebase Auth's same-origin iframe still loads; cross-origin framing is blocked either way). Shipped `5599aaa`, 8 September 2026. Confirmed live on `www.labflowgambia.com` by curl on 16 September 2026.
- **Content Security Policy** — shipped as `Content-Security-Policy-Report-Only` on 16 September 2026, commit `35a15e2`, directives derived from an audit of actual client traffic (Firestore, Auth, Storage; no third-party scripts, fonts, or analytics anywhere in the app). Violations post to `/api/csp-report` (server logs only). **Not fully closed — see item 1 below.**
- **Inventory adjustments into the audit log** — recording an adjustment now also writes an `inventory.adjustment` entry to `auditLogs` (direction, quantity, reason, department). Shipped `49d0618`, 16 September 2026.
- **Low-stock reorder alerting** — a minimum stock level existed but nothing acted on it. A nightly digest (`/api/cron/low-stock`, 07:00) now emails the lab manager, clinic administrator and storekeeper: the first fall to the minimum sends a message, every further fall sends another, and zero sends one final message that says OUT OF STOCK in words as well as in red. A delivery clearing the minimum closes the cycle. Alert state is stored only after the mail has actually left, so a send failure retries rather than being swallowed. An in-app banner carries the same warning live from the ledger. `app/lib/lowStock.ts`, `app/lib/lowStockServer.ts`, `app/lib/LowStockBanner.tsx`. Shipped `bad10f7`, 16 September 2026.
- **Minimum stock is required** — a reorder level of zero silently opted an item out of every early warning, so both ways an item reaches the store now refuse it: the item form and the spreadsheet import share one validator (`minimumStockError`, `app/lib/inventory.ts`). Items saved before this carry a visible "No reorder level set" warning on the items list rather than being given an invented number. Shipped 16 September 2026.

---

## Open items, in order

**1. Content Security Policy — enforce** — `Content-Security-Policy-Report-Only` has been live since 16 September 2026 (see above). Once a week has passed with no unexpected entries in the `/api/csp-report` server logs, fold its directives into the enforced `Content-Security-Policy` header in `next.config.ts` alongside the existing `frame-ancestors 'self'`.

---

## Backlog — after the pilot is running

Green Aid population and isolation tests · catalogue migration for existing clinics · structured reference intervals by sex and age band · corrective patient edit with before-and-after to the audit log · collision-safe offline Lab IDs · referral tracking · duplicate patient merge · staff offboarding · DHIS2 / IDSR aggregate export (**blocked**: dataset not established, do not guess one) · ISO 15189 clause 7.6 evidence pack · SLIPTA evidence pack · environmental monitoring, equipment register, document control, reagent lot verification, internal QC with Levey-Jennings, EQA records, complaints register.

---

## Things you must not do

- Attempt any login, or ask me to paste an authorization code
- Deploy rules, indexes or functions
- Enter, invent or import real patient data
- Change the Firestore region or hosting configuration
- Draft a legal conclusion and store it as a value
- Auto-delete any clinical record
- Edit a test assertion to make a suite pass
- Batch several items and report them together

---

## What I want in every report

What changed, which files, test and typecheck results, anything you disagreed with, and what you need from me next. If the answer to the last one is "a deployment" or "a login", say so plainly and stop.
