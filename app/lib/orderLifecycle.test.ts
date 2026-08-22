import { describe, expect, it } from "vitest";
import {
  canCancelStatus,
  canEnterResultsForStatus,
  canRejectStatus,
  canReleaseStatus,
  isTerminalOrderStatus,
  orderDisplayLabel,
} from "./orderLifecycle";

describe("order lifecycle", () => {
  it("treats only rejected and cancelled as terminal", () => {
    expect(isTerminalOrderStatus("approved")).toBe(false);
    expect(isTerminalOrderStatus("amended")).toBe(false);
    expect(isTerminalOrderStatus("rejected")).toBe(true);
    expect(isTerminalOrderStatus("cancelled")).toBe(true);
  });

  it("blocks release of a rejected specimen", () => {
    expect(canReleaseStatus("rejected")).toBe(false);
    expect(canReleaseStatus("results_entered")).toBe(true);
    expect(canEnterResultsForStatus("rejected")).toBe(false);
    expect(canRejectStatus("pending")).toBe(true);
    expect(canCancelStatus("pending")).toBe(true);
    expect(canCancelStatus("results_entered")).toBe(false);
  });

  it("names statuses as next actions", () => {
    expect(orderDisplayLabel({ status: "pending", tests: [] }).label).toBe("Enter results");
    expect(orderDisplayLabel({ status: "results_entered", tests: [] }).label).toBe("Ready to release");
    expect(orderDisplayLabel({ status: "rejected", tests: [] }).label).toBe("Cannot test");
  });
});
