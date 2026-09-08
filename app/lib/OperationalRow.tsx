import type { ReactNode } from "react";
import {
  formatOperationalChipLabel,
  operationalChipClass,
  operationalStripeClass,
  type OperationalState,
} from "./operationalFlag";

export function OperationalChip({
  state,
  label,
  elapsedMinutes,
}: {
  state: OperationalState;
  label?: string;
  elapsedMinutes?: number;
}) {
  const text = formatOperationalChipLabel({ state, label, elapsedMinutes });
  return (
    <span
      data-lf-role="operational-chip"
      data-lf-state={state}
      className={operationalChipClass(state, elapsedMinutes)}
    >
      {text}
    </span>
  );
}

/**
 * Work-row chrome: 3px stripe on the left, word chip on the right.
 * Clinical letters must not be passed here — use ClinicalFlagLetter against the value.
 */
export default function OperationalRow({
  state,
  label,
  elapsedMinutes,
  children,
  className = "",
}: {
  state: OperationalState;
  label?: string;
  elapsedMinutes?: number;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      data-lf-role="operational-row"
      data-lf-state={state}
      className={[
        "flex items-start gap-3 rounded-lf-md border border-lf-line",
        operationalStripeClass(state, elapsedMinutes),
        className,
      ]
        .filter(Boolean)
        .join(" ")}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <OperationalChip state={state} label={label} elapsedMinutes={elapsedMinutes} />
    </div>
  );
}
