import { collectionTurnaroundStart, type CollectionOrderInput } from "./sampleCollection";

export const STALE_WAIT_HOURS = 24;
export const REVIEW_NOTES_MIN_LENGTH = 10;
export const OFFLINE_RELEASE_MESSAGE = "Results can only be released when online.";
export const OFFLINE_AMENDMENT_MESSAGE =
  "A released result cannot be amended while this device is offline.";
export const SELF_RELEASE_MESSAGE =
  "You entered these results. Releasing them requires a reason code.";
export const SEND_BACK_REASON_MESSAGE = "Choose a reason to send back.";

export function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Owner is not exempt: the person who entered results cannot release them. */
export function isSelfRelease(
  resultsEnteredBy: string | null | undefined,
  actorEmail: string | null | undefined
): boolean {
  return emailsMatch(resultsEnteredBy, actorEmail);
}

export function reviewNotesReady(notes: string | null | undefined): boolean {
  return (notes || "").trim().length > 0;
}

export function hoursSince(iso: string | null | undefined, nowMs: number = Date.now()): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return (nowMs - t) / 3600000;
}

export function formatHours(hours: number | null): string {
  if (hours === null || hours < 0) return "—";
  if (hours < 10) return `${hours.toFixed(1)} h`;
  return `${Math.round(hours)} h`;
}

/** S5: latest specimen collection, or the legacy single timestamp. Null if any required specimen is missing. */
export function hoursSinceCollection(order: CollectionOrderInput, nowMs: number = Date.now()): number | null {
  return hoursSince(collectionTurnaroundStart(order).collectedAt, nowMs);
}

export function inActingClinic(
  recordClinicId: string | null | undefined,
  actingClinicId: string | null | undefined
): boolean {
  return Boolean(actingClinicId && recordClinicId === actingClinicId);
}

export function queueWaitStartedAt(order: {
  status?: string | null;
  resultsEnteredAt?: string | null;
  reviewedAt?: string | null;
  createdAt?: string | null;
}): string | null {
  if (order.status === "needs_correction") {
    return order.reviewedAt || order.resultsEnteredAt || order.createdAt || null;
  }
  return order.resultsEnteredAt || order.createdAt || null;
}

export function isWaitingOver24Hours(iso: string | null | undefined, nowMs: number = Date.now()): boolean {
  const hours = hoursSince(iso, nowMs);
  return hours !== null && hours > STALE_WAIT_HOURS;
}

export function compareQueueOldestFirst(
  a: { waitStartedAt: string | null; id?: string },
  b: { waitStartedAt: string | null; id?: string }
): number {
  if (a.waitStartedAt === b.waitStartedAt) return (a.id || "").localeCompare(b.id || "");
  if (!a.waitStartedAt) return 1;
  if (!b.waitStartedAt) return -1;
  return a.waitStartedAt < b.waitStartedAt ? -1 : 1;
}

export function countResultsEntered(
  records: { status?: string | null; clinicId?: string | null }[],
  actingClinicId: string | null | undefined
): number {
  if (!actingClinicId) return 0;
  return records.filter(
    (row) => row.status === "results_entered" && inActingClinic(row.clinicId, actingClinicId)
  ).length;
}
