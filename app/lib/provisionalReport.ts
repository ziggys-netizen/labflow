/**
 * Offline print of a released, locally-confirmed result is a provisional
 * report (PRD v0.4 §9.4). Final print waits until the write has synced.
 */

export const PROVISIONAL_HEADING = "PROVISIONAL REPORT";
export const PROVISIONAL_NOTICE =
  "Provisional — not yet confirmed to the laboratory record. A final report will follow.";

export function isProvisionalPrint(options: {
  released: boolean;
  locallyConfirmed: boolean;
  synced: boolean;
}): boolean {
  return options.released && options.locallyConfirmed && !options.synced;
}

export function printBlockedReason(options: {
  hasReleased: boolean;
  hasUnreleasedOnly: boolean;
}): string | null {
  if (options.hasReleased) return null;
  if (options.hasUnreleasedOnly) {
    return "Results that have not been released cannot be printed.";
  }
  return null;
}
