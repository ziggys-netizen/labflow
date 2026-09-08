import {
  resolveSpecimenCap,
  specimenCapBackground,
  SPECIMEN_CAP_LABELS,
  type SpecimenCap,
} from "./specimenCap";

export type { SpecimenCap };

/**
 * D6 — 11px categorical tube-cap dot beside a test name.
 * Never ranks work, never fills a row, never sits near an operational chip.
 * Missing cap → nothing (not a grey stand-in).
 */
export default function SpecimenCapDot({
  cap,
  title,
}: {
  cap: SpecimenCap | null | undefined;
  /** Override accessible name; defaults to the additive label. */
  title?: string;
}) {
  if (!cap) return null;
  return (
    <span
      role="img"
      aria-label={title || SPECIMEN_CAP_LABELS[cap]}
      title={title || SPECIMEN_CAP_LABELS[cap]}
      data-lf-role="specimen-cap"
      data-lf-cap={cap}
      className="lf-specimen-cap-dot"
      style={{ background: specimenCapBackground(cap) }}
    />
  );
}

/** Resolve a cap for a test code against an optional clinic catalogue. */
export function specimenCapForTest(
  code: string | null | undefined,
  catalog?: { code: string; specimenCap?: unknown }[],
  stored?: unknown
): SpecimenCap | null {
  return resolveSpecimenCap(stored, code, catalog);
}
