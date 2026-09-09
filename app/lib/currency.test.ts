import { describe, expect, it } from "vitest";
import { CURRENCY_SYMBOL, formatMoney, priceFieldLabel } from "./currency";

describe("currency", () => {
  it("keeps a single symbol constant (Gambian dalasi)", () => {
    expect(CURRENCY_SYMBOL).toBe("D");
  });

  it("prefixes formatted amounts", () => {
    expect(formatMoney(0)).toBe("D 0.00");
    expect(formatMoney(150)).toMatch(/^D /);
    expect(formatMoney(150)).toMatch(/150/);
  });

  it("builds price field labels from the constant", () => {
    expect(priceFieldLabel()).toBe("Price (D)");
  });
});
