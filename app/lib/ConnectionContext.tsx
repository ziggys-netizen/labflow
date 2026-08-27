"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { disableNetwork, enableNetwork, type SnapshotMetadata } from "firebase/firestore";
import { db, getPersistenceState, type PersistenceState } from "./firebase";
import { useAuth } from "./AuthContext";
import { forceTokenRefresh } from "./authApi";
import { setFirestoreMetaListener, setLastKnownOnline } from "./firestoreConnectivity";
import {
  acknowledgeRejection,
  hydrateWriteQueue,
  pendingWrites,
  rejectedWrites,
  subscribeWriteQueue,
  type TrackedWrite,
} from "./writeQueue";

type ConnectionContextType = {
  isOnline: boolean;
  pendingWriteCount: number;
  syncing: boolean;
  rejected: TrackedWrite[];
  persistenceAvailable: boolean;
  persistenceReason: string | null;
  acknowledge: (id: string) => Promise<void>;
};

const ConnectionContext = createContext<ConnectionContextType>({
  isOnline: true,
  pendingWriteCount: 0,
  syncing: false,
  rejected: [],
  persistenceAvailable: false,
  persistenceReason: null,
  acknowledge: async () => {},
});

const CACHE_ONLY_GRACE_MS = 2500;
const SSR_PERSISTENCE: PersistenceState = { available: false, reason: null };

function subscribePersistence() {
  return () => {};
}

export function ConnectionProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const [isOnline, setIsOnline] = useState(true);
  const [pending, setPending] = useState<TrackedWrite[]>([]);
  const [rejected, setRejected] = useState<TrackedWrite[]>([]);
  const [latestHasPendingWrites, setLatestHasPendingWrites] = useState(false);
  const persistence = useSyncExternalStore(
    subscribePersistence,
    getPersistenceState,
    () => SSR_PERSISTENCE
  );
  const sawServerRef = useRef(false);
  const cacheTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const refreshingRef = useRef(false);
  const wasOfflineRef = useRef(false);
  const lastTokenRefreshRef = useRef(0);

  const refreshQueue = useCallback(() => {
    setPending(pendingWrites());
    setRejected(rejectedWrites());
  }, []);

  useEffect(() => {
    void hydrateWriteQueue().then(refreshQueue);
    return subscribeWriteQueue(refreshQueue);
  }, [refreshQueue]);

  useEffect(() => {
    function ingest(meta: SnapshotMetadata) {
      if (refreshingRef.current) return;
      setLatestHasPendingWrites(meta.hasPendingWrites);
      if (!meta.fromCache) {
        sawServerRef.current = true;
        if (cacheTimerRef.current) {
          clearTimeout(cacheTimerRef.current);
          cacheTimerRef.current = null;
        }
        setIsOnline(true);
        return;
      }
      if (sawServerRef.current) {
        setIsOnline(false);
        return;
      }
      if (!cacheTimerRef.current) {
        cacheTimerRef.current = setTimeout(() => {
          if (!sawServerRef.current) setIsOnline(false);
          cacheTimerRef.current = null;
        }, CACHE_ONLY_GRACE_MS);
      }
    }

    setFirestoreMetaListener(ingest);
    return () => {
      setFirestoreMetaListener(null);
      if (cacheTimerRef.current) clearTimeout(cacheTimerRef.current);
    };
  }, []);

  useEffect(() => {
    setLastKnownOnline(isOnline);
  }, [isOnline]);

  const refreshToken = useCallback(async () => {
    if (!user) return;
    const now = Date.now();
    if (now - lastTokenRefreshRef.current < 4000) return;
    lastTokenRefreshRef.current = now;
    refreshingRef.current = true;
    try {
      await disableNetwork(db);
      await forceTokenRefresh();
    } catch {
      // Token refresh can fail if the session is gone; still re-enable the network.
    } finally {
      try {
        await enableNetwork(db);
      } catch {
        // Firestore will retry on its own.
      }
      refreshingRef.current = false;
    }
  }, [user]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const onOnline = () => {
      void refreshToken();
    };
    window.addEventListener("online", onOnline);
    return () => window.removeEventListener("online", onOnline);
  }, [refreshToken]);

  useEffect(() => {
    if (wasOfflineRef.current && isOnline) {
      void refreshToken();
    }
    wasOfflineRef.current = !isOnline;
  }, [isOnline, refreshToken]);

  const pendingWriteCount = Math.max(
    pending.length,
    !isOnline && latestHasPendingWrites ? 1 : 0
  );
  const syncing = isOnline && pendingWriteCount > 0;

  const acknowledge = useCallback(async (id: string) => {
    await acknowledgeRejection(id);
    refreshQueue();
  }, [refreshQueue]);

  const value = useMemo(
    () => ({
      isOnline,
      pendingWriteCount,
      syncing,
      rejected,
      persistenceAvailable: persistence.available,
      persistenceReason: persistence.reason,
      acknowledge,
    }),
    [
      isOnline,
      pendingWriteCount,
      syncing,
      rejected,
      persistence.available,
      persistence.reason,
      acknowledge,
    ]
  );

  return <ConnectionContext.Provider value={value}>{children}</ConnectionContext.Provider>;
}

export function useConnection() {
  return useContext(ConnectionContext);
}

export function SyncStatus() {
  const {
    isOnline,
    pendingWriteCount,
    syncing,
    rejected,
    persistenceAvailable,
    persistenceReason,
    acknowledge,
  } = useConnection();
  const [panelOpen, setPanelOpen] = useState(false);

  const changeLabel =
    pendingWriteCount === 1 ? "1 change waiting to sync" : `${pendingWriteCount} changes waiting to sync`;

  const showBar = !persistenceAvailable && !!persistenceReason;
  const showOffline = !isOnline;
  const showProblems = rejected.length > 0;

  if (!showBar && !showOffline && !syncing && !showProblems) return null;

  return (
    <>
      {(showBar || showOffline) && (
        <div className="no-print border-t border-amber-200 bg-amber-50 px-6 py-2">
          <div className="max-w-5xl mx-auto text-sm text-amber-950 flex flex-wrap items-center gap-x-4 gap-y-1">
            {showBar && <p>{persistenceReason}</p>}
            {showOffline && (
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                className="underline-offset-2 hover:underline text-left"
              >
                Offline — {changeLabel}
              </button>
            )}
          </div>
        </div>
      )}
      {(syncing || showProblems) && (
        <div className="no-print px-6 py-1">
          <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-end gap-3 text-xs">
            {syncing && <span className="text-gray-500">Syncing…</span>}
            {showProblems && (
              <button
                type="button"
                onClick={() => setPanelOpen(true)}
                className="text-red-700 font-medium hover:underline"
              >
                Sync problems ({rejected.length})
              </button>
            )}
          </div>
        </div>
      )}
      {panelOpen && (
        <div className="no-print fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 px-4 py-8">
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby="sync-problems-title"
            className="w-full max-w-lg rounded-lg bg-white p-6 shadow-lg max-h-[80vh] overflow-y-auto"
          >
            <h2 id="sync-problems-title" className="text-lg font-semibold text-gray-900">
              Sync problems
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              A rejected write means someone believes work is recorded that is not. These stay until
              they are acknowledged.
            </p>
            {rejected.length === 0 && pendingWriteCount > 0 && (
              <p className="mt-4 text-sm text-gray-700">
                {changeLabel}. They will clear when the server confirms them.
              </p>
            )}
            {rejected.length === 0 && pendingWriteCount === 0 && (
              <p className="mt-4 text-sm text-gray-600">No rejected changes on this device.</p>
            )}
            <ul className="mt-4 space-y-3">
              {rejected.map((item) => (
                <li key={item.id} className="border border-red-100 rounded-lg p-3">
                  <p className="text-sm font-medium text-gray-900">{item.summary}</p>
                  <p className="text-xs text-gray-500 mt-1">
                    {item.collection}/{item.documentId}
                    {item.patientName ? ` · ${item.patientName}` : ""}
                    {item.patientLabId ? ` (${item.patientLabId})` : ""}
                    {item.orderId && item.collection !== "orders" ? ` · order ${item.orderId}` : ""}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(item.timestamp).toLocaleString()}
                    {item.actorLabel ? ` · ${item.actorLabel}` : ""}
                  </p>
                  {item.reason && <p className="text-sm text-red-800 mt-2">{item.reason}</p>}
                  <button
                    type="button"
                    onClick={() => void acknowledge(item.id)}
                    className="mt-3 text-sm font-medium text-gray-900 underline"
                  >
                    Acknowledge
                  </button>
                </li>
              ))}
            </ul>
            <div className="mt-5 flex justify-end">
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
