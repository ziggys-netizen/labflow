/**
 * Offline print of a released, locally-confirmed result is a provisional
 * report (PRD v0.5 §9.4). Final heading waits until the write has synced.
 * Unsynced released results still print — they are not blocked.
 */

import { isReleasedResultStatus } from "./resultAmendment";

export const PROVISIONAL_HEADING = "PROVISIONAL REPORT";
export const PROVISIONAL_NOTICE =
  "Provisional — not yet confirmed to the laboratory record. A final report will follow.";

export const PRINT_DISCLOSURE_ACTION = "disclosure.print" as const;

export const UNRELEASED_PRINT_MESSAGE = "Results that have not been released cannot be printed.";

export function isProvisionalPrint(options: {
  released: boolean;
  locallyConfirmed: boolean;
  synced: boolean;
}): boolean {
  return options.released && options.locallyConfirmed && !options.synced;
}

/**
 * Only unreleased results are refused. Unsynced, collection-after-release,
 * and audit-write failure must not block an issuable report.
 */
export function printBlockedReason(options: {
  hasReleased: boolean;
  hasUnreleasedOnly?: boolean;
}): string | null {
  if (options.hasReleased) return null;
  return UNRELEASED_PRINT_MESSAGE;
}

export type PrintableOrder = {
  id: string;
  status: string;
  notYetSynced?: boolean;
};

export type ReportPrintPlan = {
  blockedReason: string | null;
  allowPrint: boolean;
  provisionalOrderIds: string[];
  releasedOrderIds: string[];
  awaitAudit: false;
  disclosureAction: typeof PRINT_DISCLOSURE_ACTION;
};

export function planReportPrint(orders: PrintableOrder[]): ReportPrintPlan {
  const released = orders.filter((order) => isReleasedResultStatus(order.status));
  const blockedReason = printBlockedReason({ hasReleased: released.length > 0 });
  return {
    blockedReason,
    allowPrint: blockedReason === null,
    releasedOrderIds: released.map((order) => order.id),
    provisionalOrderIds: released
      .filter((order) =>
        isProvisionalPrint({
          released: true,
          locallyConfirmed: true,
          synced: !order.notYetSynced,
        })
      )
      .map((order) => order.id),
    awaitAudit: false,
    disclosureAction: PRINT_DISCLOSURE_ACTION,
  };
}

/** Auto-print only after the sheet is on screen and the PIN overlay is gone. */
export function printReadyToIssue(options: {
  loading: boolean;
  hasPatient: boolean;
  blockedReason: string | null;
  staffGateOpen: boolean;
}): boolean {
  return (
    !options.loading &&
    options.hasPatient &&
    !options.blockedReason &&
    !options.staffGateOpen
  );
}
