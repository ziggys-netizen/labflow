"use client";

import { CURRENCY_SYMBOL } from "./currency";
import {
  PAYMENT_METHODS,
  PAYMENT_METHOD_LABELS,
  PAYMENT_REFERENCE_MAX,
  formatPaymentAmount,
  isPaymentMethod,
  methodNeedsReference,
  type OrderCharge,
} from "./orderPayment";

/**
 * Payment section shared by ordering tests and billing a service — same
 * fields, same amount-due / missing-price display, same validation. Neither
 * caller repeats this; each only supplies what it is charging for.
 */
export default function PaymentFieldset({
  required,
  charge,
  emptyMessage,
  method,
  onMethodChange,
  reference,
  onReferenceChange,
}: {
  required: boolean;
  /** null while nothing chargeable is selected yet. */
  charge: OrderCharge | null;
  /** Shown in place of the amount when `charge` is null, e.g. "Select tests to see the amount due." */
  emptyMessage: string;
  method: string;
  onMethodChange: (method: string) => void;
  reference: string;
  onReferenceChange: (reference: string) => void;
}) {
  return (
    <fieldset className="mb-6 rounded-lg border border-gray-200 p-4">
      <legend className="px-1 text-sm font-medium text-gray-700">
        Payment{required ? "" : " (optional)"}
      </legend>
      {!charge ? (
        <p className="text-sm text-gray-500 mb-3">{emptyMessage}</p>
      ) : !charge.ok ? (
        <p className="text-sm text-red-900 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">
          <span className="font-semibold">Price missing:</span> {charge.missingPrice.join(", ")}. Ask
          the lab manager to set it in Catalogue before taking payment.
        </p>
      ) : (
        <p className="text-sm text-gray-900 mb-3">
          Amount due:{" "}
          <span className="lf-num font-semibold">
            {formatPaymentAmount({ amount: charge.amount, currency: CURRENCY_SYMBOL })}
          </span>
        </p>
      )}
      <div className="flex flex-col gap-2 mb-3" role="radiogroup" aria-label="Payment method">
        {PAYMENT_METHODS.map((m) => (
          <label key={m} className="lf-touch flex items-center gap-3 text-sm text-gray-900">
            <input
              type="radio"
              name="payment-method"
              value={m}
              checked={method === m}
              onChange={() => onMethodChange(m)}
            />
            {PAYMENT_METHOD_LABELS[m]}
          </label>
        ))}
      </div>
      {isPaymentMethod(method) && methodNeedsReference(method) && (
        <label className="block text-sm text-gray-700">
          Transaction ID
          <input
            type="text"
            value={reference}
            onChange={(e) => onReferenceChange(e.target.value)}
            maxLength={PAYMENT_REFERENCE_MAX}
            autoComplete="off"
            placeholder="As shown on the patient's confirmation"
            className="lf-num mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
          />
        </label>
      )}
      <p className="text-xs text-gray-500 mt-3">Recorded with the order and cannot be changed afterwards.</p>
    </fieldset>
  );
}
