import { describe, expect, it } from "vitest";
import { isProvisionalPrint, printBlockedReason } from "./provisionalReport";

describe("provisional print", () => {
  it("is provisional when released locally and not yet synced", () => {
    expect(isProvisionalPrint({ released: true, locallyConfirmed: true, synced: false })).toBe(true);
    expect(isProvisionalPrint({ released: true, locallyConfirmed: true, synced: true })).toBe(false);
  });

  it("blocks printing unreleased results, not released ones", () => {
    expect(printBlockedReason({ hasReleased: true, hasUnreleasedOnly: false })).toBeNull();
    expect(printBlockedReason({ hasReleased: false, hasUnreleasedOnly: true })).toBe(
      "Results that have not been released cannot be printed."
    );
  });
});
