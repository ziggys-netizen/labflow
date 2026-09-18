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

/**
 * How often a screen held up by an unreachable server nudges the connection.
 * A nudge restarts Firestore's connection attempt; it does not reset the screen,
 * because the listener that clears the message is still attached.
 */
export const RECONNECT_RETRY_MS = 10_000;

/** The browser says it is online, yet nothing has come back from the server. */
export const CONNECTING_SLOWLY =
  "Connecting to the server is taking longer than usual. LabFlow keeps trying by itself, or you can press Retry.";

/** Truly offline, on a device that has never signed in, so nothing is cached. */
export const OFFLINE_FIRST_SIGN_IN =
  "This device is offline and has not signed in to LabFlow before. Connect to the internet once to sign in. After that it can work offline.";

/**
 * What to say when the server has not answered in time. `online` is the
 * browser's own view. It stays true on a network that is connected but
 * holding traffic back, which is the slow case, not the offline one: telling
 * someone who is connected to "sign in while connected" sends them looking for
 * a problem they do not have.
 */
export function unreachableMessage(online: boolean): string {
  return online ? CONNECTING_SLOWLY : OFFLINE_FIRST_SIGN_IN;
}
