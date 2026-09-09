/**
 * Clinic money unit. Gambian dalasi today; change this one line to "CFA"
 * if LabFlow runs in Senegal.
 */
export const CURRENCY_SYMBOL = "D";

/** Catalogue / rollup money display — always carries {@link CURRENCY_SYMBOL}. */
export function formatMoney(value: number): string {
  const amount = value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  return `${CURRENCY_SYMBOL} ${amount}`;
}

/** Label for a price field, e.g. "Price (D)". */
export function priceFieldLabel(prefix = "Price"): string {
  return `${prefix} (${CURRENCY_SYMBOL})`;
}
