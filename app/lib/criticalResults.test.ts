import { describe, expect, it } from "vitest";
import { criticalAwaitingCommunication, parseCriticalNotification } from "./criticalResults";

describe("criticalAwaitingCommunication", () => {
  it("ignores released orders that are not critical", () => {
    expect(
      criticalAwaitingCommunication({
        status: "approved",
        hasCritical: false,
      })
    ).toBe(false);
  });

  it("flags a released critical result with no notification", () => {
    expect(
      criticalAwaitingCommunication({
        status: "approved",
        hasCritical: true,
      })
    ).toBe(true);
  });

  it("clears after a successful notification", () => {
    const notification = parseCriticalNotification({
      notifiedName: "Dr Jallow",
      means: "phone",
      outcome: "read_back_ok",
      notifiedByUid: "u1",
      notifiedBy: "Fatou",
      at: "2026-08-22T10:00:00.000Z",
      readBack: true,
    });
    expect(
      criticalAwaitingCommunication({
        status: "approved",
        hasCritical: true,
        criticalNotification: notification,
      })
    ).toBe(false);
  });
});
