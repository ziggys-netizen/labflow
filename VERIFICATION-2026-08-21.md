# LabFlow Q2R verification — 22 August 2026

**Date:** 22 August 2026 (prompt dated 21 August 2026)  
**Branch:** `wip/inventory-and-migration` (tracks `origin/wip/inventory-and-migration`)  
**HEAD commit:** `fbd7375` — *Implement P1-P9: roles, capability gates, owner acting clinic, Firestore rules, soft delete, print Lab ID, clinic staff, migration, review research*  
**Working tree:** uncommitted. This session did **not** commit and did **not** push. A commit is required before preview.  
**Local app:** Next.js 16.3.0. Browser tests were **not** run (as instructed).  
**Firestore rules:** not deployed. **main:** not merged.

Status values: **pass** / **fail** / **not tested**.

---

## Blockers

**Phase 0: none.** `npx tsc --noEmit`, `npm run lint`, `npm test`, and `npm run build` all exit 0 after the lint fixes below. S4 flip-check failed then passed after revert. `GET /api/health` exists.

**Phase 1 cannot start until the founder:**

1. Commits this working tree (health route + prior WIP + lint fixes). This session did not commit.
2. Configures Vercel **Production and Preview** env (OIDC / Admin credentials, `RESEND_*`, `CRON_SECRET`, `NEXT_PUBLIC_FIREBASE_*`) per the Phase 1 list at the bottom of this file.
3. Pushes `wip/inventory-and-migration` for a preview deploy. This session did not push.

**Phases 1–5 were not reached and were not tested.** Do not treat anything below as a preview, OIDC, or production result.

Preview will read **production Firestore**. No destructive testing.

---

## Phase 0

| Check | Status | Notes |
|---|---|---|
| `npx tsc --noEmit` | **pass** | exit 0 (after health route + lint-only UI edits) |
| `npm run lint` | **pass** | exit 0 after four eslint fixes; first run was fail (see Fixes) |
| `npm test` | **pass** | 10 files, 107 tests, exit 0 |
| `npm run build` | **pass** | `vitest run && next build`; compiled; `/api/health` listed as `ƒ` |
| S4 flip-check | **pass** | Flip failed with a readable matrix/Q1 message; revert was green again |
| `/api/health` exists | **pass** | **Added** this session: `app/api/health/route.ts` |

### Phase 0 commands (verbatim)

#### `npx tsc --noEmit` — exit 0

```
npm warn Unknown env config "devdir". This will stop working in the next major version of npm. See `npm help npmrc` for supported config options.
```

(First run also printed an npm major-version notice; second run after edits was the same exit 0 with only the `devdir` warning.)

#### `npm run lint` — first run exit 1, then exit 0

First run (4 errors):

```
> labflow@0.1.0 lint
> eslint

C:\Users\kanui\Documents\LF1\app\orders\[orderId]\page.tsx
  124:5  error  ... setAmendOpen(false) ... react-hooks/set-state-in-effect

C:\Users\kanui\Documents\LF1\app\owner\clinics\[clinicId]\audit\page.tsx
   53:78  error  `'` can be escaped ... react/no-unescaped-entities
  105:10  error  ... void load() ... react-hooks/set-state-in-effect

C:\Users\kanui\Documents\LF1\app\owner\clinics\[clinicId]\data-quality\page.tsx
  67:7  error  ... setLoading(false) ... react-hooks/set-state-in-effect

✖ 4 problems (4 errors, 0 warnings)
```

After fixes:

```
> labflow@0.1.0 lint
> eslint
```

exit 0.

#### `npm test` — exit 0

```
> labflow@0.1.0 test
> vitest run

 RUN  v4.1.11 C:/Users/kanui/Documents/LF1

 Test Files  10 passed (10)
      Tests  107 passed (107)
```

#### `npm run build` — exit 0

```
> labflow@0.1.0 build
> vitest run && next build

 Test Files  10 passed (10)
      Tests  107 passed (107)

▲ Next.js 16.3.0 (Turbopack)
✓ Compiled successfully in 54s
  Finished TypeScript in 19.5s ...
✓ Generating static pages using 3 workers (26/26) in 1630ms

Route (app) includes:
├ ƒ /api/health
```

`ƒ /api/health` is dynamic (not prerendered). Build did not require GCP credentials.

### S4 flip-check (verbatim)

Deliberately added `technician_assistant` to `canOrderTests` in `app/lib/permissions.ts`, then `npm test`:

```
 Test Files  1 failed | 9 passed (10)
      Tests  2 failed | 105 passed (107)

 FAIL  ... technician_assistant matches every written capability cell
-   "canOrderTests": false,
+   "canOrderTests": true,

 FAIL  ... technician_assistant cannot order tests or enter results (Q1)
AssertionError: expected true to be false
    expect(canOrderTests("technician_assistant")).toBe(false);
```

Reverted the one-line flip. `npm test` again: 10 files, 107 tests, exit 0. The suite is not a tautology.

### `/api/health`

Did not exist. Added `GET` in `app/api/health/route.ts`:

- Lazy Admin init via existing `getAdminApp()` (importing the module does not throw at build time).
- `{ ok: true }` after a credential `getAccessToken()` probe (no collection scans, no secrets, no patient data).
- `{ ok: false }` with HTTP 503 when credentials are missing or Admin cannot initialise.
- `dynamic = "force-dynamic"`, `runtime = "nodejs"`. No `preferredRegion` (deprecated in Next.js 16).

Local without GCP is expected to be 503. That is not a Phase 0 blocker.

---

## Phases 1–5

| Phase | Status |
|---|---|
| 1 Preview / OIDC / env | **not tested** (not reached) |
| 2 | **not tested** (not reached) |
| 3 | **not tested** (not reached) |
| 4 | **not tested** (not reached) |
| 5 | **not tested** (not reached) |

No preview URL, no OIDC probe, no Firestore rules deploy, no merge to main.

Prior signed-in browser matrix (A–G in the previous revision of this file) remains **not tested**. It is not part of Phase 0.

---

## Fixes made in this session (Phase 0)

1. **`app/api/health/route.ts`** — new `GET /api/health` (required for Phase 1 preview).
2. **`app/orders/[orderId]/page.tsx`** — removed synchronous `setAmendOpen` / `setAmendReason` from the subscribe effect; remount with `key={orderId}` so amend UI still resets when the order changes.
3. **`app/owner/clinics/[clinicId]/audit/page.tsx`** — unescaped apostrophe; load runs after `await` so eslint `set-state-in-effect` is clean; date Apply still sets loading from the submit handler.
4. **`app/owner/clinics/[clinicId]/data-quality/page.tsx`** — no synchronous `setLoading(false)` when the owner/clinic gate fails; empty `clinicId` shows not-found instead of spinning.

`app/lib/permissions.ts` was flipped for S4 then reverted; no net change from that check.

---

## What the founder must do for Phase 1

Phase 0 is green. This session did **not** push. Preview reads **production Firestore** — do not run destructive tests there.

1. **Commit** the working tree on `wip/inventory-and-migration` (health route will not be on preview until it is committed). Then **push** that existing WIP branch (it already tracks `origin/wip/inventory-and-migration`).
2. **OIDC, Production and Preview**, following `docs/OIDC-SETUP.md`:
   - Enable IAM Credentials and Security Token Service APIs on GCP project `labflow-6cb9e`.
   - Workload Identity Pool + OIDC provider `https://oidc.vercel.com/[team]`.
   - Dedicated service account (Firebase Auth Admin + Firestore). Bind to `project:labflow:environment:production` (and Preview equivalently). Enable Vercel OIDC Federation. Redeploy after binding.
   - Vercel env: `GOOGLE_CLOUD_PROJECT` / `GCLOUD_PROJECT`, and `FIREBASE_PROJECT_ID` if it differs from the public client id.
   - Fallback if OIDC is not live yet (Production **and** Preview, never git, never `NEXT_PUBLIC_*`): `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY`, or `FIREBASE_SERVICE_ACCOUNT_JSON`.
3. **`RESEND_API_KEY`** and **`RESEND_FROM`** (server only; verified sending domain) in Production and Preview.
4. **`CRON_SECRET`** in Production and Preview (cron on `/api/cron/pre-approvals/lapse`).
5. **`NEXT_PUBLIC_FIREBASE_*`** in Production and Preview: `API_KEY`, `AUTH_DOMAIN`, `PROJECT_ID`, `STORAGE_BUCKET`, `MESSAGING_SENDER_ID`, `APP_ID`.
6. After env is set, **push** (or redeploy) so preview picks up `/api/health`. Confirm `GET /api/health` returns `{ ok: true }` on preview once Admin can initialise. Local 503 without credentials is expected.

Do not deploy Firestore rules in this phase unless a later phase explicitly says so. Do not merge to main.
