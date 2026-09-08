/**
 * Who performed an action. Pure helpers — no Firebase import — so inventory
 * and board tests can stamp actors without initializing Auth.
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
