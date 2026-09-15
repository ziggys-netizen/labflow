import { describe, expect, it } from "vitest";
import { CURRENCY_SYMBOL } from "./currency";
import {
  PAYMENT_METHODS,
  buildOrderPayment,
  formatPaymentAmount,
  formatPaymentSummary,
  methodNeedsReference,
  orderChargeTotal,
  parseOrderPayment,
  paymentInputError,
} from "./orderPayment";

describe("payment methods", () => {
  it("are exactly cash, mobile money transfer, and bank transfer", () => {
    expect([...PAYMENT_METHODS]).toEqual(["cash", "mobile_money", "bank_transfer"]);
  });

  it("need a transaction ID for both transfers and not for cash", () => {
    expect(methodNeedsReference("cash")).toBe(false);
    expect(methodNeedsReference("mobile_money")).toBe(true);
    expect(methodNeedsReference("bank_transfer")).toBe(true);
  });
});

describe("orderChargeTotal", () => {
  it("adds the catalogue prices of the ordered tests", () => {
    expect(
      orderChargeTotal([
        { code: "FBC", name: "Full Blood Count", price: 150 },
        { code: "MAL", name: "Malaria RDT", price: 200 },
      ])
    ).toEqual({ ok: true, amount: 350 });
  });

  it("does not drift on decimal prices", () => {
    expect(
      orderChargeTotal([
        { code: "A", name: "A", price: 0.1 },
        { code: "B", name: "B", price: 0.2 },
      ])
    ).toEqual({ ok: true, amount: 0.3 });
  });

  it("allows a free test priced at zero", () => {
    expect(orderChargeTotal([{ code: "F", name: "Free screen", price: 0 }])).toEqual({ ok: true, amount: 0 });
  });

  it("refuses to total when any test has no usable price, and names each one", () => {
    expect(
      orderChargeTotal([
        { code: "FBC", name: "Full Blood Count", price: 150 },
        { code: "LFT", name: "Liver Function" },
        { code: "U", name: "", price: Number.NaN },
        { code: "N", name: "Negative", price: -5 },
        { code: "S", name: "Text price", price: "200" },
      ])
    ).toEqual({ ok: false, missingPrice: ["Liver Function", "U", "Negative", "Text price"] });
  });
});

describe("paymentInputError", () => {
  it("requires a method", () => {
    expect(paymentInputError({ method: "", reference: "" })).toBe("Choose how the patient paid.");
    expect(paymentInputError({ method: "card", reference: "X123" })).toBe("Choose how the patient paid.");
  });

  it("accepts cash with no transaction ID, and ignores one typed anyway", () => {
    expect(paymentInputError({ method: "cash", reference: "" })).toBeNull();
    expect(paymentInputError({ method: "cash", reference: "whatever" })).toBeNull();
  });

  it("requires a transaction ID for mobile money and bank transfer", () => {
    expect(paymentInputError({ method: "mobile_money", reference: "   " })).toMatch(/transaction ID/);
    expect(paymentInputError({ method: "bank_transfer", reference: "" })).toMatch(/transaction ID/);
  });

  it("bounds the transaction ID length", () => {
    expect(paymentInputError({ method: "mobile_money", reference: "AB" })).toMatch(/3 to 64/);
    expect(paymentInputError({ method: "mobile_money", reference: "A".repeat(65) })).toMatch(/3 to 64/);
    expect(paymentInputError({ method: "mobile_money", reference: "A".repeat(64) })).toBeNull();
  });

  it("accepts ordinary transaction ID shapes and refuses control or non-ASCII characters", () => {
    expect(paymentInputError({ method: "mobile_money", reference: "MP240915.1234-AB" })).toBeNull();
    expect(paymentInputError({ method: "bank_transfer", reference: "TRX #00912/2026" })).toBeNull();
    expect(paymentInputError({ method: "bank_transfer", reference: "TRX\n0091" })).toMatch(/ordinary punctuation/);
    expect(paymentInputError({ method: "bank_transfer", reference: "TRX—0091" })).toMatch(/ordinary punctuation/);
  });
});

describe("buildOrderPayment", () => {
  const base = { amount: 350, recordedAt: "2026-09-15T10:00:00.000Z", recordedByUid: "u-cash", recordedByRole: "cashier" };

  it("stores cash without a reference", () => {
    expect(buildOrderPayment({ ...base, input: { method: "cash", reference: "ignored" } })).toEqual({
      method: "cash",
      amount: 350,
      currency: CURRENCY_SYMBOL,
      reference: null,
      recordedAt: base.recordedAt,
      recordedByUid: "u-cash",
      recordedByRole: "cashier",
    });
  });

  it("stores the trimmed transaction ID for a transfer", () => {
    expect(buildOrderPayment({ ...base, input: { method: "mobile_money", reference: "  MP-9981  " } }).reference).toBe(
      "MP-9981"
    );
  });

  it("refuses to build from invalid input", () => {
    expect(() => buildOrderPayment({ ...base, input: { method: "bank_transfer", reference: "" } })).toThrow(
      /transaction ID/
    );
  });
});

describe("formatPaymentSummary", () => {
  const record = {
    amount: 1250,
    currency: "D",
    recordedAt: "2026-09-15T10:00:00.000Z",
    recordedByUid: "u1",
    recordedByRole: "cashier",
  };

  it("names cash in words with the amount", () => {
    expect(formatPaymentSummary({ ...record, method: "cash", reference: null })).toBe("D 1,250.00 · Cash");
  });

  it("adds the transaction ID for a transfer", () => {
    expect(formatPaymentSummary({ ...record, method: "mobile_money", reference: "MP-77" })).toBe(
      "D 1,250.00 · Mobile money transfer · Ref MP-77"
    );
    expect(formatPaymentAmount({ amount: 0.3, currency: "D" })).toBe("D 0.30");
  });
});

describe("parseOrderPayment", () => {
  it("round-trips a built record", () => {
    const built = buildOrderPayment({
      input: { method: "bank_transfer", reference: "BT-7788" },
      amount: 125.5,
      recordedAt: "2026-09-15T10:00:00.000Z",
      recordedByUid: "u1",
      recordedByRole: "cashier",
    });
    expect(parseOrderPayment(built)).toEqual(built);
  });

  it("treats absent or malformed data as no payment on record", () => {
    expect(parseOrderPayment(undefined)).toBeNull();
    expect(parseOrderPayment(null)).toBeNull();
    expect(parseOrderPayment([])).toBeNull();
    expect(parseOrderPayment({ method: "card", amount: 10 })).toBeNull();
    expect(parseOrderPayment({ method: "cash", amount: -1 })).toBeNull();
    expect(parseOrderPayment({ method: "cash", amount: "10" })).toBeNull();
    expect(parseOrderPayment({ method: "mobile_money", amount: 10, reference: "" })).toBeNull();
  });
});
