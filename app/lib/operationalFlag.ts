/**
 * Operational flags — work is late or blocked.
 * Kept apart from clinical H/L/C by position (row stripe + word chip), not colour.
 *
 * This module does not invent turnaround targets. Overdue / due chips accept a
 * precomputed label or an elapsed duration the caller already decided to show.
 */

export const OPERATIONAL_STATES = [
  "overdue",
  "due",
  "recollect",
  "released",
  "queued",
  "ordinary",
] as const;

export type OperationalState = (typeof OPERATIONAL_STATES)[number];

/** Word stems that appear on chips. Distinct from clinical letters H/L/A/C. */
export const OPERATIONAL_CHIP_WORDS = ["OVERDUE", "DUE", "RECOLLECT", "RELEASED", "QUEUED"] as const;

export type OperationalFlagInput = {
  state: OperationalState;
  /**
   * Precomputed chip text. Required for `ordinary`. For overdue/due, use this
   * when elapsed time is already formatted, or when no duration is known.
   */
  label?: string;
  /** Elapsed (overdue) or remaining (due) minutes. Never a TAT target. */
  elapsedMinutes?: number;
};

export type OperationalFlagView = {
  state: OperationalState;
  label: string;
};

const NAMED_CHIP: Record<Exclude<OperationalState, "overdue" | "due" | "ordinary">, string> = {
  recollect: "RECOLLECT",
  released: "RELEASED",
  queued: "QUEUED",
};

export function isOperationalState(value: string | null | undefined): value is OperationalState {
  return (
    value === "overdue" ||
    value === "due" ||
    value === "recollect" ||
    value === "released" ||
    value === "queued" ||
    value === "ordinary"
  );
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

/** Stripe colour. Queued and ordinary share the neutral line — no colour. */
export function operationalStripeClass(state: OperationalState): string {
  switch (state) {
    case "overdue":
      return "lf-op-stripe border-lf-crit";
    case "due":
    case "recollect":
      return "lf-op-stripe border-lf-warn";
    case "released":
      return "lf-op-stripe border-lf-ok";
    default:
      return "lf-op-stripe border-lf-line-strong";
  }
}

export function operationalChipClass(state: OperationalState): string {
  switch (state) {
    case "overdue":
      return "lf-op-chip bg-lf-crit-soft text-lf-crit border-lf-crit/30";
    case "due":
    case "recollect":
      return "lf-op-chip bg-lf-warn-soft text-lf-warn border-lf-warn/30";
    case "released":
      return "lf-op-chip bg-lf-ok-soft text-lf-ok border-lf-ok/30";
    default:
      return "lf-op-chip bg-lf-surface-2 text-lf-ink-2 border-lf-line-strong";
  }
}

export function operationalHasColour(state: OperationalState): boolean {
  return state === "overdue" || state === "due" || state === "recollect" || state === "released";
}

/**
 * Map an existing order stage onto operational presentation.
 * Never returns overdue or due — this codebase has no per-test TAT target.
 */
export function operationalFromOrderStage(order: {
  status?: string | null;
  recollectionOfOrderId?: string | null;
}): OperationalFlagInput {
  if (order.recollectionOfOrderId) return { state: "recollect" };
  if (order.status === "rejected") return { state: "recollect" };
  if (order.status === "approved" || order.status === "amended") return { state: "released" };
  if (order.status === "cancelled") return { state: "ordinary", label: "STOPPED" };
  return { state: "queued" };
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
    coloured: operationalHasColour(input.state),
  };
}

export function clinicalGreyscaleIdentity(letter: "H" | "L" | "A" | "C"): {
  position: "inline-after-value";
  text: string;
} {
  return { position: "inline-after-value", text: letter };
}
