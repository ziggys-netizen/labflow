# S1 — Offline foundation

**Date:** 21 August 2026  
**Branch:** `wip/inventory-and-migration`  
**Installed client SDK:** `firebase@12.17.1` (`@firebase/firestore@4.17.0`)

This note is the investigation report (Part 0), the design, and the acceptance matrix. Network was not fully browser-tested here.

---

## Persistence API (installed version)

`enableIndexedDbPersistence` and `enableMultiTabIndexedDbPersistence` are **deprecated** in this SDK. The types say they will be removed in a future major release. The current API is `initializeFirestore` with `FirestoreSettings.localCache`.

Configured in `app/lib/firebase.ts`:

```ts
initializeFirestore(app, {
  localCache: persistentLocalCache({
    tabManager: persistentMultipleTabManager(),
  }),
});
```

- Browser + IndexedDB available → persistent cache, multi-tab.
- Init throws (private browsing, storage denied, Node/SSR) → `memoryLocalCache()` / `getFirestore`. The app still runs online.
- Persistence failure copy: *“Offline support is unavailable on this device. The app still works while you are online.”* Shown from the nav via `SyncStatus`.
- Admin SDK (`app/lib/firebaseAdmin.ts`) is unchanged and stays server-only. Persistence is client-only.
- Sign-in remains popup only. `signInWithRedirect` is not used.

---

## Part 0 — Investigation (before the change)

### Write failures

No screen had a designed rejection path. Failed writes were `console.error` plus, on some forms, a status string or `alert`. Awaiting `setDoc` / `addDoc` also **hangs while offline**, because those promises wait for the server.

### `getDoc` / `getDocs` call sites (current tree)

Converted to `onSnapshot` (via `subscribeClinicCollection` / `subscribeDocument`) for list/detail screens that need sync state. Remaining one-shot reads are listed as left alone.

| File | Lines | Notes |
|---|---|---|
| `app/lib/clinicScope.ts` | 103, 118, 123 | Shared `getClinicDocs` / `loadClinicNames` — still one-shot for callers that are not live lists |
| `app/lib/AuthContext.tsx` | 148, 201 | Bootstrap `users/{uid}` then `onSnapshot`; acting-clinic name |
| `app/lib/clinics.ts` | 42, 48, 65, 114 | Clinic lookup, join-code query, orphan scan |
| `app/lib/staffOps.ts` | 145–151 | Staff lists |
| `app/lib/catalogSeed.ts` | 32 | Seed existence check (S2) |
| `app/lib/preApprovals.ts` | 55 | S3 list (not this prompt) |
| `app/lib/patientSoftDelete.ts` | 33 | `getClinicDocs("orders")` on delete/restore path |
| `app/patients/page.tsx` | 168 | One-shot `getDoc` before toggling sample collection |
| `app/patients/[patientId]/print/page.tsx` | 103, 120–124 | Print view — **left one-shot**; now also reads `metadata.hasPendingWrites` |
| `app/patients/deleted/page.tsx` | 38 | Recycle bin via `getClinicDocs` |
| `app/register/page.tsx` | 265, 276 | Duplicate check — **left one-shot** |
| `app/orders/new/[patientId]/page.tsx` | 49, 81, 107 | Patient + pending orders + catalogue for the form |
| `app/orders/[orderId]/page.tsx` | 100 | Catalogue only; **order document is now a listener** |
| `app/inventory/items/page.tsx` | 108 | Catalogue dropdown via `getClinicDocs` |
| `app/settings/page.tsx` | 53 | Catalogue editor |
| `app/lib/CatalogReviewBanner.tsx` | 24, 32 | S2 banner |
| `app/owner/page.tsx` | 148, 150 | Assign clinic admin by email |
| `app/owner/clinics/[clinicId]/migration/page.tsx` | 347, 403, 441, 551, 966, 1049 | Import / legacy scan |

`/review` does not exist. Not built in S1.

---

## Screens converted to listeners

| Route | How |
|---|---|
| `/patients` | `useClinicCollection` on `patients` and `orders` |
| `/orders` | `useClinicCollection` on `orders` |
| `/orders/[orderId]` | `subscribeDocument` on the order; catalogue stays one-shot |
| `/dashboard` | `useClinicCollection` on `orders` and `patients` |
| `/inventory` | listeners on items, batches, movements, specimens |
| `/inventory/items` | listener on items; catalogue dropdown one-shot |
| `/inventory/movements` | listeners on items, batches, movements |
| `/inventory/specimens` | listener on specimen movements |
| `/review` | **absent** — not created |

Rows with `snapshot.metadata.hasPendingWrites` show an unobtrusive **Not yet synced** marker.

Connection state (`isOnline`, `pendingWriteCount`) lives in `app/lib/ConnectionContext.tsx`. Online/offline is taken from Firestore snapshot `metadata.fromCache` (with a short grace period so the first cache snapshot is not treated as offline). **Not** `navigator.onLine`. `navigator` `online` is used only as a cue to `getIdToken(true)` before Firestore flushes.

`AppNav`:

- Online, nothing pending: no extra chrome
- Offline: *“Offline — {n} changes waiting to sync”*
- Syncing: transient “Syncing…”
- Rejections: “Sync problems (n)” → panel

`ConnectionProvider` is wired in `app/layout.tsx` through the client `Providers` boundary (`AuthProvider` → `ConnectionProvider`).

---

## Write-queue design

LabFlow IndexedDB: database `labflow-sync`, store `writes`.

Each locally initiated clinical write is recorded **before** the Firestore call:

- operation, collection, document ID, timestamp, actor (uid + label)
- optional clinic / patient / order context and a short summary
- optional `expected` field subset used to confirm the document after sync
- `wroteWhileOffline` so a later `permission-denied` can be explained

Confirmation:

1. The Firestore write promise resolves → entry cleared (server accepted).
2. A listener snapshot with `hasPendingWrites === false` and matching `expected` → cleared.
3. Promise rejects, or a server snapshot shows the write gone without matching `expected` → **rejected**.

Rejections are written back to the same IndexedDB store. They survive refresh. They leave the panel only via **Acknowledge**.

If IndexedDB itself is unavailable, the queue stays in memory for the session (same devices that cannot persist Firestore). The persistence banner already says offline support is unavailable.

Writes that still go through this wrapper: patient register, order create, sample collection, results submit, soft-delete/restore, inventory item/movement/specimen. Approve/send-back are tracked too but are disabled while offline so they should not queue.

Owner/staff/join/settings/migration writes are unchanged (not the clinical loop this prompt is about).

### Stale claims (Part 6)

On browser `online`, and when Firestore goes from cache-only to a server snapshot after being offline: `disableNetwork` → `getIdToken(true)` → `enableNetwork`, so the queued mutations should flush with a fresh token.

`permission-denied` after an offline write shows: *“Your permissions changed while you were offline. These changes were not saved.”*

---

## Forbidden offline, and why

| Action | Offline behaviour | Why |
|---|---|---|
| Approve / send-back | Disabled. *“Results can only be released when online.”* | Release is a decision. A queued approval can be rejected after a report has already been acted on. |
| Print of an **approved** result with `hasPendingWrites` | Refused on `/patients/[patientId]/print`. No `window.print()`. | Last line of defence against a printed report that is not in the database. |

Everything else on the converted screens — register, order, collection, results entry, stock — works offline and syncs later. Those are records of things that physically happened.

A previously synced approved result in the persistent cache (`hasPendingWrites === false`) may still be printed while offline: that approval already reached the server.

---

## Acceptance matrix

| # | Criterion | Status | Evidence |
|---|---|---|---|
| 1 | Network disabled in DevTools: patients, orders, results load from cache | **needs-browser** | Listeners + persistent cache are wired. Requires a prior online visit to populate IndexedDB, then DevTools offline. |
| 2 | Register a patient offline: appears immediately, marked not synced | **code-complete** | `trackedAddDoc` does not wait for the server; `/patients` listener shows `hasPendingWrites`. Confirm in a browser. |
| 3 | Reconnect syncs and clears the marker | **code-complete** | Promise resolve + snapshot `hasPendingWrites false` clear the queue and marker. Confirm in a browser. |
| 4 | Rules-rejected write appears in Sync problems and survives refresh | **code-complete** | IDB `rejected` status; panel only clears on Acknowledge. Needs a real rules rejection (or a test account) to prove. |
| 5 | Approve disabled offline with the explanation | **pass** (code) | Buttons `disabled={!isOnline}` plus the exact sentence. `isOnline` is Firestore `fromCache`, not `navigator.onLine`. |
| 6 | Printing an unsynced approved result is refused | **pass** (code) | Print view checks approved docs’ `metadata.hasPendingWrites` and blocks auto-print. |
| 7 | Status indicator reflects Firestore reachability, not `navigator.onLine` | **code-complete** | Derived from snapshot metadata. Captive-portal / blackhole needs a human. |
| 8 | Two tabs do not break persistence | **code-complete** | `persistentMultipleTabManager()`. Open two tabs and write in one. |
| 9 | Private browsing degrades to online-only with a clear message | **code-complete** | Init catch + banner. Confirm in a private window. |

### Verified in code (this session)

- Persistence API matches installed `firebase@12.17.1` types.
- Client `initializeFirestore` + multi-tab persistent cache, with memory fallback.
- Converted screens listed above; `/review` not invented.
- Write queue + Sync problems panel + acknowledgement.
- Approve/send-back gated on Firestore online state.
- Print gated on pending writes for approved results.
- Token refresh on reconnect.
- `npx tsc --noEmit`: clean after a one-token fix of `app/lib/permissions.test.ts` (S4 had `from "./permissions.ts"`, which this `tsconfig` rejects). No other S1 type errors.
- ESLint on S1 files: clean. Full `npm run lint` currently fails in S2 `CatalogReviewBanner.tsx` and S3 `PreApprovalsPanel.tsx` (`setState` in `useEffect`) — not introduced here.
- `npm run build`: succeeded. API routes (`/api/auth/claims/sync`, `/api/join/*`) stayed dynamic; admin SDK was not initialized at build time.

### Needs a human in a browser

1. DevTools offline after a warm cache: lists still render.
2. Register / order / stock while offline; marker; reconnect; marker clears.
3. Force a rules rejection (wrong clinic or stripped role) and refresh — Sync problems still there until Acknowledge.
4. Two tabs: write in A, see it in B, no persistence crash.
5. Private window: banner, app still works online, no crash.
6. Captive portal / DNS blackhole: indicator goes offline even if the browser thinks it is online.
7. Stay offline > 1 hour, change that user’s role, reconnect: rejected writes use the permissions-changed sentence.

Do not treat this as a substitute for that pass before relying on offline in a clinic.

---

## Out of scope (this task)

- S2–S7, R-series (join/claims), `/review` queue, Q6 TAT copy, intern patient-read rules, merge/push/deploy/commit.
