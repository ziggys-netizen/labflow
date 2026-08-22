# LabFlow — Vercel OIDC to Google Cloud (ADR-001 Option B)

Route handlers (`app/api/**`) use the Firebase Admin SDK. They must not ship a long-lived service-account **key file**. Pin them in Europe via `vercel.json` (`fra1`; `cdg1` / `arn1` are acceptable substitutes). Next.js 16’s `preferredRegion` export is **deprecated** — do not use it.

Nothing below is done automatically. The founder does this in the Vercel and Google Cloud consoles.

## Production (keyless) — do this

1. In Google Cloud, enable **IAM Credentials** and **Security Token Service** APIs on the Firebase project (`labflow-6cb9e` unless renamed).
2. Create a **Workload Identity Pool** and an OIDC **provider** pointed at:
   `https://oidc.vercel.com/[team]`
   (use the Vercel team slug from the Vercel dashboard).
3. Create a dedicated service account, scoped to what the API needs (Firebase Auth Admin + Firestore). Do **not** reuse a key-bearing “editor” account.
4. Bind that service account so the principal is limited to:
   `project:labflow:environment:production`
   (Vercel OIDC `aud` / attribute mapping — see [Connect to GCP](https://vercel.com/docs/oidc/gcp)).
5. In Vercel → Project → Environment Variables, set:
   - `GOOGLE_CLOUD_PROJECT` / `GCLOUD_PROJECT` to the GCP project id
   - `FIREBASE_PROJECT_ID` if it differs from the public client id
6. Enable Vercel **OIDC Federation** for the project (Settings → Security / OIDC). Redeploy after binding.

When this works, `applicationDefault()` on the function exchanges a short-lived Vercel OIDC token for a Google access token. **No JSON key exists.**

## Fallback if OIDC is not on the plan yet

Paste a **scoped** service account into Vercel env (Production + Preview), not into git:

- `FIREBASE_CLIENT_EMAIL`
- `FIREBASE_PRIVATE_KEY` (PEM; escaped `\n` is fine)
- or a single `FIREBASE_SERVICE_ACCOUNT_JSON`

Rotate the key on a calendar reminder (90 days). Delete the key in GCP when OIDC is live. Do not commit the JSON. Do not put it in `NEXT_PUBLIC_*`.

## Local / dev

Either:

- `gcloud auth application-default login` (Application Default Credentials), or
- `FIREBASE_ADMIN_CREDENTIALS_PATH` pointing at a **gitignored** key file on your machine.

`FIREBASE_ADMIN_CREDENTIALS_PATH` is rejected on Vercel. Missing credentials fail **at request time** with HTTP 503; `next build` does not require GCP.

## After staff approval

The client must call `getIdToken(true)` so new custom claims `{ clinicId, role, shift }` land in the ID token. `/pending` does this when the user document flips to approved.
