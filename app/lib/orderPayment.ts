/**
 * Payment recorded against an order at the moment it is placed.
 *
 * LabFlow records what the cashier collected. It does not move money: there is
 * no gateway, no refund, no reconciliation with a mobile money or bank API.
 * Owner decision (15 September 2026): cash, mobile money transfer, or bank
 * transfer; the two transfers carry the transaction ID the patient shows.
 *
 * The amount is the sum of the catalogue prices of the ordered tests at the
 * time of ordering, stored on the order so a later price change does not
 * rewrite what was collected. A test without a price blocks the charge — a
 * total that silently treats a missing price as zero would under-record.
 *
 * Once written, the record is not edited. firestore.rules refuses any update
 * that changes it. A wrong entry is a correction for a later, audited flow,
 * not an overwrite.
 */

import { CURRENCY_SYMBOL } from "./currency";

export const PAYMENT_METHODS = ["cash", "mobile_money", "bank_transfer"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  cash: "Cash",
  mobile_money: "Mobile money transfer",
  bank_transfer: "Bank transfer",
};

export const PAYMENT_REFERENCE_MIN = 3;
export const PAYMENT_REFERENCE_MAX = 64;

export function isPaymentMethod(value: unknown): value is PaymentMethod {
  return typeof value === "string" && (PAYMENT_METHODS as readonly string[]).includes(value);
}

/** Cash has no transaction to point at; both transfers do. */
export function methodNeedsReference(method: PaymentMethod): boolean {
  return method !== "cash";
}

export type ChargeableTest = { code: string; name: string; price?: unknown };

export type OrderCharge =
  | { ok: true; amount: number }
  | { ok: false; missingPrice: string[] };

/** Money is summed in minor units so 0.1 + 0.2 records as 0.30, not 0.30000000000000004. */
export function orderChargeTotal(tests: ChargeableTest[]): OrderCharge {
  const missingPrice: string[] = [];
  let minor = 0;
  for (const test of tests) {
    const price = test.price;
    if (typeof price !== "number" || !Number.isFinite(price) || price < 0) {
      missingPrice.push(test.name || test.code);
      continue;
    }
    minor += Math.round(price * 100);
  }
  if (missingPrice.length > 0) return { ok: false, missingPrice };
  return { ok: true, amount: minor / 100 };
}

export type PaymentInput = { method: string; reference: string };

/** Printable ASCII only: a transaction ID is copied off a phone or a slip, never prose. */
const REFERENCE_PATTERN = /^[\x21-\x7E](?:[\x20-\x7E]*[\x21-\x7E])?$/;

/** Null when the input can be recorded; otherwise the message to show. */
export function paymentInputError(input: PaymentInput): string | null {
  if (!isPaymentMethod(input.method)) return "Choose how the patient paid.";
  if (!methodNeedsReference(input.method)) return null;
  const reference = input.reference.trim();
  if (!reference) {
    return `Enter the transaction ID for the ${PAYMENT_METHOD_LABELS[input.method].toLowerCase()}.`;
  }
  if (reference.length < PAYMENT_REFERENCE_MIN || reference.length > PAYMENT_REFERENCE_MAX) {
    return `A transaction ID is ${PAYMENT_REFERENCE_MIN} to ${PAYMENT_REFERENCE_MAX} characters.`;
  }
  if (!REFERENCE_PATTERN.test(reference)) {
    return "A transaction ID uses letters, numbers and ordinary punctuation only.";
  }
  return null;
}

export type OrderPayment = {
  method: PaymentMethod;
  amount: number;
  currency: string;
  /** Present for mobile money and bank transfer; null for cash. */
  reference: string | null;
  recordedAt: string;
  recordedByUid: string;
  recordedByRole: string;
};

export function buildOrderPayment(options: {
  input: PaymentInput;
  amount: number;
  recordedAt: string;
  recordedByUid: string;
  recordedByRole: string;
}): OrderPayment {
  const error = paymentInputError(options.input);
  if (error) throw new Error(error);
  const method = options.input.method as PaymentMethod;
  return {
    method,
    amount: options.amount,
    currency: CURRENCY_SYMBOL,
    reference: methodNeedsReference(method) ? options.input.reference.trim() : null,
    recordedAt: options.recordedAt,
    recordedByUid: options.recordedByUid,
    recordedByRole: options.recordedByRole,
  };
}

export function formatPaymentAmount(payment: Pick<OrderPayment, "amount" | "currency">): string {
  const amount = payment.amount.toLocaleString("en-GB", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${payment.currency} ${amount}`;
}

/** One line in words: amount, method, and the transaction ID when there is one. */
export function formatPaymentSummary(payment: OrderPayment): string {
  const parts = [formatPaymentAmount(payment), PAYMENT_METHOD_LABELS[payment.method]];
  if (payment.reference) parts.push(`Ref ${payment.reference}`);
  return parts.join(" · ");
}

/** Read a stored payment back. Anything malformed is treated as no payment on record. */
export function parseOrderPayment(value: unknown): OrderPayment | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  if (!isPaymentMethod(data.method)) return null;
  if (typeof data.amount !== "number" || !Number.isFinite(data.amount) || data.amount < 0) return null;
  const reference = typeof data.reference === "string" && data.reference.trim() ? data.reference : null;
  if (methodNeedsReference(data.method) && !reference) return null;
  return {
    method: data.method,
    amount: data.amount,
    currency: typeof data.currency === "string" && data.currency ? data.currency : CURRENCY_SYMBOL,
    reference: methodNeedsReference(data.method) ? reference : null,
    recordedAt: typeof data.recordedAt === "string" ? data.recordedAt : "",
    recordedByUid: typeof data.recordedByUid === "string" ? data.recordedByUid : "",
    recordedByRole: typeof data.recordedByRole === "string" ? data.recordedByRole : "",
  };
}
