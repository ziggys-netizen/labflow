# LabFlow Q2R verification — 22 August 2026

**Date:** 22 August 2026 (prompt dated 21 August 2026)  
**Branch:** `wip/inventory-and-migration` (tracks `origin/wip/inventory-and-migration`)  
**HEAD (app on preview):** `414c903` — *Q1, Q5-Q7, R1-R4, S1-S7: server tier, custom claims, offline, catalogue seeding, specimen types, amendment, export*  
**Working tree:** Q3P notes below; app WIP is on `origin/wip/inventory-and-migration`.  
**Local app:** Next.js 16.3.0. Browser tests were **not** run (as instructed).  
**Firestore rules:** not deployed. **main:** not merged.

Status values: **pass** / **fail** / **not tested**.

---

## Blockers

**Phase 0: none.** `npx tsc --noEmit`, `npm run lint`, `npm test`, and `npm run build` all exit 0 after the lint fixes below. S4 flip-check failed then passed after revert. `GET /api/health` exists.

**Phase 1 (preview URL) is unblocked.** See **Q3P** below. OIDC / Resend / cron are still missing, so `/api/*` is expected to fail.

**Phases 2–5 were not reached and were not tested.** Do not treat anything below as an OIDC or production-rules result.

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
| 1 Preview / OIDC / env | **partial** — preview Ready; OIDC/Resend/cron still missing (see Q3P) |
| 2 | **not tested** (not reached) |
| 3 | **not tested** (not reached) |
| 4 | **not tested** (not reached) |
| 5 | **not tested** (not reached) |

Preview URL exists (Q3P). No OIDC probe, no Firestore rules deploy, no merge to main.

Prior signed-in browser matrix (A–G in the previous revision of this file) remains **not tested**. It is not part of Phase 0.

---

## Fixes made in this session (Phase 0)

1. **`app/api/health/route.ts`** — new `GET /api/health` (required for Phase 1 preview).
2. **`app/orders/[orderId]/page.tsx`** — removed synchronous `setAmendOpen` / `setAmendReason` from the subscribe effect; remount with `key={orderId}` so amend UI still resets when the order changes.
3. **`app/owner/clinics/[clinicId]/audit/page.tsx`** — unescaped apostrophe; load runs after `await` so eslint `set-state-in-effect` is clean; date Apply still sets loading from the submit handler.
4. **`app/owner/clinics/[clinicId]/data-quality/page.tsx`** — no synchronous `setLoading(false)` when the owner/clinic gate fails; empty `clinicId` shows not-found instead of spinning.

`app/lib/permissions.ts` was flipped for S4 then reverted; no net change from that check.

---

## Q3P — Preview deployment (22 August 2026)

**Stable preview (use this):** https://labflow-git-wip-inventory-and-migration-buck-holdings.vercel.app  
**This deploy’s unique URL:** https://labflow-7wj0agf5a-buck-holdings.vercel.app  
**Inspect:** https://vercel.com/buck-holdings/labflow/DcYnGSCoFVRdiZ4oCkqVDs1zeKgY  
**SHA:** `414c9034c504012eccb1956d7376b3f4647a84b1`  
**Outcome:** Ready in ~44s. First Git preview (`dpl_79LAogQsK2Q1odUD5MWtbDmFVL8X`) failed with `auth/invalid-api-key` because Preview had no `NEXT_PUBLIC_FIREBASE_*`. After copying those six from `.env.local` to Preview and redeploying, the build passed.

Local reconfirm (Q3P precondition): `npx tsc --noEmit` exit 0; `npm run build` exit 0 (107 tests, compiled, 26/26 static pages). Vercel build: 107 tests, compiled, TypeScript clean, 26/26 pages. Warnings only: npm deprecations (`tsconfck`, `node-domexception`, `uuid@9`, `glob@10`), `allow-scripts` pending for `@firebase/util`, `protobufjs`, `unrs-resolver`, and vite-tsconfig-paths natively supported.

Vercel Deployment Protection may show a Vercel login wall to visitors who are not on the `buck-holdings` team. That is not LabFlow auth. Open the URL while signed into Vercel, then use Google popup on LabFlow.

### `app/lib/firebase.ts` env checklist

| Variable | Preview | Production | Notes |
|---|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | **set** this session | already set (left as-is) | public by design |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | **set** this session | already set (left as-is) | |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | **set** this session | already set (left as-is) | |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | **set** this session | already set (left as-is) | |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | **set** this session | already set (left as-is) | |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | **set** this session | already set (left as-is) | |

Optional client var (not in `firebase.ts`): `NEXT_PUBLIC_SUPPORT_EMAIL` — missing locally and on Preview (migration page mailto only).

### Founder still must tick

1. **Firebase authorised domain** (CLI could not write Auth settings). Add exact host: `labflow-git-wip-inventory-and-migration-buck-holdings.vercel.app`  
   Firebase Console → Authentication → Settings → Authorised domains. Do **not** use `signInWithRedirect`.
2. **OIDC / Admin** (do not invent). Still missing on Preview: `GOOGLE_CLOUD_PROJECT` / `GCLOUD_PROJECT`, and either Vercel OIDC or `FIREBASE_CLIENT_EMAIL` + `FIREBASE_PRIVATE_KEY` / `FIREBASE_SERVICE_ACCOUNT_JSON`.
3. **`RESEND_API_KEY`**, **`RESEND_FROM`** — not in `.env.local`; not set on Preview.
4. **`CRON_SECRET`** — not in `.env.local`; not set on Preview.

### Expected failures on this preview

Preview writes **production Firestore** (`labflow-6cb9e`). Rules are still open. Do not enter real patient names. Do not run migration or bulk import.

| Feature | Expected |
|---|---|
| `/api/health` | 503 / `{ ok: false }` until Admin/OIDC works |
| `/api/join/*`, claims sync, staff pre-approvals | 500 without OIDC |
| Excel export / email | fail without `RESEND_*` |
| Cron lapse job | reject without `CRON_SECRET` |
| Google popup | fail until the authorised domain above is added |

---

## What the founder must do for Phase 1

Phase 0 is green. Preview is up (Q3P). Preview reads **production Firestore** — do not run destructive tests there.

1. Add the authorised domain above, then sign in with an account that already has a clinic.
2. **OIDC, Production and Preview**, following `docs/OIDC-SETUP.md` (not done; do not invent credentials).
3. **`RESEND_API_KEY`** and **`RESEND_FROM`** (server only) in Production and Preview.
4. **`CRON_SECRET`** in Production and Preview.
5. Confirm `GET /api/health` returns `{ ok: true }` only after Admin can initialise.

Do not deploy Firestore rules in this phase unless a later phase explicitly says so. Do not merge to main.
