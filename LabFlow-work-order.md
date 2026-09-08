# LabFlow — Standing Work Order

**From:** Isaac Kanu, founder and owner of this project
**To:** the coding agent working in this repository
**Updated:** 8 September 2026
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

---

## Where things stand — 8 September 2026

**Published and live:** interim Firestore rules with the approval gate · roster collections · the two cross-tenant patches (`staffUserUpdateOk`, `clinicPins` delete) · seven emulator rules tests guarding them.

**Written, not yet published:** the J1 role-gate ruleset — catalogue writes, order status transitions, soft-delete. **The release gate is still enforced only in the browser until this is pasted into the Console.**

**Built this week:** D1–D3 and D6 design tokens, mobile layout, the two flag systems, specimen caps · E1–E3 patient list, icons, patient history with cumulative view · F footer and terms acceptance · G1–G3 expanding queue, dashboard colour, wordmark · H1–H5 real operational states, currency, header, row controls, adult fixtures · I1 access audit · K1 tinted grounds.

**Blocked on me, not you:** publishing J1 · Vercel OIDC (Gate B) · the signed-in browser pass · Green Aid population and the two-clinic isolation test · the pilot clinic's catalogue · counsel on data residency.

**Firestore region is `nam7` (United States).** Decision of 23 August: stay pending legal advice. Do not change hosting configuration. Tripwires are in the transfer assessment, §7.

---

## Open items, in order

**1. E3R** — patient history remediation. Page `n of m` is currently a lie; cumulative rows split a trend across test codes; the disclosure log names Firestore document IDs rather than Lab IDs.

**2. J1 follow-ups** — a technician can un-release an approved result by setting status to `pending`; `auditLogs` does not bind an entry to its author.

**3. I2 / I3** — the surface registry and the role matrix, once I confirm the four rows I flagged.

**4. D4 / D5** — role dashboards. D4 needs `tatMinutes` on catalogue entries; no per-test turnaround targets exist yet.

**5. Clinical letters in the queue panel** — a manager scanning "6 awaiting review" should see which one carries a critical value.

**6. Excel formula escaping at export** — a cell beginning `=`, `+`, `-` or `@` executes on open, and exports are meant to reach the Ministry. Escape at export time only; never alter the stored value.

**7. Security headers** — `Referrer-Policy: no-referrer` first: following an external link from `/patients/{id}` currently sends that path in the `Referer` header. Then HSTS, `nosniff`, `frame-ancestors 'none'`, `Permissions-Policy`.

**8. Content Security Policy** — derived from observed traffic, shipped `Report-Only` for a week before enforcing. A wrong `connect-src` silently kills Firebase sign-in in production.

---

## Backlog — after the pilot is running

Green Aid population and isolation tests · catalogue migration for existing clinics · structured reference intervals by sex and age band · corrective patient edit with before-and-after to the audit log · collision-safe offline Lab IDs · referral tracking · duplicate patient merge · staff offboarding · inventory adjustments in the audit log · DHIS2 / IDSR aggregate export (**blocked**: dataset not established, do not guess one) · ISO 15189 clause 7.6 evidence pack · SLIPTA evidence pack · environmental monitoring, equipment register, document control, reagent lot verification, internal QC with Levey-Jennings, EQA records, complaints register.

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
