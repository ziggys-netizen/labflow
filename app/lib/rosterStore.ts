/**
 * Roster documents and the local cache the PIN check reads offline.
 *
 * Queued clinical writes that sync outside a roster window are not rejected
 * here — Firestore rules do not evaluate the roster. Rejecting them would
 * lose a clinical record to a scheduling rule.
 */

import {
  addDoc,
  collection,
  deleteDoc,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  DEFAULT_BREAK_GLASS_MINUTES,
  DEFAULT_GRACE_MINUTES,
  activeBreakGlass,
  isIsoWeekday,
  parseRosterEntry,
  parseRosterException,
  parseRosterSession,
  type RosterEntry,
  type RosterException,
  type RosterPattern,
  type RosterSession,
  type WeekParity,
} from "./roster";

export { activeBreakGlass, parseRosterEntry, parseRosterException, parseRosterSession };

export type RosterCache = {
  entries: RosterEntry[];
  exceptions: RosterException[];
  sessions: RosterSession[];
  rosteringEnabled: boolean;
  rosterGraceMinutes: number;
  breakGlassMinutes: number;
  cachedAt: string;
};

function cacheKey(clinicId: string, exceptionUserUid?: string) {
  return exceptionUserUid
    ? `labflow.rosterCache.${clinicId}.u.${exceptionUserUid}`
    : `labflow.rosterCache.${clinicId}`;
}

export function emptyRosterCache(): RosterCache {
  return {
    entries: [],
    exceptions: [],
    sessions: [],
    rosteringEnabled: false,
    rosterGraceMinutes: DEFAULT_GRACE_MINUTES,
    breakGlassMinutes: DEFAULT_BREAK_GLASS_MINUTES,
    cachedAt: "",
  };
}

export function readRosterCache(clinicId: string, exceptionUserUid?: string): RosterCache | null {
  if (typeof window === "undefined" || !clinicId) return null;
  try {
    const raw = localStorage.getItem(cacheKey(clinicId, exceptionUserUid));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as RosterCache;
    if (!parsed || !Array.isArray(parsed.entries)) return null;
    return {
      entries: parsed.entries,
      exceptions: Array.isArray(parsed.exceptions) ? parsed.exceptions : [],
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
      rosteringEnabled: parsed.rosteringEnabled === true,
      rosterGraceMinutes:
        typeof parsed.rosterGraceMinutes === "number" ? parsed.rosterGraceMinutes : DEFAULT_GRACE_MINUTES,
      breakGlassMinutes:
        typeof parsed.breakGlassMinutes === "number" ? parsed.breakGlassMinutes : DEFAULT_BREAK_GLASS_MINUTES,
      cachedAt: typeof parsed.cachedAt === "string" ? parsed.cachedAt : "",
    };
  } catch {
    return null;
  }
}

export function writeRosterCache(clinicId: string, cache: RosterCache, exceptionUserUid?: string) {
  try {
    localStorage.setItem(cacheKey(clinicId, exceptionUserUid), JSON.stringify(cache));
  } catch {
    // quota
  }
}

async function loadCollection<T>(
  name: string,
  clinicId: string,
  parse: (id: string, data: Record<string, unknown>) => T | null,
  extra?: { field: string; value: string }
): Promise<T[]> {
  const clauses = [where("clinicId", "==", clinicId)];
  if (extra) clauses.push(where(extra.field, "==", extra.value));
  const snap = await getDocs(query(collection(db, name), ...clauses));
  return snap.docs
    .map((item) => parse(item.id, item.data() as Record<string, unknown>))
    .filter((row): row is T => row !== null);
}

export async function loadClinicRoster(clinicId: string, clinicMeta?: {
  rosteringEnabled?: boolean;
  rosterGraceMinutes?: number;
  breakGlassMinutes?: number;
  /** Non-managers must pass their Auth UID — leave/sick rows are not clinic-wide readable. */
  exceptionUserUid?: string;
}): Promise<RosterCache> {
  const exceptionScope = clinicMeta?.exceptionUserUid;
  const [entries, exceptions, sessions] = await Promise.all([
    loadCollection("rosterEntries", clinicId, parseRosterEntry),
    loadCollection(
      "rosterExceptions",
      clinicId,
      parseRosterException,
      exceptionScope ? { field: "userUid", value: exceptionScope } : undefined
    ),
    loadCollection("rosterSessions", clinicId, parseRosterSession),
  ]);
  const cache: RosterCache = {
    entries,
    exceptions,
    sessions,
    rosteringEnabled: clinicMeta?.rosteringEnabled === true,
    rosterGraceMinutes: clinicMeta?.rosterGraceMinutes ?? DEFAULT_GRACE_MINUTES,
    breakGlassMinutes: clinicMeta?.breakGlassMinutes ?? DEFAULT_BREAK_GLASS_MINUTES,
    cachedAt: new Date().toISOString(),
  };
  writeRosterCache(clinicId, cache, exceptionScope);
  return cache;
}

export type RosterEntryWrite = {
  clinicId: string;
  userUid: string;
  pattern: RosterPattern;
  weeksOfMonth: number[];
  weekParity: WeekParity | null;
  daysOfWeek: number[];
  startTime: string;
  endTime: string;
  graceMinutes: number;
  dates: string[];
  effectiveFrom: string;
  effectiveTo: string | null;
  createdByUid: string;
};

export async function createRosterEntry(input: RosterEntryWrite): Promise<string> {
  const daysOfWeek = input.daysOfWeek.filter(isIsoWeekday);
  const payload = {
    clinicId: input.clinicId,
    userUid: input.userUid,
    pattern: input.pattern,
    weeksOfMonth: input.weeksOfMonth,
    weekParity: input.weekParity,
    daysOfWeek,
    startTime: input.startTime,
    endTime: input.endTime,
    graceMinutes: input.graceMinutes,
    dates: input.dates,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo,
    createdByUid: input.createdByUid,
    createdAt: new Date().toISOString(),
  };
  const ref = await addDoc(collection(db, "rosterEntries"), payload);
  return ref.id;
}

export async function updateRosterEntry(id: string, input: RosterEntryWrite): Promise<void> {
  await updateDoc(doc(db, "rosterEntries", id), {
    userUid: input.userUid,
    pattern: input.pattern,
    weeksOfMonth: input.weeksOfMonth,
    weekParity: input.weekParity,
    daysOfWeek: input.daysOfWeek.filter(isIsoWeekday),
    startTime: input.startTime,
    endTime: input.endTime,
    graceMinutes: input.graceMinutes,
    dates: input.dates,
    effectiveFrom: input.effectiveFrom,
    effectiveTo: input.effectiveTo,
  });
}

export async function deleteRosterEntry(id: string): Promise<void> {
  await deleteDoc(doc(db, "rosterEntries", id));
}

export type RosterExceptionWrite = {
  clinicId: string;
  userUid: string;
  type: RosterException["type"];
  startsAt: string;
  endsAt: string;
  reasonCode: string | null;
  note: string | null;
  createdByUid: string;
};

export async function createRosterException(input: RosterExceptionWrite): Promise<string> {
  const payload = {
    ...input,
    createdAt: new Date().toISOString(),
  };
  const ref = await addDoc(collection(db, "rosterExceptions"), payload);
  return ref.id;
}

export async function deleteRosterException(id: string): Promise<void> {
  await deleteDoc(doc(db, "rosterExceptions", id));
}

export async function createBreakGlassSession(input: {
  clinicId: string;
  userUid: string;
  displayName: string;
  reasonCode: string;
  note: string | null;
  minutes: number;
  createdByUid: string;
}): Promise<RosterSession> {
  const startsAt = new Date();
  const endsAt = new Date(startsAt.getTime() + Math.max(15, input.minutes) * 60 * 1000);
  const payload = {
    clinicId: input.clinicId,
    userUid: input.userUid,
    displayName: input.displayName,
    reasonCode: input.reasonCode,
    note: input.note,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    createdByUid: input.createdByUid,
    createdAt: startsAt.toISOString(),
  };
  const ref = await addDoc(collection(db, "rosterSessions"), payload);
  return { id: ref.id, ...payload };
}
