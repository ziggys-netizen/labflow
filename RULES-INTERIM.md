# LabFlow interim Firestore rules (U1)

**Project:** `labflow-6cb9e`  
**Database:** `(default)`  
**Rules file:** [`firestore.rules`](firestore.rules)  
**Date:** 2026-08-22  
**Status:** emulator playground **14/14 PASS**. Live deploy **blocked** — MCP `firebase_deploy` (`only: firestore:rules`) failed because no Firebase user is logged in. No new CLI login was started (parent session `73A76` left intact). Production is still open. U2 not started.

This is an **interim lockdown**, not the final R4 claims ruleset. The previous committed `firestore.rules` was a claims-first draft that blocked client-side join. This file replaces it.

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for unauthenticated denial, clinic isolation on clinical collections, and a one-time self-join of `clinicId` while `clinicId` is null. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules (that hardening is R4: custom claims, Admin join, role capability matrix).

---

## What these rules do

- Default deny any unlisted path. Unauthenticated deny everywhere.
- **No custom claims.** Identity is `get()` of `users/{request.auth.uid}` only. One get per request (exists+get on that path are cached).
- Owner `clinicId` is null: `isOwner()` is always evaluated **before** any `clinicId` comparison.
- Create of `users/{uid}` does **not** `get()` that document (it does not exist yet).
- Join stays client-capable: any signed-in user may `get` and `list` `clinics` (including `where('clinicId'…)` / `where('joinCode','==',code)`). A pending user may set `clinicId` on their own user doc **once**, when it is currently null/absent. They cannot combine that write with `role` / `status`.
- Clinical collections (`patients`, `orders`, `testCatalog`, `inventoryItems`, `inventoryBatches`, `inventoryMovements`, `specimenMovements`): read/write own clinic or owner. `clinicId` cannot change on update. Patient **hard delete is denied**.
- `clinics`: any signed-in user may get/list (join-code disclosure). **Create and delete: owner only** (this updates the earlier `delete: if false`). Update: owner or that clinic's `clinic_admin`.
- `auditLogs`: owner or that clinic's `clinic_admin` may read. Create only (signed-in; owner or `clinicId == userClinic()`). No update, no delete.
- `usernames`: signed-in `get`; write only when `uid` is the caller. `list` denied.
- `preApprovals`: owner / clinic_admin read. Client writes denied (Admin SDK consume/create).
- `migrationHistory`: owner, or same-clinic `lab_manager` create; owner / lab_manager / clinic_admin read. No update/delete.
- `joinAttempts`: deny all.
- `clinicPins` and `nonconformingEvents`: clinic-scoped so PIN set and sample-rejection NCE writes from today's app are not blocked. Not part of the U1 matrix.

## Known disclosure (do not “fix” in this interim set)

**Any signed-in user can list and get every `clinics/{id}` document**, including `joinCode`. That is required for client-side join and for `uniqueJoinCode()`. Close this in R4 when join is Admin-only (`POST /api/join/redeem`).

The current working-tree join **page** calls those Admin routes. Those routes still need OIDC/Admin. This ruleset does **not** wait on `/api/health`. A client that queries `clinics` by `joinCode` and then writes `users.clinicId` once will succeed under these rules.

## App query confirmation

| Caller | Query | Rules |
|---|---|---|
| Staff | `where('clinicId','==', membershipClinic)` via `clinicCollectionQuery` | `list` allowed |
| Owner | Unfiltered `patients` / `orders` / `users` / `clinics` | `isOwner()` |
| clinic_admin | `users` where `clinicId` or `clinicIds` array-contains | `userInCallerClinic` |
| Pending / any signed-in | `clinics` where `joinCode == code` | signed-in `list` |
| Owner page | `users` where `email == …` | `isOwner()` |

## Self-update keys

Allowed on own `users/{uid}`: `username`, `usernameUpdatedAt`, `activeClinicId`, and `clinicId` only if currently null/absent.

**Not allowed on self (interim):** `role`, `status`, `pinSet`, `setActiveClinic` legacy mirror (`role`+`clinicId`+`status`+`activeClinicId`). Census has no multi-clinic users and no PIN documents, so those paths are unused in production today. Role/status writes: `owner` or `clinic_admin` only. No write may set any role to `owner`.

## Playground matrix (emulator)

Harness: `scripts/rules-interim-playground.mjs`  
Command: `npx -y firebase-tools@latest emulators:exec --only firestore --project labflow-6cb9e "node scripts/rules-interim-playground.mjs"`  
Synthetic UIDs. Real clinic IDs from the 2026-08-22 census (MedicAid `AXpNONrWaoqcadFCjbrc`, Green Aid `pu0QdCHByieKUmRSlAtF`). No emails printed.

| # | Case | Expect | Result |
|---|---|---|---|
| 1 | Unauthenticated read patients | Deny | **PASS** |
| 2 | Unauthenticated read clinics | Deny | **PASS** |
| 3 | Unauthenticated read auditLogs | Deny | **PASS** |
| 4 | New user, no doc yet, create own `users/{uid}` | Allow | **PASS** |
| 5 | Pending, clinicId null, update own clinicId | Allow | **PASS** |
| 6 | Pending, update clinicId AND role | Deny | **PASS** |
| 7 | Approved user with clinic, change own clinicId | Deny | **PASS** |
| 8 | Any user, set own role owner | Deny | **PASS** |
| 9 | Technician clinic A, read patient clinic A | Allow | **PASS** |
| 10 | Technician clinic A, read patient clinic B | Deny | **PASS** |
| 11 | Owner, read patient any clinic | Allow | **PASS** |
| 12 | Any user, delete a patient | Deny | **PASS** |
| 13 | Any user, update an auditLogs entry | Deny | **PASS** |
| 14 | Signed-in, no clinic, query clinics by joinCode | Allow | **PASS** |

**14/14 passed** (2026-08-22, Firestore emulator v1.22.0, rules from this repo).

## Security-rules-auditor (before deploy)

```json
{
  "score": 3,
  "summary": "Interim lockdown denies unauthenticated access and isolates clinical documents by users/{uid}.clinicId, with isOwner() short-circuit for the owner whose clinicId is null. Self cannot mint owner. Signed-in clinics list is an intentional join disclosure. Clinical writes are clinic-scoped but not role-capability scoped.",
  "findings": [
    {
      "check": "Business Logic vs Rules",
      "severity": "moderate",
      "issue": "Any signed-in user can list all clinics and read joinCode (known disclosure pending R4).",
      "recommendation": "Do not close in this interim set. R4: Admin join only."
    },
    {
      "check": "Business Logic vs Rules",
      "severity": "moderate",
      "issue": "Any member of a clinic can write patients/orders/catalogue/inventory. The UI still enforces permissions.ts; a crafted client can skip it.",
      "recommendation": "R4 capability matrix. Out of scope for U1 lockdown."
    },
    {
      "check": "Authority Source",
      "severity": "moderate",
      "issue": "Role is read from users/{uid} via get(), not custom claims. A stolen session with a clinic_admin doc can assign staff roles (intended). Self cannot set role/owner.",
      "recommendation": "R4 claims. Do not add clinicRoles claims in this file."
    },
    {
      "check": "Storage Abuse",
      "severity": "minor",
      "issue": "No string/list size limits on clinical fields. Matching today's writers was required; strict schema would break the live app.",
      "recommendation": "Accept for interim."
    },
    {
      "check": "Field-Level vs Identity-Level",
      "severity": "minor",
      "issue": "Self update uses diff().affectedKeys() AND isSelf(uid). clinic_admin/owner staff writes are identity-gated.",
      "recommendation": "None for interim."
    },
    {
      "check": "The Update Bypass",
      "severity": "minor",
      "issue": "Owner/clinic_admin can change most user fields except promoting anyone to owner. pinSet and setActiveClinic self-writes are denied.",
      "recommendation": "Documented. No PIN or multi-clinic users in the census."
    }
  ]
}
```

No critical finding contradicts the U1 spec. The clinics disclosure was left open on purpose.

## Live re-verification

| Check | Result |
|---|---|
| MCP environment | Project `labflow-6cb9e` active. **Authenticated User: none.** Gemini ToS not accepted. Server status `ready`. |
| MCP `firebase_deploy` `only=firestore:rules` | **Failed.** `The user is not currently logged into the Firebase CLI, which is required to use this tool.` Asked to run `firebase_login` or configure ADC. **Did not start a new login** (would invalidate parent session `73A76`). |
| MCP `firebase_get_security_rules` | **Failed.** Same not-logged-in error. Live rules snapshot for revert still unavailable. |
| MCP `firebase_validate_security_rules` | **Failed.** Same not-logged-in error (tool still requires CLI auth). |
| CLI `firebase deploy --only firestore:rules` | **Not run** (login reserved for parent session). |
| Unauthenticated client probe | **Not run** — production still treated as open. |
| Playground with census UIDs against live rules | **Not run** |
| Live authenticated browser loop | **Manual remaining** |
| Green Aid seed (U2) | **Not started** — gated on deploy + failing unauth probe |

Do **not** treat the working-tree file as live. Production Firestore is still world-readable until a logged-in deploy succeeds.

## Revert

If the signed-in app breaks after deploy:

1. Firebase Console → Firestore → Rules → **Rules history** (or MCP `firebase_get_security_rules` / releases) → restore the previous release.
2. Or redeploy a saved copy of the pre-U1 rules text (the census could not download it; it behaved like open read or a dated `request.time` allow).
3. Record the revert in this file: who, when, which release, why.

This session **did not revert** (nothing was deployed).

## Files

| Path | Role |
|---|---|
| `firestore.rules` | Interim ruleset |
| `firebase.json` | Points at that file; emulator port 8080 |
| `.firebaserc` | Default project `labflow-6cb9e` |
| `scripts/rules-interim-playground.mjs` | 14-row emulator matrix |

Nothing committed. U2 (Green Aid seed) must not start until deploy is done and the unauthenticated probe fails.
