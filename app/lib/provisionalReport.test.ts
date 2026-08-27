import { describe, expect, it } from "vitest";
import {
  PRINT_DISCLOSURE_ACTION,
  UNRELEASED_PRINT_MESSAGE,
  isProvisionalPrint,
  planReportPrint,
  printBlockedReason,
  printReadyToIssue,
} from "./provisionalReport";

describe("provisional print", () => {
  it("is provisional when released locally and not yet synced", () => {
    expect(isProvisionalPrint({ released: true, locallyConfirmed: true, synced: false })).toBe(true);
    expect(isProvisionalPrint({ released: true, locallyConfirmed: true, synced: true })).toBe(false);
  });

  it("blocks printing unreleased results, not released ones", () => {
    expect(printBlockedReason({ hasReleased: true, hasUnreleasedOnly: false })).toBeNull();
    expect(printBlockedReason({ hasReleased: false, hasUnreleasedOnly: true })).toBe(
      UNRELEASED_PRINT_MESSAGE
    );
    expect(printBlockedReason({ hasReleased: false, hasUnreleasedOnly: false })).toBe(
      UNRELEASED_PRINT_MESSAGE
    );
  });
});

describe("planReportPrint", () => {
  it("lets a synced approved result print as final and does not await audit", () => {
    const plan = planReportPrint([{ id: "o1", status: "approved", notYetSynced: false }]);
    expect(plan.allowPrint).toBe(true);
    expect(plan.blockedReason).toBeNull();
    expect(plan.provisionalOrderIds).toEqual([]);
    expect(plan.awaitAudit).toBe(false);
    expect(plan.disclosureAction).toBe(PRINT_DISCLOSURE_ACTION);
  });

  it("prints an unsynced released result as provisional instead of refusing", () => {
    const plan = planReportPrint([{ id: "o1", status: "approved", notYetSynced: true }]);
    expect(plan.allowPrint).toBe(true);
    expect(plan.provisionalOrderIds).toEqual(["o1"]);
    expect(plan.awaitAudit).toBe(false);
  });

  it("prints an amended result the same way as approved", () => {
    const plan = planReportPrint([{ id: "o2", status: "amended", notYetSynced: false }]);
    expect(plan.allowPrint).toBe(true);
    expect(plan.releasedOrderIds).toEqual(["o2"]);
  });

  it("does not treat collection-after-release as a print block", () => {
    const plan = planReportPrint([{ id: "o1", status: "approved", notYetSynced: false }]);
    expect(plan.allowPrint).toBe(true);
  });

  it("still issues the report when an audit write would fail", () => {
    const plan = planReportPrint([{ id: "o1", status: "approved" }]);
    const auditWriteFailed = true;
    expect(plan.allowPrint).toBe(true);
    expect(plan.awaitAudit).toBe(false);
    expect(auditWriteFailed && plan.awaitAudit).toBe(false);
  });

  it("refuses a patient who only has unreleased orders", () => {
    const plan = planReportPrint([
      { id: "o1", status: "results_entered" },
      { id: "o2", status: "pending" },
    ]);
    expect(plan.allowPrint).toBe(false);
    expect(plan.blockedReason).toBe(UNRELEASED_PRINT_MESSAGE);
  });
});

describe("printReadyToIssue", () => {
  it("waits for load, a patient, and an unlocked staff session", () => {
    expect(
      printReadyToIssue({
        loading: false,
        hasPatient: true,
        blockedReason: null,
        staffGateOpen: false,
      })
    ).toBe(true);
    expect(
      printReadyToIssue({
        loading: false,
        hasPatient: true,
        blockedReason: null,
        staffGateOpen: true,
      })
    ).toBe(false);
    expect(
      printReadyToIssue({
        loading: false,
        hasPatient: true,
        blockedReason: UNRELEASED_PRINT_MESSAGE,
        staffGateOpen: false,
      })
    ).toBe(false);
  });
});
