import { doc, runTransaction } from "firebase/firestore";
import { db } from "./firebase";

/**
 * Application identity layer.
 *
 * Firebase Auth stays the authentication identity (email) and the Firebase UID
 * stays the stable key that authorisation and audit records are resolved from.
 * A username is a display label only — nothing is ever authorised because of it.
 */

export const USERNAME_MIN_LENGTH = 3;
export const USERNAME_MAX_LENGTH = 20;

export const USERNAME_RULES =
  "3–20 characters, lowercase letters, numbers, dots and underscores. Must start with a letter and cannot end with, or repeat, a dot or underscore.";

/** Letter first, then alphanumeric groups joined by single dots or underscores. */
const USERNAME_PATTERN = /^[a-z][a-z0-9]*(?:[._][a-z0-9]+)*$/;

/**
 * Names that would let a username impersonate the platform or a role. Blocking
 * them is a phishing precaution, not an authorisation control.
 */
const RESERVED_USERNAMES = new Set([
  "admin",
  "administrator",
  "clinic_admin",
  "clinicadmin",
  "help",
  "labflow",
  "intern",
  "lab_manager",
  "labmanager",
  "lab_supervisor",
  "labsupervisor",
  "moderator",
  "null",
  "owner",
  "root",
  "security",
  "staff",
  "storekeeper",
  "stockkeeper",
  "superuser",
  "support",
  "system",
  "technician",
  "technician_assistant",
  "technicianassistant",
  "undefined",
]);

export function normalizeUsername(raw: string | null | undefined): string {
  return (raw ?? "").trim().toLowerCase();
}

export interface UsernameCheck {
  ok: boolean;
  value: string;
  error: string | null;
}

export function validateUsername(raw: string | null | undefined): UsernameCheck {
  const value = normalizeUsername(raw);
  if (!value) return { ok: false, value, error: "Enter a username." };
  if (value.length < USERNAME_MIN_LENGTH) {
    return { ok: false, value, error: `Usernames are at least ${USERNAME_MIN_LENGTH} characters.` };
  }
  if (value.length > USERNAME_MAX_LENGTH) {
    return { ok: false, value, error: `Usernames are at most ${USERNAME_MAX_LENGTH} characters.` };
  }
  if (!USERNAME_PATTERN.test(value)) {
    return { ok: false, value, error: USERNAME_RULES };
  }
  if (RESERVED_USERNAMES.has(value)) {
    return { ok: false, value, error: "That username is reserved. Choose another." };
  }
  return { ok: true, value, error: null };
}

export class UsernameTakenError extends Error {
  constructor(username: string) {
    super(`The username "${username}" is already in use.`);
    this.name = "UsernameTakenError";
  }
}

/**
 * Claims a username globally by writing `usernames/{username}` inside a
 * transaction, so two people submitting the same name at the same time cannot
 * both succeed. Note this is only as strong as the client: Firestore security
 * rules do not exist yet (PRD section 10), so the reservation is advisory until
 * they are written and deployed.
 */
export async function claimUsername(params: {
  uid: string;
  username: string;
  previousUsername?: string | null;
}): Promise<string> {
  const check = validateUsername(params.username);
  if (!check.ok) throw new Error(check.error ?? "Invalid username.");

  const next = check.value;
  const previous = normalizeUsername(params.previousUsername);
  const userRef = doc(db, "users", params.uid);
  const nextRef = doc(db, "usernames", next);
  const now = new Date().toISOString();

  await runTransaction(db, async (tx) => {
    const nextSnap = await tx.get(nextRef);
    if (nextSnap.exists() && nextSnap.data()?.uid !== params.uid) {
      throw new UsernameTakenError(next);
    }
    // Firestore requires every read before the first write in a transaction.
    const previousSnap =
      previous && previous !== next ? await tx.get(doc(db, "usernames", previous)) : null;

    tx.set(nextRef, { uid: params.uid, username: next, updatedAt: now });
    if (previousSnap?.exists() && previousSnap.data()?.uid === params.uid) {
      tx.delete(previousSnap.ref);
    }
    tx.set(userRef, { username: next, usernameUpdatedAt: now }, { merge: true });
  });

  return next;
}

/**
 * Who performed an action. The UID is the traceable key; the username and email
 * are snapshots kept so a record still reads sensibly if either later changes.
 */
export interface ActorStamp {
  uid: string;
  username: string | null;
  email: string | null;
}

export function makeActorStamp(
  user: { uid: string; email: string | null },
  username: string | null
): ActorStamp {
  return { uid: user.uid, username: username ?? null, email: user.email ?? null };
}

/** Lets older records that stored a bare email string resolve to a username. */
export interface IdentityDirectory {
  byUid: Record<string, string>;
  byEmail: Record<string, string>;
}

export function buildIdentityDirectory(
  people: { uid: string; email?: string | null; username?: string | null }[]
): IdentityDirectory {
  const byUid: Record<string, string> = {};
  const byEmail: Record<string, string> = {};
  for (const person of people) {
    if (!person.username) continue;
    byUid[person.uid] = person.username;
    if (person.email) byEmail[person.email.toLowerCase()] = person.username;
  }
  return { byUid, byEmail };
}

/** Human-readable identity for a stamp, a legacy email string, or nothing. */
export function actorLabel(
  actor: ActorStamp | string | null | undefined,
  directory?: IdentityDirectory
): string {
  if (!actor) return "—";
  if (typeof actor === "string") {
    const trimmed = actor.trim();
    if (!trimmed) return "—";
    return directory?.byEmail[trimmed.toLowerCase()] ?? directory?.byUid[trimmed] ?? trimmed;
  }
  if (actor.username) return actor.username;
  const resolved = directory?.byUid[actor.uid];
  if (resolved) return resolved;
  if (actor.email) return directory?.byEmail[actor.email.toLowerCase()] ?? actor.email;
  return actor.uid;
}

/** Reads an actor stamp back out of Firestore data, tolerating older shapes. */
export function readActorStamp(value: unknown): ActorStamp | string | null {
  if (!value) return null;
  if (typeof value === "string") return value;
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.uid === "string") {
      return {
        uid: record.uid,
        username: typeof record.username === "string" ? record.username : null,
        email: typeof record.email === "string" ? record.email : null,
      };
    }
  }
  return null;
}
