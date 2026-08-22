import type { SnapshotMetadata } from "firebase/firestore";

type MetaListener = (meta: SnapshotMetadata) => void;

let metaListener: MetaListener | null = null;
let lastOnline = true;

export function setFirestoreMetaListener(listener: MetaListener | null) {
  metaListener = listener;
}

export function reportFirestoreMetadata(meta: SnapshotMetadata) {
  metaListener?.(meta);
}

export function setLastKnownOnline(online: boolean) {
  lastOnline = online;
}

export function lastKnownOnline() {
  return lastOnline;
}
