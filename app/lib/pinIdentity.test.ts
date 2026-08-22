import { describe, expect, it } from "vitest";
import {
  DEFAULT_IDLE_LOCK_MINUTES,
  hashPin,
  isIdleLocked,
  isPinFormat,
  pinFormatError,
  verifyPin,
} from "./pinIdentity";

describe("PIN format", () => {
  it("accepts 4–6 digits only", () => {
    expect(isPinFormat("1234")).toBe(true);
    expect(isPinFormat("123456")).toBe(true);
    expect(isPinFormat("123")).toBe(false);
    expect(isPinFormat("12ab")).toBe(false);
    expect(pinFormatError("12")).toBe("The PIN must be 4–6 digits.");
  });
});

describe("hash and verify", () => {
  it("verifies the same PIN and rejects another", async () => {
    const record = await hashPin("2468");
    expect(await verifyPin("2468", record)).toBe(true);
    expect(await verifyPin("1357", record)).toBe(false);
    expect(await verifyPin("2468", null)).toBe(false);
  });
});

describe("idle lock", () => {
  it("locks after the configured idle period", () => {
    const now = Date.parse("2026-08-22T12:10:00.000Z");
    const active = Date.parse("2026-08-22T12:06:00.000Z");
    expect(isIdleLocked(active, now, DEFAULT_IDLE_LOCK_MINUTES)).toBe(false);
    expect(isIdleLocked(Date.parse("2026-08-22T12:04:00.000Z"), now, DEFAULT_IDLE_LOCK_MINUTES)).toBe(
      true
    );
    expect(isIdleLocked(null, now)).toBe(true);
  });
});
