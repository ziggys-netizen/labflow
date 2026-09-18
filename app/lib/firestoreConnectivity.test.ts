import { describe, it, expect } from "vitest";
import {
  CONNECTING_SLOWLY,
  OFFLINE_FIRST_SIGN_IN,
  RECONNECT_RETRY_MS,
  unreachableMessage,
} from "./firestoreConnectivity";

describe("unreachableMessage", () => {
  it("tells a connected device it is slow, not that it must connect", () => {
    expect(unreachableMessage(true)).toBe(CONNECTING_SLOWLY);
    expect(unreachableMessage(true)).not.toMatch(/offline|sign in once/i);
  });

  it("tells an offline device what it needs, and why", () => {
    const text = unreachableMessage(false);
    expect(text).toBe(OFFLINE_FIRST_SIGN_IN);
    expect(text).toMatch(/offline/i);
    expect(text).toMatch(/connect/i);
  });

  it("offers a way forward either way", () => {
    expect(CONNECTING_SLOWLY).toMatch(/keeps trying|Retry/);
    expect(OFFLINE_FIRST_SIGN_IN).toMatch(/Connect to the internet/);
  });
});

describe("RECONNECT_RETRY_MS", () => {
  it("nudges often enough to matter but not so often it hammers a weak link", () => {
    expect(RECONNECT_RETRY_MS).toBeGreaterThanOrEqual(5_000);
    expect(RECONNECT_RETRY_MS).toBeLessThanOrEqual(30_000);
  });
});
