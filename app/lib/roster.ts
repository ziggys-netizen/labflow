/**
 * Rostered access windows (PRD §5.2.1).
 *
 * This is the same category of control as the PIN: attribution and deliberate
 * friction, not a security boundary. Recurrence is evaluated in application
 * code — never in Firestore rules — because rules cannot express these
 * patterns within the get() ceiling, and a device clock can be spoofed.
 *
 * Times are clinic wall-clock strings ("09:00"). The Gambia is UTC+0 with no
 * DST; wall-clock storage is what survives a later DST country. Do not store
 * these as UTC offsets.
 */

import { isShift, type Shift } from "./permissions";

export const DEFAULT_GRACE_MINUTES = 30;
export const DEFAULT_BREAK_GLASS_MINUTES = 120;
export const ROSTER_WARNING_MINUTES = [10, 2] as const;

export const ROSTER_PATTERNS = ["weekly", "fortnightly", "monthlyByWeek", "fixedDates"] as const;
export type RosterPattern = (typeof ROSTER_PATTERNS)[number];

export const WEEK_PARITIES = ["odd", "even"] as const;
export type WeekParity = (typeof WEEK_PARITIES)[number];

export const ROSTER_EXCEPTION_TYPES = ["leave", "sick", "swap", "extra"] as const;
export type RosterExceptionType = (typeof ROSTER_EXCEPTION_TYPES)[number];

export const ISO_WEEKDAYS = [1, 2, 3, 4, 5, 6, 7] as const;
export type IsoWeekday = (typeof ISO_WEEKDAYS)[number];

export const ISO_WEEKDAY_LABELS: Record<IsoWeekday, string> = {
  1: "Monday",
  2: "Tuesday",
  3: "Wednesday",
  4: "Thursday",
  5: "Friday",
  6: "Saturday",
  7: "Sunday",
};

export type RosterEntry = {
  id: string;
  clinicId: string;
  userUid: string;
  pattern: RosterPattern;
  weeksOfMonth: number[];
  weekParity: WeekParity | null;
  daysOfWeek: IsoWeekday[];
  startTime: string;
  endTime: string;
  graceMinutes: number;
  dates: string[];
  effectiveFrom: string;
  effectiveTo: string | null;
  createdByUid: string;
  createdAt: string;
};

export type RosterException = {
  id: string;
  clinicId: string;
  userUid: string;
  type: RosterExceptionType;
  startsAt: string;
  endsAt: string;
  reasonCode: string | null;
  note: string | null;
  createdByUid: string;
  createdAt: string;
};

export type RosterSession = {
  id: string;
  clinicId: string;
  userUid: string;
  displayName: string;
  reasonCode: string;
  note: string | null;
  startsAt: string;
  endsAt: string;
  createdByUid: string;
  createdAt: string;
};

export type RosterDecisionReason =
  | "owner_exempt"
  | "rostering_inactive"
  | "rostered"
  | "extra"
  | "break_glass"
  | "outside_window"
  | "exception"
  | "not_rostered";

export type RosterDecision = {
  allowed: boolean;
  /** True only for an active break-glass session — planned `extra` is on-roster. */
  offRoster: boolean;
  reason: RosterDecisionReason;
  shiftLabel: Shift | null;
  accessUntil: Date | null;
  lastWindowEnd: Date | null;
  nextWindow: Date | null;
  exception: RosterException | null;
  message: string;
};

export function parseWallClock(value: string | null | undefined): { hours: number; minutes: number } | null {
  if (typeof value !== "string") return null;
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (!Number.isInteger(hours) || !Number.isInteger(minutes)) return null;
  if (hours < 0 || hours > 23 || minutes < 0 || minutes > 59) return null;
  return { hours, minutes };
}

export function formatWallClock(hours: number, minutes: number): string {
  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
}

/** Morning < 12:00, afternoon 12:00–17:59, night 18:00–05:59. Derived, never typed separately. */
export function deriveShiftLabel(startTime: string): Shift {
  const parsed = parseWallClock(startTime);
  if (!parsed) return "morning";
  const mins = parsed.hours * 60 + parsed.minutes;
  if (mins >= 18 * 60 || mins < 6 * 60) return "night";
  if (mins < 12 * 60) return "morning";
  return "afternoon";
}

export function crossesMidnight(startTime: string, endTime: string): boolean {
  const start = parseWallClock(startTime);
  const end = parseWallClock(endTime);
  if (!start || !end) return false;
  return end.hours * 60 + end.minutes <= start.hours * 60 + start.minutes;
}

export function isoDayOfWeek(date: Date): IsoWeekday {
  const day = date.getDay();
  return (day === 0 ? 7 : day) as IsoWeekday;
}

/** Calendar week of month: 1–7 → 1, 8–14 → 2, 15–21 → 3, 22–28 → 4, 29–31 → 5. */
export function weekOfMonth(date: Date): number {
  return Math.ceil(date.getDate() / 7);
}

export function startOfLocalDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

export function addLocalDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days, date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
}

export function startOfIsoWeek(date: Date): Date {
  return addLocalDays(startOfLocalDay(date), 1 - isoDayOfWeek(date));
}

export function localDateKey(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function parseLocalDateKey(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value.trim());
  if (!match) return null;
  return new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
}

export function rosteringIsActive(rosteringEnabled: boolean, clinicEntryCount: number): boolean {
  return rosteringEnabled === true && clinicEntryCount > 0;
}

export function isRosterPattern(value: string | null | undefined): value is RosterPattern {
  return !!value && (ROSTER_PATTERNS as readonly string[]).includes(value);
}

export function isRosterExceptionType(value: string | null | undefined): value is RosterExceptionType {
  return !!value && (ROSTER_EXCEPTION_TYPES as readonly string[]).includes(value);
}

export function isIsoWeekday(value: number): value is IsoWeekday {
  return (ISO_WEEKDAYS as readonly number[]).includes(value);
}

/**
 * Staff-management paths a clinic_admin may open even when off-roster, so a
 * wrong roster cannot lock them out of the screen that would fix it.
 */
export function isStaffManagementPath(pathname: string): boolean {
  if (pathname === "/staff") return true;
  return /^\/owner\/clinics\/[^/]+(?:\/staff|\/roster)?$/.test(pathname);
}

export function applyWallClock(date: Date, hhmm: string): Date | null {
  const parsed = parseWallClock(hhmm);
  if (!parsed) return null;
  return new Date(date.getFullYear(), date.getMonth(), date.getDate(), parsed.hours, parsed.minutes, 0, 0);
}

function entryDayStart(entry: RosterEntry): Date | null {
  return parseLocalDateKey(entry.effectiveFrom);
}

function entryDayEnd(entry: RosterEntry): Date | null {
  return entry.effectiveTo ? parseLocalDateKey(entry.effectiveTo) : null;
}

export function entryEffectiveOn(entry: RosterEntry, date: Date): boolean {
  const day = startOfLocalDay(date);
  const from = entryDayStart(entry);
  if (from && day < from) return false;
  const to = entryDayEnd(entry);
  if (to && day > to) return false;
  return true;
}

function fortnightMatches(entry: RosterEntry, date: Date): boolean {
  const anchor = entryDayStart(entry) ?? startOfLocalDay(date);
  const week0 = startOfIsoWeek(anchor);
  const weekN = startOfIsoWeek(date);
  const weeks = Math.round((weekN.getTime() - week0.getTime()) / (7 * 24 * 60 * 60 * 1000));
  const firstCycleWeek = weeks % 2 === 0;
  if (entry.weekParity === "even") return !firstCycleWeek;
  return firstCycleWeek;
}

export function matchesPattern(entry: RosterEntry, date: Date): boolean {
  if (!entryEffectiveOn(entry, date)) return false;
  if (!entry.daysOfWeek.includes(isoDayOfWeek(date))) return false;
  switch (entry.pattern) {
    case "weekly":
      return true;
    case "fortnightly":
      return fortnightMatches(entry, date);
    case "monthlyByWeek":
      return entry.weeksOfMonth.includes(weekOfMonth(date));
    case "fixedDates":
      return entry.dates.includes(localDateKey(date));
    default:
      return false;
  }
}

export function shiftWindowOnDate(entry: RosterEntry, date: Date): { start: Date; end: Date } | null {
  if (!matchesPattern(entry, date)) return null;
  const start = applyWallClock(startOfLocalDay(date), entry.startTime);
  if (!start) return null;
  const endDay = crossesMidnight(entry.startTime, entry.endTime) ? addLocalDays(startOfLocalDay(date), 1) : startOfLocalDay(date);
  const end = applyWallClock(endDay, entry.endTime);
  if (!end) return null;
  return { start, end };
}

export function withGrace(window: { start: Date; end: Date }, graceMinutes: number): { start: Date; end: Date } {
  const grace = Math.max(0, graceMinutes) * 60 * 1000;
  return {
    start: new Date(window.start.getTime() - grace),
    end: new Date(window.end.getTime() + grace),
  };
}

function covers(interval: { start: Date; end: Date }, now: Date): boolean {
  const t = now.getTime();
  return t >= interval.start.getTime() && t < interval.end.getTime();
}

export function exceptionCovers(exception: RosterException, now: Date): boolean {
  const start = new Date(exception.startsAt);
  const end = new Date(exception.endsAt);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) return false;
  const t = now.getTime();
  return t >= start.getTime() && t < end.getTime();
}

function blockingException(exceptions: RosterException[], now: Date): RosterException | null {
  return exceptions.find((item) => item.type !== "extra" && exceptionCovers(item, now)) ?? null;
}

function extraExceptions(exceptions: RosterException[], now: Date): RosterException[] {
  return exceptions.filter((item) => item.type === "extra" && exceptionCovers(item, now));
}

function windowsCovering(
  entries: RosterEntry[],
  now: Date
): { entry: RosterEntry; window: { start: Date; end: Date }; grace: { start: Date; end: Date } }[] {
  const days = [startOfLocalDay(now), addLocalDays(startOfLocalDay(now), -1)];
  const found: { entry: RosterEntry; window: { start: Date; end: Date }; grace: { start: Date; end: Date } }[] = [];
  for (const entry of entries) {
    for (const day of days) {
      const window = shiftWindowOnDate(entry, day);
      if (!window) continue;
      const grace = withGrace(window, entry.graceMinutes);
      if (covers(grace, now)) found.push({ entry, window, grace });
    }
  }
  return found;
}

export function findNextWindow(
  entries: RosterEntry[],
  exceptions: RosterException[],
  now: Date,
  horizonDays = 90
): Date | null {
  let soonest: Date | null = null;
  const consider = (candidate: Date) => {
    if (candidate.getTime() <= now.getTime()) return;
    if (blockingException(exceptions, candidate)) return;
    if (!soonest || candidate < soonest) soonest = candidate;
  };

  for (const extra of exceptions.filter((item) => item.type === "extra")) {
    const start = new Date(extra.startsAt);
    if (!Number.isNaN(start.getTime())) consider(start);
  }

  for (let offset = 0; offset <= horizonDays; offset++) {
    const day = addLocalDays(startOfLocalDay(now), offset);
    for (const entry of entries) {
      const window = shiftWindowOnDate(entry, day);
      if (window) consider(window.start);
    }
  }
  return soonest;
}

export function findLastWindowEnd(entries: RosterEntry[], now: Date, lookbackDays = 14): Date | null {
  let latest: Date | null = null;
  for (let offset = 0; offset <= lookbackDays; offset++) {
    const day = addLocalDays(startOfLocalDay(now), -offset);
    for (const entry of entries) {
      const window = shiftWindowOnDate(entry, day);
      if (!window) continue;
      if (window.end.getTime() <= now.getTime() && (!latest || window.end > latest)) {
        latest = window.end;
      }
    }
  }
  return latest;
}

export function formatWeekdayTime(date: Date): string {
  const weekday = ISO_WEEKDAY_LABELS[isoDayOfWeek(date)];
  return `${weekday} ${formatWallClock(date.getHours(), date.getMinutes())}`;
}

export function formatClock(date: Date): string {
  return formatWallClock(date.getHours(), date.getMinutes());
}

export function formatRosterMessage(decision: Omit<RosterDecision, "message">): string {
  if (decision.allowed) return "";
  if (decision.reason === "exception" && decision.exception) {
    const until = new Date(decision.exception.endsAt);
    const untilText = Number.isNaN(until.getTime()) ? "" : ` until ${formatWeekdayTime(until)}`;
    const kind =
      decision.exception.type === "sick"
        ? "on sick leave"
        : decision.exception.type === "swap"
          ? "swapped off"
          : "on leave";
    const next = decision.nextWindow ? ` You are next rostered ${formatWeekdayTime(decision.nextWindow)}.` : "";
    return `You are marked as ${kind}${untilText}.${next}`;
  }
  if (decision.reason === "not_rostered") {
    return "You are not on the roster for this clinic.";
  }
  const next = decision.nextWindow
    ? `You are next rostered ${formatWeekdayTime(decision.nextWindow)}.`
    : "No further shift is on the roster.";
  if (decision.lastWindowEnd) {
    return `Your shift ended at ${formatClock(decision.lastWindowEnd)}. ${next}`;
  }
  return `You are not on shift. ${next}`;
}

function decision(
  partial: Omit<RosterDecision, "message">
): RosterDecision {
  return { ...partial, message: formatRosterMessage(partial) };
}

/**
 * Evaluate whether `userUid` may work at `now`.
 *
 * Owner is exempt. A clinic with rostering off, or with no entries at all,
 * stays always-on so existing clinics are unaffected. `clinic_admin` is
 * rostered here; the staff-management exemption is applied by the caller.
 */
export function evaluateRosterAccess(input: {
  now: Date;
  role: string | null;
  userUid: string;
  rosteringEnabled: boolean;
  clinicEntries: RosterEntry[];
  userEntries: RosterEntry[];
  exceptions: RosterException[];
  breakGlassUntil?: Date | null;
}): RosterDecision {
  const empty = {
    shiftLabel: null as Shift | null,
    accessUntil: null as Date | null,
    lastWindowEnd: null as Date | null,
    nextWindow: null as Date | null,
    exception: null as RosterException | null,
  };

  if (input.role === "owner") {
    return decision({ allowed: true, offRoster: false, reason: "owner_exempt", ...empty });
  }

  if (!rosteringIsActive(input.rosteringEnabled, input.clinicEntries.length)) {
    return decision({ allowed: true, offRoster: false, reason: "rostering_inactive", ...empty });
  }

  if (input.breakGlassUntil && input.now.getTime() < input.breakGlassUntil.getTime()) {
    const covering = windowsCovering(input.userEntries, input.now)[0];
    return decision({
      allowed: true,
      offRoster: true,
      reason: "break_glass",
      shiftLabel: covering ? deriveShiftLabel(covering.entry.startTime) : null,
      accessUntil: input.breakGlassUntil,
      lastWindowEnd: findLastWindowEnd(input.userEntries, input.now),
      nextWindow: findNextWindow(input.userEntries, input.exceptions, input.now),
      exception: null,
    });
  }

  const extras = extraExceptions(input.exceptions, input.now);
  if (extras.length > 0) {
    const until = extras.reduce((max, item) => {
      const end = new Date(item.endsAt).getTime();
      return Number.isNaN(end) ? max : Math.max(max, end);
    }, 0);
    const covering = windowsCovering(input.userEntries, input.now)[0];
    return decision({
      allowed: true,
      offRoster: false,
      reason: "extra",
      shiftLabel: covering ? deriveShiftLabel(covering.entry.startTime) : "morning",
      accessUntil: until ? new Date(until) : null,
      lastWindowEnd: findLastWindowEnd(input.userEntries, input.now),
      nextWindow: findNextWindow(input.userEntries, input.exceptions, input.now),
      exception: extras[0],
    });
  }

  const blocked = blockingException(input.exceptions, input.now);
  const nextWindow = findNextWindow(input.userEntries, input.exceptions, input.now);
  const lastWindowEnd = findLastWindowEnd(input.userEntries, input.now);

  if (blocked) {
    return decision({
      allowed: false,
      offRoster: false,
      reason: "exception",
      shiftLabel: null,
      accessUntil: null,
      lastWindowEnd,
      nextWindow,
      exception: blocked,
    });
  }

  const covering = windowsCovering(input.userEntries, input.now)[0];
  if (covering) {
    return decision({
      allowed: true,
      offRoster: false,
      reason: "rostered",
      shiftLabel: deriveShiftLabel(covering.entry.startTime),
      accessUntil: covering.grace.end,
      lastWindowEnd,
      nextWindow,
      exception: null,
    });
  }

  if (input.userEntries.length === 0) {
    return decision({
      allowed: false,
      offRoster: false,
      reason: "not_rostered",
      shiftLabel: null,
      accessUntil: null,
      lastWindowEnd: null,
      nextWindow: null,
      exception: null,
    });
  }

  return decision({
    allowed: false,
    offRoster: false,
    reason: "outside_window",
    shiftLabel: null,
    accessUntil: null,
    lastWindowEnd,
    nextWindow,
    exception: null,
  });
}

export function minutesUntil(accessUntil: Date | null, now: Date): number | null {
  if (!accessUntil) return null;
  return (accessUntil.getTime() - now.getTime()) / 60000;
}

export function rosterExpiryWarning(minutesLeft: number | null): "10" | "2" | null {
  if (minutesLeft == null || minutesLeft < 0) return null;
  if (minutesLeft <= 2) return "2";
  if (minutesLeft <= 10) return "10";
  return null;
}

export function isWeekParity(value: string | null | undefined): value is WeekParity {
  return value === "odd" || value === "even";
}

export function parseIsoWeekdays(value: unknown): IsoWeekday[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => Number(item)).filter(isIsoWeekday);
}

export function parseWeeksOfMonth(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => Number(item))
    .filter((n) => Number.isInteger(n) && n >= 1 && n <= 5);
}

export function parseDateKeys(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string" && /^\d{4}-\d{2}-\d{2}$/.test(item));
}

function asString(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export function parseRosterEntry(id: string, data: Record<string, unknown>): RosterEntry | null {
  const clinicId = asString(data.clinicId);
  const userUid = asString(data.userUid);
  const pattern = asString(data.pattern);
  const startTime = asString(data.startTime);
  const endTime = asString(data.endTime);
  if (!clinicId || !userUid || !isRosterPattern(pattern) || !startTime || !endTime) return null;
  return {
    id,
    clinicId,
    userUid,
    pattern,
    weeksOfMonth: parseWeeksOfMonth(data.weeksOfMonth),
    weekParity: isWeekParity(asString(data.weekParity)) ? (data.weekParity as WeekParity) : null,
    daysOfWeek: parseIsoWeekdays(data.daysOfWeek),
    startTime,
    endTime,
    graceMinutes: typeof data.graceMinutes === "number" ? data.graceMinutes : DEFAULT_GRACE_MINUTES,
    dates: parseDateKeys(data.dates),
    effectiveFrom: asString(data.effectiveFrom),
    effectiveTo: typeof data.effectiveTo === "string" && data.effectiveTo ? data.effectiveTo : null,
    createdByUid: asString(data.createdByUid),
    createdAt: asString(data.createdAt),
  };
}

export function parseRosterException(id: string, data: Record<string, unknown>): RosterException | null {
  const type = asString(data.type);
  if (!isRosterExceptionType(type)) return null;
  const clinicId = asString(data.clinicId);
  const userUid = asString(data.userUid);
  if (!clinicId || !userUid) return null;
  return {
    id,
    clinicId,
    userUid,
    type,
    startsAt: asString(data.startsAt),
    endsAt: asString(data.endsAt),
    reasonCode: typeof data.reasonCode === "string" ? data.reasonCode : null,
    note: typeof data.note === "string" ? data.note : null,
    createdByUid: asString(data.createdByUid),
    createdAt: asString(data.createdAt),
  };
}

export function activeBreakGlass(sessions: RosterSession[], userUid: string, now: Date): RosterSession | null {
  const t = now.getTime();
  return (
    sessions.find((session) => {
      if (session.userUid !== userUid) return false;
      const start = Date.parse(session.startsAt);
      const end = Date.parse(session.endsAt);
      return !Number.isNaN(start) && !Number.isNaN(end) && t >= start && t < end;
    }) ?? null
  );
}

export function parseRosterSession(id: string, data: Record<string, unknown>): RosterSession | null {
  const clinicId = asString(data.clinicId);
  const userUid = asString(data.userUid);
  const reasonCode = asString(data.reasonCode);
  const startsAt = asString(data.startsAt);
  const endsAt = asString(data.endsAt);
  if (!clinicId || !userUid || !reasonCode || !startsAt || !endsAt) return null;
  return {
    id,
    clinicId,
    userUid,
    displayName: asString(data.displayName) || userUid,
    reasonCode,
    note: typeof data.note === "string" ? data.note : null,
    startsAt,
    endsAt,
    createdByUid: asString(data.createdByUid),
    createdAt: asString(data.createdAt),
  };
}

export function currentRosterShift(
  entries: RosterEntry[],
  exceptions: RosterException[],
  now: Date,
  fallback: string | null
): Shift | null {
  const covering = windowsCovering(entries, now)[0];
  if (covering) return deriveShiftLabel(covering.entry.startTime);
  return isShift(fallback) ? fallback : null;
}
