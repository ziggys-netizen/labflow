import { initializeApp, getApps, getApp, type FirebaseApp } from "firebase/app";
import {
  initializeFirestore,
  getFirestore,
  persistentLocalCache,
  persistentMultipleTabManager,
  memoryLocalCache,
  type Firestore,
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

function createFirestore(firebaseApp: FirebaseApp): Firestore {
  const canUseIndexedDb = typeof window !== "undefined" && typeof indexedDB !== "undefined";

  if (canUseIndexedDb) {
    try {
      const db = initializeFirestore(firebaseApp, {
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
    return initializeFirestore(firebaseApp, { localCache: memoryLocalCache() });
  } catch (err) {
    if (isAlreadyStarted(err)) return getFirestore(firebaseApp);
    return getFirestore(firebaseApp);
  }
}

export const db = createFirestore(app);
export const auth = getAuth(app);
export const storage = getStorage(app);
export const googleProvider = new GoogleAuthProvider();

export function getPersistenceState(): PersistenceState {
  return persistenceState;
}
