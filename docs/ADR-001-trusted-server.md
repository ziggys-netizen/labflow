# ADR-001 — Where LabFlow's trusted server code lives

**Date:** 21 August 2026
**Status:** Accepted
**Decided:** 21 August 2026
**Decision:** Founder approved **Option B** (Next.js Route Handlers on Vercel + OIDC/WIF, no service-account key file). Custom claims `{ clinicId, role, shift }`. Q8 is Route Handlers, not Cloud Functions.
**Author:** architecture review at founder's request
**Supersedes:** the Q8 decision taken earlier today (Cloud Function). See §9.

## 1. Why this document exists

The question asked was: accept the join-code exposure, or close it with a Cloud Function?

Having researched it properly, **both options are answers to too small a question.** The join code is one symptom of a single structural fact about LabFlow:

> The application has no trusted server. Every read and write goes from the browser straight to Firestore. There is no place to put code that the user cannot see or tamper with.

That one fact is the cause of the join-code exposure, and it is also the blocker for at least five other things already specified in PRD v0.3. Deciding it properly once is worth more than solving the join code in isolation.

**This document was written on the founder's explicit instruction that nothing ships until it is right.** It therefore recommends the option that is correct at five years, not the one that is fastest this week.

## 2. What actually needs a trusted server

| Need | PRD §  | Why the browser cannot do it |
|---|---|---|
| Join-code lookup without exposing the clinics collection | 4.3 | Rules cannot filter by query; the browser would read every clinic document |
| **Role and clinic in the auth token (custom claims)** | 11 | Claims can only be set by the Admin SDK "from a privileged server environment" |
| Excel export and email delivery | 6.2 | An SMTP or API credential in browser JavaScript is a published credential |
| AI column mapping for imports | 8.3 | Same — the model API key would be public |
| Pre-approval expiry after 90 days | 8.4 | Needs a scheduled job, not a user action |
| Reagent expiry alerts | 7.4 | Same |

Five of the six are already written into the PRD as specified-not-built. The trusted server is not a new requirement. It is an unnamed dependency of work already agreed.

## 3. The finding that reframes everything: rules `get()` is not free

This is the part I did not know before researching it, and it changes the cost calculation.

LabFlow's Firestore rules — the ones written in Q4 but not yet deployed — determine a user's clinic and role by reading their user document inside the rule:

```
function userDoc() {
  return get(/databases/$(database)/documents/users/$(request.auth.uid)).data
}
```

Google's documentation is explicit about what that costs:

> "Using these functions executes a read operation in your database, which means you will be billed for reading documents even if your rules reject the request."

And it is capped:

> "10 for single-document requests and query requests… 20 for multi-document reads, transactions, and batched writes… Exceeding either limit results in a permission denied error."

**Three consequences for LabFlow.**

**Cost.** Every patient list load, every order read, every result write pays an extra document read to answer "who is this person?". On Spark's 50,000 free daily reads, a laboratory doing a few hundred operations a day roughly doubles its read count for nothing.

**Latency.** That lookup happens inside the rules engine, on every operation, before the real work. On a Gambian connection this is not free either.

**A ceiling.** Ten access calls per request is generous for simple rules and not generous for the rules LabFlow needs — result-approval checks that verify role, clinic and membership, and batched writes where the limit applies per operation *and* in aggregate. A rules file that grows naturally can hit this and start returning permission-denied errors that look exactly like a permissions bug.

**The alternative is custom claims.** Put `clinicId` and `role` into the Firebase ID token itself. Then the rule reads `request.auth.token.clinicId` — no document read, no billing, no latency, no cap. The token is signed by Firebase and cannot be forged or edited by the client.

Constraints, from the documentation: the claims payload must not exceed **1000 bytes**; claims "should only be set from a privileged server environment by the Firebase Admin SDK"; and they reach the client on the next token issue, forced immediately with `currentUser.getIdToken(true)`.

LabFlow's payload is `{ clinicId, role, shift }` — well under 1000 bytes.

**So the trusted server is not optional infrastructure for a nice-to-have. It is what makes LabFlow's security model affordable and fast.** That is the real argument, and the join code is a footnote to it.

## 4. The options

### Option A — Firebase Cloud Functions

The default answer, and what I proposed this morning.

| | |
|---|---|
| **Requires** | Blaze pay-as-you-go plan. Spark cannot deploy functions at all |
| **Credentials** | None to manage — functions run as the project's service account |
| **Auth context** | `onCall` verifies the caller's ID token automatically |
| **Unique capability** | **Firestore triggers** — react to a document write without the client asking |
| **Deployment** | A second pipeline. `firebase deploy --only functions`, separate from Vercel |
| **Repository** | A `functions/` subproject with its own `package.json`, `node_modules`, TypeScript config |
| **Compliance** | **Cloud Functions for Firebase is not a HIPAA-covered product under Google's BAA** |

### Option B — Next.js Route Handlers on Vercel

Add `app/api/**/route.ts` to the existing project, running `firebase-admin`.

| | |
|---|---|
| **Requires** | Nothing new. Vercel already builds and deploys this repository |
| **Credentials** | A Google service account — obtainable **without a key file**, see below |
| **Auth context** | Verify the ID token explicitly: `getAuth().verifyIdToken(bearer)`. Roughly three lines |
| **Missing capability** | No Firestore triggers. Scheduled work uses Vercel Cron instead |
| **Deployment** | One pipeline. The API ships with the app, in the same commit, always in version-sync |
| **Repository** | Same project, same `package.json`, same lint and type-check |
| **Compliance** | PHI passing through Vercel makes Vercel a sub-processor — see §7 |

**The credential question, which is usually the objection to Option B.** The common pattern is pasting a service-account JSON key into an environment variable, and it is genuinely bad — a long-lived, non-rotating credential with full project access sitting in a dashboard.

That is avoidable. Vercel publishes an OIDC identity provider, and Google Cloud accepts it through Workload Identity Federation. The Vercel function presents a short-lived OIDC token, exchanges it for a Google access token, and impersonates a service account scoped to exactly the permissions it needs. **No key file exists anywhere.** Setup is a workload identity pool, a provider pointed at `https://oidc.vercel.com/[team]`, and a service account with the principal bound to `project:labflow:environment:production`.

This is better than Option A's posture in one respect: the service account can be scoped narrowly, whereas a Cloud Function runs as the project's own service account with broad default access.

### Option C — Rules-only, no server

The `get`-not-`list` split I proposed earlier: a `joinCodes/{code}` collection where the document ID is the code, `allow get` permitted and `allow list` denied.

This works — `get` and `list` are genuinely separable in Firestore rules, which is confirmed in the documentation: `allow get` "applies to single document read requests", `allow list` "applies to queries and collection read requests".

But it solves only the join code. It leaves custom claims, email, AI mapping and scheduled jobs unaddressed, which means the server question returns within weeks. **It is a good tactic and a bad strategy.**

## 5. Recommendation

> **Option B. Next.js Route Handlers on Vercel, authenticated to Google Cloud through Vercel OIDC and Workload Identity Federation, with no service-account key file.**

If I were joining LabFlow as a senior engineer with a decade in clinical systems, this is what I would argue for, and these are the reasons in the order I weigh them.

**One deploy pipeline is worth more than any feature.** LabFlow has one developer. Two pipelines means two places a release can half-succeed: an app that expects an API that has not deployed, a function calling a field the app renamed. Version skew between app and backend is the most common source of "it worked yesterday" in small teams, and Option B makes it structurally impossible — the API and the code that calls it are in the same commit, built together, deployed together, rolled back together. In a system that releases clinical results, "impossible to skew" is worth more than convenience.

**It does not require a plan change with an unbounded ceiling.** Blaze removes Spark's hard spending cap. That is fine for a funded team with monitoring. For a solo founder in a cost-sensitive market — a design constraint named in PRD §1 — deferring the moment when a runaway loop can produce a real bill is worth something. Option B keeps LabFlow on Spark until Firestore usage genuinely outgrows it, which is a decision driven by success rather than by architecture.

**Keyless credentials.** This is the security argument. The most common failure in this exact pattern is a service-account key in an environment variable. Vercel OIDC removes the key entirely. A reviewer asking "where is your long-lived credential?" gets the answer "there isn't one", which is the only good answer.

**The one thing Option A does that Option B cannot is Firestore triggers** — and LabFlow does not currently need them. Every server action in §2 is initiated by a user or a schedule. If a trigger ever becomes genuinely necessary, Cloud Functions can be added then, for that alone. **Choosing Option B now forecloses nothing.**

**On the compliance point, honestly.** Cloud Functions for Firebase is not covered by Google's BAA, so Option A carries no compliance advantage to trade away. Two things are worth recording rather than acting on: Firestore *is* BAA-covered while **Firebase Authentication is not** — Identity Platform is, and it is an upgrade of the same service from the same console, should LabFlow ever need to make that claim. And PHI flowing through Vercel functions makes Vercel a sub-processor to disclose. Neither is a HIPAA question in The Gambia, which has no such statute; both are relevant to the "appropriate safeguards" language of the 2023/2025 Act, and both are cheaper to know now than to discover during an assessment.

## 6. Audit — does this work with what LabFlow already has?

Checked against `AUDIT-2026-08-21.md`, the state of branch `fbd7375`, PRD v0.3, and prompts Q1–Q8.

### 6.1 Compatibility with the existing codebase

| Existing fact | Effect |
|---|---|
| No API routes, no Server Actions, no middleware | **This is the first server-side code in the project.** A clean addition, not a retrofit |
| Next.js 16 App Router | Route Handlers are native. No new dependency beyond `firebase-admin` |
| TypeScript strict, path alias `@/*` | API routes inherit both. Shared types between client and API for free — a real advantage over a separate functions subproject |
| Client SDK used everywhere | Unchanged. The API is additive; existing pages keep working |
| `app/lib/permissions.ts` as single source of truth (post-P1) | **The API imports the same file.** Client and server cannot drift — impossible with a separate functions project without duplicating or publishing a package |
| Vercel already deploys `main` | No new deployment surface |
| `firestore.rules` written, not deployed | Unaffected. Deploy as planned |

**No conflict found.** The last row of that table is the strongest practical argument: one permissions file, imported by the pages, the API routes, and mirrored in the rules. Option A cannot have that without duplication.

### 6.2 Effect on prompts Q1–Q8

| Prompt | Effect |
|---|---|
| Q1 technician assistant | None |
| Q2 verification pass | None |
| Q3 go live | None — still first |
| **Q4 rules** | **Amend.** Write the clinic/role helpers to read claims with a fallback to `get()`. See §8.1 |
| Q5 review queue | None |
| Q6 TAT hygiene | None |
| Q7 audit log | Unchanged — rules make it create-only; client writes are adequate and tamper-resistant |
| **Q8 join code** | **Replaced.** Becomes two Route Handlers instead of two Cloud Functions. Same behaviour, same acceptance criteria |

**Nothing in the current plan is invalidated.** Q1–Q3 proceed exactly as written. Only Q4 gains a forward-compatible helper, and Q8 changes its implementation surface while keeping its specification.

### 6.3 Open questions this closes

**PRD §13 question 2 — join-code disclosure.** Closed. The route handler resolves the code server-side and returns only the clinic name; the blanket read on `clinics` is removed.

**PRD §13 question 4 — owner acting-clinic invisible to rules.** Closed, but **not by building anything** — by correcting the framing, which is the more useful outcome.

The concern was that rules trust the owner with any `clinicId`, so the acting-clinic is a convention rather than a constraint. On reflection that is the correct design, not a gap. The owner is *defined* as the account permitted to write into any clinic; a rule constraining which clinic the owner writes to would be enforcing a UI preference, not a security boundary. The only threat it would mitigate is a compromised owner account, which by definition can already do anything.

The acting-clinic mechanism exists for **accuracy and audit** — so that a record lands in the right clinic and is stamped as an owner action. Those are served by the banner, the stamping and the audit log. **Recommendation: close question 4 as "working as intended", and do not spend a custom claim on it.** Claims propagate on token refresh, so putting acting-clinic in a claim would also make clinic switching slow, trading a real cost for an imaginary gain.

**PRD §13 question 3 — email provider.** Unblocked. `app/api/reports/export/route.ts` becomes the natural home; provider choice is now the only remaining decision.

**PRD §8.3 — AI column mapping.** Unblocked. The API key lives server-side; only the header row and three sample rows leave the browser.

### 6.4 What this newly requires that the plan does not yet cover

Three items. All are new work, all are small, none are surprises.

1. **A claims backfill.** Existing approved users have no claims. Either set them lazily on next sign-in, or run a one-off admin route over the `users` collection. The rules fallback in §8.1 means neither is urgent.

2. **Token refresh after approval.** A newly-approved staff member holds a token with no claims. Their client must call `getIdToken(true)` before the new access takes effect. Without this the user is approved and still locked out until their token happens to expire — the single most likely support complaint this change can produce, and it must be handled explicitly on the pending screen.

3. **Vercel plan check.** Confirm OIDC federation is available on the account's current plan before building against it. If not, fall back to a scoped service-account key with a rotation reminder, and treat OIDC as a follow-up.

### 6.5 Risks

| Risk | Severity | Mitigation |
|---|---|---|
| Claims go stale — user's role changes but the token still holds the old one | **High** | Force `getIdToken(true)` on every role or clinic change. Keep claims to `clinicId`, `role`, `shift` only — never anything that changes often |
| A user is approved but still blocked pending refresh | Medium | Explicit refresh on the pending screen; poll their user document and refresh when status flips |
| Vercel OIDC unavailable on the plan | Medium | Scoped service-account key, documented rotation |
| PHI transits Vercel once export is built | Medium | Note as a sub-processor; revisit before any deployment outside The Gambia |
| Rules read a claim that does not exist yet | Medium | The `'clinicId' in request.auth.token` guard in §8.1 — never dereference a claim without it |
| No Firestore triggers | Low | Nothing currently needs one; add Cloud Functions later for that alone |
| API route accepts a client-supplied clinicId | **High** | Never trust a client-supplied identifier; always re-resolve server-side from the verified token |

## 7. Consequences

**Accepted:**

- LabFlow gains a server tier. That is a genuine increase in surface area, and every route added to it must verify the caller's token — no exceptions, no "internal" routes.
- Vercel becomes a processor of clinical data once export is built.
- The team must understand token refresh, which is a real source of confusing bugs.

**Gained:**

- Rules stop paying a document read per operation.
- The 10-access-call ceiling stops being a limit worth thinking about.
- Client and server share one permissions file.
- Email, AI mapping and scheduled jobs are unblocked without further architectural decisions.
- No long-lived credential exists anywhere in the system.

**Deferred, not foreclosed:** Cloud Functions, if Firestore triggers ever become necessary.

## 8. Implementation notes that matter

### 8.1 Rules helpers — claims first, `get()` fallback

Write the rules so they work today with zero claims issued and get faster as claims roll out. No flag day, no coordinated deploy.

```
function hasClaim(key) {
  return request.auth != null && key in request.auth.token;
}

function myClinicId() {
  return hasClaim('clinicId')
    ? request.auth.token.clinicId
    : get(/databases/$(database)/documents/users/$(request.auth.uid)).data.clinicId;
}

function myRole() {
  return hasClaim('role')
    ? request.auth.token.role
    : get(/databases/$(database)/documents/users/$(request.auth.uid)).data.role;
}
```

The `in` guard is not optional — dereferencing a claim that was never set errors the whole rule evaluation, which surfaces as an unexplained permission denial.

Delete the fallback branches once every active user carries claims, and record the date it was removed.

### 8.2 Never trust a client-supplied clinic

Every route handler re-resolves the clinic from the verified token or from the join code. A `clinicId` in a request body is ignored. This is the single rule that prevents the join API from becoming a way to join any clinic without its code.

### 8.3 Region

Pin route handlers to a European region — `fra1`, `cdg1` or `arn1`. A handler in `iad1` puts a transatlantic round trip on every join attempt, which on a Gambian connection is the difference between a pause and a timeout.

### 8.4 Claims are exactly three fields

`{ clinicId, role, shift }`. Nothing else. The 1000-byte limit is not the constraint — staleness is. Every field added is a field that can be wrong until the next token refresh.

## 9. What changed from this morning's decision, and why

The founder chose "build the Cloud Function now" over "accept the leak", against a recommendation to do a rules-only fix. That instinct — close it properly rather than accept a documented hole — was right, and this document does not reverse it.

What changed is the research. Three facts were not on the table when that choice was made:

1. Rules `get()` calls are billed reads, capped at ten per request — so the user-document lookup is a running cost and a ceiling, not a free convenience.
2. Custom claims are the standard remedy, and they require a privileged server. That makes the server decision structural rather than a one-feature question.
3. Cloud Functions require Blaze and are not BAA-covered, so Option A's apparent "it's the official way" advantage does not survive contact with either the pricing page or the compliance list.

**The decision to build a proper server-side fix stands. The recommendation is only about where that code lives** — and one pipeline, no key file, no plan change, shared permissions file is the better answer for a solo-maintained clinical system.

## 10. Decision

**Decided 21 August 2026:** founder approved Option B. Q8 is two Route Handlers (`POST /api/join/redeem`, `POST /api/join/confirm`), not Cloud Functions. Implementation notes in §8 apply. Console setup for OIDC is in `docs/OIDC-SETUP.md`.

R1–R4 were not present in the repository or transcripts; Option B was implemented from this ADR.

## Sources

- [Writing conditions for Cloud Firestore Security Rules](https://firebase.google.com/docs/firestore/security/rules-conditions) — Firebase — get()/exists() billed as reads; 10 and 20 access-call limits
- [Structuring Cloud Firestore Security Rules](https://firebase.google.com/docs/firestore/security/rules-structure) — Firebase — allow get vs allow list
- [Control Access with Custom Claims and Security Rules](https://firebase.google.com/docs/auth/admin/custom-claims) — Firebase — 1000-byte limit, Admin SDK requirement, getIdToken(true)
- [Security Rules and Firebase Authentication](https://firebase.google.com/docs/rules/rules-and-auth) — Firebase — request.auth.token syntax
- [Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans) — Firebase — Cloud Functions require Blaze
- [Connect to Google Cloud Platform (GCP)](https://vercel.com/docs/oidc/gcp) — Vercel — OIDC to Workload Identity Federation, keyless
- [Workload Identity Federation](https://docs.cloud.google.com/iam/docs/workload-identity-federation) — Google Cloud
- [Is Firebase HIPAA Compliant? BAA, Covered Services](https://www.accountablehq.com/post/is-firebase-hipaa-compliant-baa-covered-services-and-how-to-use-it-safely) — Accountable — BAA-covered vs not-covered services
