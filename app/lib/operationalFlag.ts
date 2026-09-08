/**
 * Operational flags — work is late or blocked.
 * Kept apart from clinical H/L/C by position (row stripe + word chip), not colour.
 *
 * Workflow stages and dashboard queue tiles share `operationalFromOrder` so a
 * tile count and a row chip cannot disagree on the same order.
 *
 * Overdue / due appear only when the caller supplies tatMinutes. This module
 * does not invent turnaround targets.
 */

import {
  interpretCollection,
  type CollectionOrderInput,
} from "./sampleCollection";
import { isReleasedResultStatus } from "./resultAmendment";
import { parseTatMinutes } from "./testCatalog";

export const OPERATIONAL_STATES = [
  "overdue",
  "due",
  "awaiting-sample",
  "collected",
  "results-entered",
  "returned",
  "recollect",
  "released",
  "ordinary",
] as const;

export type OperationalState = (typeof OPERATIONAL_STATES)[number];

/** The six workflow buckets dashboard queue tiles and patient chips share. */
export const OPERATIONAL_QUEUE_STATES = [
  "awaiting-sample",
  "collected",
  "results-entered",
  "returned",
  "released",
  "recollect",
] as const;

export type OperationalQueueState = (typeof OPERATIONAL_QUEUE_STATES)[number];

/** Word stems that appear on chips. Distinct from clinical letters H/L/A/C. */
export const OPERATIONAL_CHIP_WORDS = [
  "OVERDUE",
  "DUE",
  "AWAITING SAMPLE",
  "COLLECTED",
  "AWAITING REVIEW",
  "RETURNED",
  "RECOLLECT",
  "RELEASED",
] as const;

export type OperationalFlagInput = {
  state: OperationalState;
  /**
   * Precomputed chip text. Required for `ordinary`. For overdue/due, use this
   * when elapsed time is already formatted, or when no duration is known.
   */
  label?: string;
  /**
   * Elapsed (overdue / results-entered age) or remaining (due) minutes.
   * Never a TAT target.
   */
  elapsedMinutes?: number;
};

export type OperationalFlagView = {
  state: OperationalState;
  label: string;
};

export type OperationalOrderFields = CollectionOrderInput & {
  status?: string | null;
  recollectionOfOrderId?: string | null;
  resultsEnteredAt?: string | null;
  createdAt?: string | null;
  /** Catalogue TAT for this order/test when known. Absent → never overdue/due. */
  tatMinutes?: number | null;
  /** When set, skips interpretCollection (technician board already resolved this). */
  collected?: boolean;
  collectedAt?: string | null;
};

const NAMED_CHIP: Record<
  Exclude<OperationalState, "overdue" | "due" | "ordinary">,
  string
> = {
  "awaiting-sample": "AWAITING SAMPLE",
  collected: "COLLECTED",
  "results-entered": "AWAITING REVIEW",
  returned: "RETURNED",
  recollect: "RECOLLECT",
  released: "RELEASED",
};

const RESULTS_ENTERED_WARN_MINUTES = 24 * 60;

function timeMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function elapsedMinutesSince(iso: string | null | undefined, now: Date): number | null {
  const start = timeMs(iso);
  if (start == null) return null;
  return Math.max(0, (now.getTime() - start) / 60000);
}

export function isOperationalState(value: string | null | undefined): value is OperationalState {
  return (OPERATIONAL_STATES as readonly string[]).includes(value ?? "");
}

export function isOperationalQueueState(
  value: string | null | undefined
): value is OperationalQueueState {
  return (OPERATIONAL_QUEUE_STATES as readonly string[]).includes(value ?? "");
}

export function formatDurationToken(elapsedMinutes: number): string {
  const minutes = Math.max(0, Math.round(elapsedMinutes));
  if (minutes < 60) return `${minutes}M`;
  return `${Math.round(minutes / 60)}H`;
}

function normalizeChipLabel(label: string): string {
  return label.trim().toUpperCase();
}

/**
 * Chip text always names the state in words. Colour is never the only carrier.
 * Overdue/due without a label or duration still say OVERDUE / DUE — they do
 * not invent a time.
 */
export function formatOperationalChipLabel(input: OperationalFlagInput): string {
  if (input.label?.trim()) return normalizeChipLabel(input.label);

  if (input.state === "overdue") {
    if (input.elapsedMinutes == null) return "OVERDUE";
    return `OVERDUE ${formatDurationToken(input.elapsedMinutes)}`;
  }
  if (input.state === "due") {
    if (input.elapsedMinutes == null) return "DUE";
    return `DUE ${formatDurationToken(input.elapsedMinutes)}`;
  }
  if (input.state === "ordinary") {
    throw new Error("ordinary operational chips need a precomputed label");
  }
  return NAMED_CHIP[input.state];
}

export function resolveOperationalFlag(input: OperationalFlagInput): OperationalFlagView {
  return { state: input.state, label: formatOperationalChipLabel(input) };
}

function resultsEnteredIsStale(elapsedMinutes: number | null | undefined): boolean {
  return elapsedMinutes != null && elapsedMinutes >= RESULTS_ENTERED_WARN_MINUTES;
}

/** Stripe colour per D3. */
export function operationalStripeClass(
  state: OperationalState,
  elapsedMinutes?: number
): string {
  switch (state) {
    case "overdue":
    case "returned":
    case "recollect":
      return "lf-op-stripe border-lf-crit";
    case "due":
      return "lf-op-stripe border-lf-warn";
    case "results-entered":
      return resultsEnteredIsStale(elapsedMinutes)
        ? "lf-op-stripe border-lf-warn"
        : "lf-op-stripe border-lf-line-strong";
    case "released":
      return "lf-op-stripe border-lf-ok";
    default:
      return "lf-op-stripe border-lf-line-strong";
  }
}

export function operationalChipClass(
  state: OperationalState,
  elapsedMinutes?: number
): string {
  switch (state) {
    case "overdue":
    case "returned":
    case "recollect":
      return "lf-op-chip bg-lf-crit-soft text-lf-crit border-lf-crit/30";
    case "due":
      return "lf-op-chip bg-lf-warn-soft text-lf-warn border-lf-warn/30";
    case "results-entered":
      return resultsEnteredIsStale(elapsedMinutes)
        ? "lf-op-chip bg-lf-warn-soft text-lf-warn border-lf-warn/30"
        : "lf-op-chip bg-lf-surface-2 text-lf-ink-2 border-lf-line-strong";
    case "released":
      return "lf-op-chip bg-lf-ok-soft text-lf-ok border-lf-ok/30";
    default:
      return "lf-op-chip bg-lf-surface-2 text-lf-ink-2 border-lf-line-strong";
  }
}

export function operationalHasColour(
  state: OperationalState,
  elapsedMinutes?: number
): boolean {
  if (state === "overdue" || state === "due" || state === "returned" || state === "recollect") {
    return true;
  }
  if (state === "released") return true;
  if (state === "results-entered") return resultsEnteredIsStale(elapsedMinutes);
  return false;
}

function orderIsCollected(order: OperationalOrderFields): boolean {
  if (typeof order.collected === "boolean") return order.collected;
  return interpretCollection(order).allCollected;
}

function tatClockStartIso(order: {
  collected: boolean;
  collectedAt: string | null;
  createdAt: string | null;
}): string | null {
  if (order.collected && order.collectedAt) return order.collectedAt;
  return order.createdAt;
}

/** Local TAT clock — same rules as technicianBoard.computeTatClock, no import cycle. */
function tatClock(
  tatMinutes: number | null | undefined,
  clockStartedAt: string | null,
  now: Date
): { remainingMinutes: number; overdue: boolean } | null {
  const target = parseTatMinutes(tatMinutes);
  const start = timeMs(clockStartedAt);
  if (target == null || start == null) return null;
  const elapsedMinutes = (now.getTime() - start) / 60000;
  const remainingMinutes = target - elapsedMinutes;
  return { remainingMinutes, overdue: remainingMinutes < 0 };
}

function workflowFromOrder(order: OperationalOrderFields, now: Date): OperationalFlagInput | null {
  if (order.recollectionOfOrderId) return { state: "recollect" };
  if (order.status === "rejected") return { state: "recollect" };
  if (order.status === "approved" || order.status === "amended") return { state: "released" };
  if (order.status === "cancelled") return { state: "ordinary", label: "STOPPED" };

  if (order.status === "needs_correction") return { state: "returned" };

  if (order.status === "results_entered") {
    const elapsed = elapsedMinutesSince(order.resultsEnteredAt, now);
    return elapsed == null
      ? { state: "results-entered" }
      : { state: "results-entered", elapsedMinutes: elapsed };
  }

  if (order.status === "pending" || !order.status) {
    if (orderIsCollected(order)) return { state: "collected" };
    return { state: "awaiting-sample" };
  }

  // Unknown status — honest empty cell, never a false QUEUED.
  return null;
}

/**
 * Single source for patient-row chips and dashboard queue tile counts.
 * Returns null when state cannot be determined — callers show no chip.
 */
export function operationalFromOrder(
  order: OperationalOrderFields,
  now: Date = new Date()
): OperationalFlagInput | null {
  const workflow = workflowFromOrder(order, now);
  if (!workflow) return null;
  if (
    workflow.state === "recollect" ||
    workflow.state === "released" ||
    workflow.state === "ordinary"
  ) {
    return workflow;
  }

  const collected = orderIsCollected(order);
  const collectedAt =
    order.collectedAt ??
    (collected ? interpretCollection(order).latestCollectedAt : null) ??
    null;
  const clock = tatClock(
    order.tatMinutes ?? null,
    tatClockStartIso({
      collected,
      collectedAt,
      createdAt: order.createdAt ?? null,
    }),
    now
  );
  if (clock?.overdue) {
    return { state: "overdue", elapsedMinutes: Math.abs(clock.remainingMinutes) };
  }
  if (clock && !clock.overdue) {
    return { state: "due", elapsedMinutes: clock.remainingMinutes };
  }
  return workflow;
}

/**
 * @deprecated Prefer `operationalFromOrder` — kept as a thin alias for older call sites.
 */
export function operationalFromOrderStage(
  order: OperationalOrderFields,
  now: Date = new Date()
): OperationalFlagInput | null {
  return operationalFromOrder(order, now);
}

/** Count open-work queue buckets from the same derivation chips use. */
export function countOperationalQueue(
  orders: OperationalOrderFields[],
  now: Date = new Date()
): Record<OperationalQueueState, number> {
  const counts: Record<OperationalQueueState, number> = {
    "awaiting-sample": 0,
    collected: 0,
    "results-entered": 0,
    returned: 0,
    released: 0,
    recollect: 0,
  };
  for (const order of orders) {
    if (isReleasedResultStatus(order.status)) continue;
    const flag = operationalFromOrder(order, now);
    if (!flag) continue;
    if (isOperationalQueueState(flag.state)) {
      counts[flag.state] += 1;
    }
  }
  return counts;
}

/** Position + text identity for the greyscale thumb test. */
export function operationalGreyscaleIdentity(input: OperationalFlagInput): {
  position: "row-left-stripe+row-right-chip";
  text: string;
  coloured: boolean;
} {
  return {
    position: "row-left-stripe+row-right-chip",
    text: formatOperationalChipLabel(input),
    coloured: operationalHasColour(input.state, input.elapsedMinutes),
  };
}

export function clinicalGreyscaleIdentity(letter: "H" | "L" | "A" | "C"): {
  position: "inline-after-value";
  text: string;
} {
  return { position: "inline-after-value", text: letter };
}
