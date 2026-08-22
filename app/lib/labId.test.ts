import { describe, expect, it } from "vitest";
import { generateLabId, isLabId, specimenIdentifier } from "./labId";

describe("generateLabId", () => {
  it("uses the clinic-visible format and a per-device suffix", () => {
    const a = generateLabId(new Date("2026-08-22T10:00:00"), "A3");
    const b = generateLabId(new Date("2026-08-22T10:00:00"), "B7");
    expect(isLabId(a)).toBe(true);
    expect(isLabId(b)).toBe(true);
    expect(a.startsWith("LF-20260822-A3")).toBe(true);
    expect(b.startsWith("LF-20260822-B7")).toBe(true);
    expect(a).not.toBe(b);
  });

  it("does not collide two devices on the same day", () => {
    const ids = new Set([
      generateLabId(new Date("2026-08-22T08:00:00"), "A1"),
      generateLabId(new Date("2026-08-22T08:00:00"), "C9"),
    ]);
    expect(ids.size).toBe(2);
  });
});

describe("specimenIdentifier", () => {
  it("is handwritten-readable as labId-specimenType", () => {
    expect(specimenIdentifier("LF-20260822-A301", "blood")).toBe("LF-20260822-A301-blood");
  });
});
