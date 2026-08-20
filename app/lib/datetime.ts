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
