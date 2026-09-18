import { pluralPack, stockLevel } from "./inventory";

/**
 * Reorder alerting for the store.
 *
 * The cascade: the first time an item falls to its minimum a message goes out,
 * every further fall while it is still at or below that minimum sends another,
 * and reaching zero sends one last message that says so in words. A recorded
 * delivery that lifts the item back above its minimum closes the cycle, and the
 * next fall starts a fresh one.
 *
 * "Have we already said this" cannot be derived from the ledger, so that much
 * is stored per item. Stock levels themselves are still never stored — they are
 * summed from movements, as PRD 6.3 requires.
 */

export type ReorderAlertKind = "first" | "further" | "zero";

export type ReorderAlertState = {
  /** On-hand figure the last message quoted. Null when no cycle is open. */
  lastAlertedOnHand: number | null;
  zeroAlertSent: boolean;
};

export const NO_REORDER_ALERT: ReorderAlertState = {
  lastAlertedOnHand: null,
  zeroAlertSent: false,
};

export function parseReorderAlertState(value: unknown): ReorderAlertState {
  if (!value || typeof value !== "object") return { ...NO_REORDER_ALERT };
  const record = value as Record<string, unknown>;
  const last = record.lastAlertedOnHand;
  return {
    lastAlertedOnHand: typeof last === "number" && Number.isFinite(last) ? last : null,
    zeroAlertSent: record.zeroAlertSent === true,
  };
}

/**
 * Whether this item owes anyone a message, and the state to store once it has
 * been sent. A partial delivery that leaves the item below its minimum moves
 * the baseline up without sending anything, so the next fall is heard again.
 */
export function decideReorderAlert(
  input: { onHand: number; minimumStock: number },
  state: ReorderAlertState
): { kind: ReorderAlertKind | null; nextState: ReorderAlertState } {
  const level = stockLevel(input.onHand, input.minimumStock);

  if (level === "ok") {
    return { kind: null, nextState: { ...NO_REORDER_ALERT } };
  }

  if (level === "out") {
    if (state.zeroAlertSent) return { kind: null, nextState: state };
    return { kind: "zero", nextState: { lastAlertedOnHand: 0, zeroAlertSent: true } };
  }

  if (state.lastAlertedOnHand === null) {
    return {
      kind: "first",
      nextState: { lastAlertedOnHand: input.onHand, zeroAlertSent: false },
    };
  }

  if (input.onHand < state.lastAlertedOnHand) {
    return {
      kind: "further",
      nextState: { lastAlertedOnHand: input.onHand, zeroAlertSent: false },
    };
  }

  if (input.onHand > state.lastAlertedOnHand) {
    return {
      kind: null,
      nextState: { lastAlertedOnHand: input.onHand, zeroAlertSent: false },
    };
  }

  return { kind: null, nextState: state };
}

export type ReorderAlertRow = {
  itemId: string;
  name: string;
  department: string;
  packingUnit: string;
  onHand: number;
  minimumStock: number;
  kind: ReorderAlertKind;
};

export function reorderQuantityText(row: ReorderAlertRow): string {
  const left = `${row.onHand} ${pluralPack(row.packingUnit, row.onHand)}`;
  const min = `${row.minimumStock} ${pluralPack(row.packingUnit, row.minimumStock)}`;
  return `${left} left, minimum ${min}`;
}

/**
 * Colour is never the only carrier of meaning (work order rule 11), so the
 * state is written out as a word on every line and the two groups are
 * separated by position. The HTML adds weight and colour on top of that.
 */
export function reorderLineText(row: ReorderAlertRow): string {
  const state = row.kind === "zero" ? "OUT OF STOCK" : "LOW";
  const parts = [`${state}: ${row.name}`, row.department || "Bench", reorderQuantityText(row)];
  return parts.join(" · ");
}

export function sortReorderRows(rows: ReorderAlertRow[]): ReorderAlertRow[] {
  return [...rows].sort((a, b) => {
    if (a.kind === "zero" && b.kind !== "zero") return -1;
    if (b.kind === "zero" && a.kind !== "zero") return 1;
    return a.name.localeCompare(b.name);
  });
}

export function reorderDigestSubject(clinicName: string, rows: ReorderAlertRow[]): string {
  const outCount = rows.filter((row) => row.kind === "zero").length;
  const lead = outCount > 0 ? `${outCount} out of stock` : `${rows.length} low`;
  return `LabFlow stock alert: ${lead} · ${clinicName}`;
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export type ReorderDigest = {
  subject: string;
  text: string;
  html: string;
  outCount: number;
  lowCount: number;
};

/**
 * Returns null when nothing is owed, so the caller never sends an empty
 * message. Items at zero lead, because that is the one that stops work.
 */
export function buildReorderDigest(
  clinicName: string,
  rows: ReorderAlertRow[]
): ReorderDigest | null {
  if (rows.length === 0) return null;
  const sorted = sortReorderRows(rows);
  const out = sorted.filter((row) => row.kind === "zero");
  const low = sorted.filter((row) => row.kind !== "zero");

  const textParts: string[] = [`Stock alert for ${clinicName}.`, ""];
  if (out.length > 0) {
    textParts.push("OUT OF STOCK. Reorder now:");
    for (const row of out) textParts.push(`  ${reorderLineText(row)}`);
    textParts.push(
      "  No usable stock remains for the items above. Earlier low-stock messages were sent as each one fell.",
      ""
    );
  }
  if (low.length > 0) {
    textParts.push("LOW: at or below the minimum. Start the reorder process:");
    for (const row of low) textParts.push(`  ${reorderLineText(row)}`);
    textParts.push("");
  }
  textParts.push(
    "Recorded stock is summed from the movements ledger. Record deliveries in LabFlow so these messages stop."
  );

  const htmlParts: string[] = [
    `<p>Stock alert for ${escapeHtml(clinicName)}.</p>`,
  ];
  if (out.length > 0) {
    htmlParts.push(
      '<p style="color:#b91c1c;font-weight:700">OUT OF STOCK. Reorder now:</p>',
      '<ul style="color:#b91c1c;font-weight:700">',
      ...out.map((row) => `<li>${escapeHtml(reorderLineText(row))}</li>`),
      "</ul>",
      "<p>No usable stock remains for the items above. Earlier low-stock messages were sent as each one fell.</p>"
    );
  }
  if (low.length > 0) {
    htmlParts.push(
      "<p><strong>LOW: at or below the minimum. Start the reorder process:</strong></p>",
      "<ul>",
      ...low.map((row) => `<li>${escapeHtml(reorderLineText(row))}</li>`),
      "</ul>"
    );
  }
  htmlParts.push(
    "<p>Recorded stock is summed from the movements ledger. Record deliveries in LabFlow so these messages stop.</p>"
  );

  return {
    subject: reorderDigestSubject(clinicName, sorted),
    text: textParts.join("\n"),
    html: htmlParts.join(""),
    outCount: out.length,
    lowCount: low.length,
  };
}

/** Banner wording. Counts carry the meaning; colour only reinforces it. */
export function reorderBannerText(outCount: number, lowCount: number): string | null {
  if (outCount === 0 && lowCount === 0) return null;
  const parts: string[] = [];
  if (outCount > 0) parts.push(`${outCount} out of stock`);
  if (lowCount > 0) parts.push(`${lowCount} at or below minimum`);
  return `Stock needs reordering: ${parts.join(", ")}.`;
}
