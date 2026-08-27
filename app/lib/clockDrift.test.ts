import { describe, expect, it } from "vitest";
import { CLOCK_DRIFT_WARN_MS, clockDriftWarning, parseServerNow } from "./clockDrift";

describe("clock drift warning", () => {
  it("stays quiet within two minutes and warns beyond", () => {
    const server = Date.parse("2026-08-23T12:00:00.000Z");
    expect(clockDriftWarning(server + 60_000, server)).toBeNull();
    expect(clockDriftWarning(server + CLOCK_DRIFT_WARN_MS + 1, server)).toContain("two minutes");
    expect(clockDriftWarning(server, null)).toBeNull();
  });

  it("parses an ISO server time", () => {
    expect(parseServerNow("2026-08-23T12:00:00.000Z")).toBe(Date.parse("2026-08-23T12:00:00.000Z"));
    expect(parseServerNow("nope")).toBeNull();
  });
});
