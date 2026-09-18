import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  disableNetwork,
  enableNetwork,
  type Firestore,
  type FirestoreSettings,
} from "firebase/firestore";
import { getAuth, GoogleAuthProvider } from "firebase/auth";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

const app = getApps().length ? getApp() : initializeApp(firebaseConfig);

export type PersistenceState = {
  available: boolean;
  reason: string | null;
};

const OFFLINE_UNAVAILABLE =
  "Offline support is unavailable on this device. The app still works while you are online.";

let persistenceState: PersistenceState = { available: false, reason: null };

function errorText(err: unknown): string {
  if (err instanceof Error) return `${err.name} ${err.message}`;
  if (typeof err === "object" && err !== null && "code" in err) {
    return String((err as { code: unknown }).code);
  }
  return String(err);
}

function isAlreadyStarted(err: unknown): boolean {
  return /already been started|already been initialized/i.test(errorText(err));
}

/**
 * How Firestore talks to the server.
 *
 * By default the SDK opens a long-lived streaming connection and falls back to
 * long-polling only once it has noticed the stream is being held back. Mobile
 * carriers, hotspots and some proxies and antivirus hold streamed traffic
 * indefinitely, and that noticing is itself the wait: a tablet on such a
 * network sat on "cannot reach the server" for more than half a minute.
 * Forcing long-polling skips the detour. It costs some efficiency (each
 * response closes and is reopened), which a clinic's volume does not notice;
 * a lab that cannot connect notices at once.
 *
 * 25 seconds keeps each held request inside the cut-off common to buffering
 * proxies, which otherwise close it early and force a retry.
 */
const TRANSPORT: Pick<
  FirestoreSettings,
  "experimentalForceLongPolling" | "experimentalLongPollingOptions"
> = {
  experimentalForceLongPolling: true,
  experimentalLongPollingOptions: { timeoutSeconds: 25 },
};

function createFirestore(firebaseApp: FirebaseApp): Firestore {
  const canUseIndexedDb = typeof window !== "undefined" && typeof indexedDB !== "undefined";

  if (canUseIndexedDb) {
    try {
      const db = initializeFirestore(firebaseApp, {
        ...TRANSPORT,
        localCache: persistentLocalCache({
          tabManager: persistentMultipleTabManager(),
        }),
      });
      persistenceState = { available: true, reason: null };
      return db;
    } catch (err) {
      if (isAlreadyStarted(err)) {
        return getFirestore(firebaseApp);
      }
      persistenceState = { available: false, reason: OFFLINE_UNAVAILABLE };
    }
  }

  try {
    return initializeFirestore(firebaseApp, { ...TRANSPORT, localCache: memoryLocalCache() });
  } catch (err) {
    if (isAlreadyStarted(err)) return getFirestore(firebaseApp);
    return getFirestore(firebaseApp);
  }
}

export const db = createFirestore(app);

/**
 * Drop the current connection attempt and start a fresh one. After repeated
 * failures Firestore waits longer and longer between attempts (up to about a
 * minute), and re-listening does not shorten that wait; this does. Errors are
 * logged and swallowed: Firestore keeps retrying on its own either way.
 */
export async function reconnectFirestore(): Promise<void> {
  try {
    await disableNetwork(db);
  } catch (err) {
    console.error("Could not pause the Firestore connection", err);
  }
  try {
    await enableNetwork(db);
  } catch (err) {
    console.error("Could not restart the Firestore connection", err);
  }
}
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

/**
 * Browser isolation probes (Medic Aid vs Green Aid) reuse this Firestore client.
 * After Owner console “Seed Green Aid isolation fixtures”, the success report prints
 * greenAidPatientId for the Medic Aid staff getDoc probe (expect permission-denied).
 */
if (typeof window !== "undefined") {
  (window as Window & { __labflowDb?: Firestore }).__labflowDb = db;
}

export function getPersistenceState(): PersistenceState {
  return persistenceState;
}
