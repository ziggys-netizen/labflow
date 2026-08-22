/**
 * LabFlow's own IndexedDB write log.
 *
 * Firestore's latency-compensated cache applies writes immediately and only
 * reports rejection later. This store is how we remember what this device
 * initiated, confirm it, or surface a rejection that survives refresh.
 */

export type WriteOperation = "create" | "update" | "delete" | "batch";
export type WriteStatus = "pending" | "rejected";

export interface TrackedWrite {
  id: string;
  status: WriteStatus;
  operation: WriteOperation;
  collection: string;
  documentId: string;
  timestamp: string;
  actorUid: string;
  actorLabel: string;
  clinicId?: string | null;
  patientName?: string | null;
  patientLabId?: string | null;
  orderId?: string | null;
  summary: string;
  expected?: Record<string, unknown> | null;
  wroteWhileOffline: boolean;
  rejectedAt?: string;
  reason?: string;
  permissionChanged?: boolean;
}

export type NewTrackedWrite = Omit<TrackedWrite, "id" | "status" | "timestamp"> & {
  id?: string;
  timestamp?: string;
};

const DB_NAME = "labflow-sync";
const DB_VERSION = 1;
const STORE = "writes";

const memory = new Map<string, TrackedWrite>();
const listeners = new Set<() => void>();

function notify() {
  listeners.forEach((cb) => cb());
}

export function subscribeWriteQueue(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function newId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") {
    return crypto.randomUUID();
  }
  return `w-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function openDb(): Promise<IDBDatabase | null> {
  if (typeof indexedDB === "undefined") return Promise.resolve(null);
  return new Promise((resolve) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      req.onupgradeneeded = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE)) {
          db.createObjectStore(STORE, { keyPath: "id" });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function idbPut(entry: TrackedWrite): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).put(entry);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbDelete(id: string): Promise<void> {
  const db = await openDb();
  if (!db) return;
  await new Promise<void>((resolve) => {
    try {
      const tx = db.transaction(STORE, "readwrite");
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    } catch {
      resolve();
    }
  });
}

async function idbGetAll(): Promise<TrackedWrite[]> {
  const db = await openDb();
  if (!db) return [];
  return new Promise((resolve) => {
    try {
      const tx = db.transaction(STORE, "readonly");
      const req = tx.objectStore(STORE).getAll();
      req.onsuccess = () => resolve((req.result as TrackedWrite[]) || []);
      req.onerror = () => resolve([]);
    } catch {
      resolve([]);
    }
  });
}

let hydrated = false;

export async function hydrateWriteQueue(): Promise<void> {
  if (hydrated) return;
  hydrated = true;
  const rows = await idbGetAll();
  memory.clear();
  for (const row of rows) memory.set(row.id, row);
  notify();
}

export function listTrackedWrites(): TrackedWrite[] {
  return [...memory.values()].sort((a, b) => (a.timestamp < b.timestamp ? 1 : -1));
}

export function pendingWrites(): TrackedWrite[] {
  return listTrackedWrites().filter((w) => w.status === "pending");
}

export function rejectedWrites(): TrackedWrite[] {
  return listTrackedWrites().filter((w) => w.status === "rejected");
}

export async function enqueuePending(input: NewTrackedWrite): Promise<TrackedWrite> {
  const entry: TrackedWrite = {
    ...input,
    id: input.id || newId(),
    status: "pending",
    timestamp: input.timestamp || new Date().toISOString(),
  };
  memory.set(entry.id, entry);
  await idbPut(entry);
  notify();
  return entry;
}

export async function markConfirmed(id: string): Promise<void> {
  if (!memory.has(id)) return;
  memory.delete(id);
  await idbDelete(id);
  notify();
}

export async function markRejected(
  id: string,
  reason: string,
  permissionChanged = false
): Promise<void> {
  const current = memory.get(id);
  if (!current || current.status === "rejected") return;
  const next: TrackedWrite = {
    ...current,
    status: "rejected",
    rejectedAt: new Date().toISOString(),
    reason,
    permissionChanged,
  };
  memory.set(id, next);
  await idbPut(next);
  notify();
}

export async function acknowledgeRejection(id: string): Promise<void> {
  const current = memory.get(id);
  if (!current || current.status !== "rejected") return;
  memory.delete(id);
  await idbDelete(id);
  notify();
}

export function expectedMatches(
  data: Record<string, unknown> | undefined,
  expected: Record<string, unknown> | null | undefined
): boolean {
  if (!expected || !data) return true;
  for (const [key, value] of Object.entries(expected)) {
    if (JSON.stringify(data[key] ?? null) !== JSON.stringify(value ?? null)) return false;
  }
  return true;
}
