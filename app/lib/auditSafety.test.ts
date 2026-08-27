import { describe, expect, it } from "vitest";
import {
  auditFailureSummary,
  auditRejectionReason,
  scheduleSafeAudit,
} from "./auditSafety";

describe("scheduleSafeAudit", () => {
  it("returns before the write settles, so clinical callers are not blocked", () => {
    let settled = false;
    scheduleSafeAudit(
      () =>
        new Promise((resolve) => {
          setTimeout(() => {
            settled = true;
            resolve(undefined);
          }, 50);
        }),
      () => {}
    );
    expect(settled).toBe(false);
  });

  it("surfaces a write failure without throwing to the caller", async () => {
    const seen: unknown[] = [];
    const done = new Promise<void>((resolve) => {
      scheduleSafeAudit(
        async () => {
          throw Object.assign(new Error("Missing permissions"), { code: "permission-denied" });
        },
        (err) => {
          seen.push(err);
          resolve();
        }
      );
    });
    await done;
    expect(seen).toHaveLength(1);
    expect(auditRejectionReason(seen[0])).toBe(
      "The audit record was denied. The clinical action still stands."
    );
  });
});

describe("audit failure copy", () => {
  it("names the action so Sync problems can show an audit miss", () => {
    expect(auditFailureSummary("disclosure.print")).toBe(
      "Audit record was not saved (disclosure.print)"
    );
  });
});
