import {
  collectionTurnaroundStart,
  TURNAROUND_DEFINITION,
  type CollectionOrderInput,
} from "./sampleCollection";

export { collectionTurnaroundStart, TURNAROUND_DEFINITION };

/** Converts an ISO timestamp to the `YYYY-MM-DDTHH:mm` shape a datetime-local input needs, in local time. */
export function toDateTimeLocal(iso: string | null | undefined): string {
  const d = iso ? new Date(iso) : new Date();
  if (Number.isNaN(d.getTime())) return "";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(
    d.getMinutes()
  )}`;
}

/** Converts a datetime-local input value back to an ISO timestamp. */
export function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

export type TimeWindowKey = "today" | "yesterday" | "week";

export interface TimeWindow {
  key: TimeWindowKey;
  label: string;
  start: Date;
  end: Date;
}

function startOfDay(d: Date) {
  const copy = new Date(d);
  copy.setHours(0, 0, 0, 0);
  return copy;
}

function addDays(d: Date, days: number) {
  const copy = new Date(d);
  copy.setDate(copy.getDate() + days);
  return copy;
}

/**
 * Dashboard windows from PRD 5.2. The week runs Monday to now, matching how a
 * laboratory reads "this week" rather than a rolling seven days.
 */
export function getTimeWindow(key: TimeWindowKey, now: Date = new Date()): TimeWindow {
  const today = startOfDay(now);
  if (key === "today") {
    return { key, label: "Today", start: today, end: addDays(today, 1) };
  }
  if (key === "yesterday") {
    return { key, label: "Yesterday", start: addDays(today, -1), end: today };
  }
  const daysSinceMonday = (today.getDay() + 6) % 7;
  return {
    key,
    label: "This week",
    start: addDays(today, -daysSinceMonday),
    end: addDays(today, 1),
  };
}

export function isWithin(iso: string | null | undefined, window: TimeWindow): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return t >= window.start.getTime() && t < window.end.getTime();
}

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0 ? (sorted[mid - 1] + sorted[mid]) / 2 : sorted[mid];
}

export interface TurnaroundSample extends CollectionOrderInput {
  sampleCollectedAt?: string | null;
  reviewedAt?: string | null;
}

export type TurnaroundExclusionReason =
  | "missing_collection"
  | "missing_review"
  | "impossible_times"
  | "invalid_times";

export interface TurnaroundClassification {
  hours: number | null;
  exclusion: TurnaroundExclusionReason | null;
  legacy: boolean;
}

export interface TurnaroundSummary {
  median: number | null;
  counted: number;
  excluded: number;
  excludedMissingCollection: number;
  excludedMissingReview: number;
  excludedImpossible: number;
  excludedInvalid: number;
  legacyCounted: number;
}

/**
 * Hours from the latest specimen collection to review. Missing any required
 * specimen’s collection time, missing review, unparseable timestamps, or
 * collection after approval return null — they must never be treated as zero
 * or as a negative TAT. A legacy single `sampleCollectedAt` still computes
 * when no per-specimen map exists.
 */
export function classifyTurnaround(order: TurnaroundSample): TurnaroundClassification {
  const start = collectionTurnaroundStart(order);
  if (!start.collectedAt) {
    return { hours: null, exclusion: "missing_collection", legacy: start.legacy };
  }
  if (!order.reviewedAt) {
    return { hours: null, exclusion: "missing_review", legacy: start.legacy };
  }
  const collected = new Date(start.collectedAt).getTime();
  const reviewed = new Date(order.reviewedAt).getTime();
  if (Number.isNaN(collected) || Number.isNaN(reviewed)) {
    return { hours: null, exclusion: "invalid_times", legacy: start.legacy };
  }
  if (reviewed < collected) {
    return { hours: null, exclusion: "impossible_times", legacy: start.legacy };
  }
  return { hours: (reviewed - collected) / 3600000, exclusion: null, legacy: start.legacy };
}

export function turnaroundHours(order: TurnaroundSample): number | null {
  return classifyTurnaround(order).hours;
}

export function summarizeTurnaround(orders: TurnaroundSample[]): TurnaroundSummary {
  const hours: number[] = [];
  let excludedMissingCollection = 0;
  let excludedMissingReview = 0;
  let excludedImpossible = 0;
  let excludedInvalid = 0;
  let legacyCounted = 0;
  for (const order of orders) {
    const classified = classifyTurnaround(order);
    if (classified.hours === null) {
      if (classified.exclusion === "missing_review") excludedMissingReview += 1;
      else if (classified.exclusion === "impossible_times") excludedImpossible += 1;
      else if (classified.exclusion === "invalid_times") excludedInvalid += 1;
      else excludedMissingCollection += 1;
      continue;
    }
    hours.push(classified.hours);
    if (classified.legacy) legacyCounted += 1;
  }
  const excluded =
    excludedMissingCollection + excludedMissingReview + excludedImpossible + excludedInvalid;
  return {
    median: median(hours),
    counted: hours.length,
    excluded,
    excludedMissingCollection,
    excludedMissingReview,
    excludedImpossible,
    excludedInvalid,
    legacyCounted,
  };
}

/** Dashboard line under the TAT figure. Denominator stays visible even when exclusions are zero. */
export function formatTurnaroundExclusionCopy(summary: TurnaroundSummary): string {
  const orderWord = summary.counted === 1 ? "order" : "orders";
  const parts = [
    `Median of ${summary.counted} ${orderWord}.`,
    `${summary.excludedMissingCollection} excluded — no recorded collection time.`,
  ];
  if (summary.excludedImpossible > 0) {
    parts.push(`${summary.excludedImpossible} excluded — collection after approval.`);
  }
  if (summary.excludedInvalid > 0) {
    parts.push(`${summary.excludedInvalid} excluded — unreadable timestamps.`);
  }
  if (summary.excludedMissingReview > 0) {
    parts.push(`${summary.excludedMissingReview} excluded — no review time.`);
  }
  return parts.join(" ");
}
