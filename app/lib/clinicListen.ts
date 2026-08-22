"use client";

import { useEffect, useState } from "react";
import {
  doc,
  onSnapshot,
  type DocumentSnapshot,
  type QueryDocumentSnapshot,
  type QueryConstraint,
  type Unsubscribe,
} from "firebase/firestore";
import { db } from "./firebase";
import { clinicCollectionQuery, sortQueryDocs } from "./clinicScope";
import { reportFirestoreMetadata } from "./firestoreConnectivity";
import {
  expectedMatches,
  markConfirmed,
  markRejected,
  pendingWrites,
} from "./writeQueue";

export function reconcileTrackedWrites(
  collectionName: string,
  snaps: Array<DocumentSnapshot | QueryDocumentSnapshot>,
  fromCache: boolean
) {
  const pending = pendingWrites().filter((w) => w.collection === collectionName);
  if (pending.length === 0) return;

  const byId = new Map(snaps.map((snap) => [snap.id, snap]));

  for (const write of pending) {
    const snap = byId.get(write.documentId);
    if (snap?.metadata.hasPendingWrites) continue;

    if (snap?.exists()) {
      if (expectedMatches(snap.data() as Record<string, unknown>, write.expected)) {
        void markConfirmed(write.id);
      } else if (!fromCache) {
        void markRejected(
          write.id,
          write.wroteWhileOffline
            ? "Your permissions changed while you were offline. These changes were not saved."
            : "This change was not saved.",
          write.wroteWhileOffline
        );
      }
      continue;
    }

    if (fromCache) continue;

    if (write.operation === "delete") {
      void markConfirmed(write.id);
    } else if (write.operation === "create") {
      void markRejected(
        write.id,
        write.wroteWhileOffline
          ? "Your permissions changed while you were offline. These changes were not saved."
          : "This change was not saved.",
        write.wroteWhileOffline
      );
    }
  }
}

export function subscribeClinicCollection(
  collectionName: string,
  role: string | null,
  clinicId: string | null,
  options: {
    filters?: QueryConstraint[];
    sortBy?: string;
    direction?: "asc" | "desc";
  },
  onNext: (
    docs: QueryDocumentSnapshot[],
    meta: { fromCache: boolean; hasPendingWrites: boolean }
  ) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  const q = clinicCollectionQuery(collectionName, role, clinicId, options.filters ?? []);
  return onSnapshot(
    q,
    { includeMetadataChanges: true },
    (snapshot) => {
      reportFirestoreMetadata(snapshot.metadata);
      const docs = sortQueryDocs(snapshot.docs, options.sortBy, options.direction);
      reconcileTrackedWrites(collectionName, docs, snapshot.metadata.fromCache);
      onNext(docs, {
        fromCache: snapshot.metadata.fromCache,
        hasPendingWrites: snapshot.metadata.hasPendingWrites,
      });
    },
    (err) => onError?.(err)
  );
}

export function subscribeDocument(
  collectionName: string,
  documentId: string,
  onNext: (snap: DocumentSnapshot) => void,
  onError?: (err: Error) => void
): Unsubscribe {
  return onSnapshot(
    doc(db, collectionName, documentId),
    { includeMetadataChanges: true },
    (snap) => {
      reportFirestoreMetadata(snap.metadata);
      reconcileTrackedWrites(collectionName, [snap], snap.metadata.fromCache);
      onNext(snap);
    },
    (err) => onError?.(err)
  );
}

export function useClinicCollection(
  collectionName: string,
  role: string | null,
  clinicId: string | null,
  options: {
    sortBy?: string;
    direction?: "asc" | "desc";
    enabled?: boolean;
  } = {}
) {
  const enabled = options.enabled !== false;
  const sortBy = options.sortBy;
  const direction = options.direction;
  const listenKey = `${collectionName}|${role ?? ""}|${clinicId ?? ""}|${sortBy ?? ""}|${direction ?? ""}|${enabled}`;

  const [docs, setDocs] = useState<QueryDocumentSnapshot[]>([]);
  const [error, setError] = useState("");
  const [fromCache, setFromCache] = useState(false);
  const [hasPendingWrites, setHasPendingWrites] = useState(false);
  const [activeKey, setActiveKey] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    const unsub = subscribeClinicCollection(
      collectionName,
      role,
      clinicId,
      { sortBy, direction },
      (next, meta) => {
        setDocs(next);
        setFromCache(meta.fromCache);
        setHasPendingWrites(meta.hasPendingWrites);
        setError("");
        setActiveKey(listenKey);
      },
      (err) => {
        setError(err.message);
        setActiveKey(listenKey);
      }
    );
    return unsub;
  }, [collectionName, role, clinicId, enabled, sortBy, direction, listenKey]);

  return {
    docs,
    loading: enabled && activeKey !== listenKey,
    error,
    fromCache,
    hasPendingWrites,
  };
}
