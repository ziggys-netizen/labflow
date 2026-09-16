import { describe, expect, it } from "vitest";
import {
  NO_REORDER_ALERT,
  buildReorderDigest,
  decideReorderAlert,
  parseReorderAlertState,
  reorderBannerText,
  reorderDigestSubject,
  reorderLineText,
  sortReorderRows,
  type ReorderAlertRow,
  type ReorderAlertState,
} from "./lowStock";

const RDT_MIN = 10;

function row(overrides: Partial<ReorderAlertRow> = {}): ReorderAlertRow {
  return {
    itemId: "i1",
    name: "Malaria RDT",
    department: "Parasitology",
    packingUnit: "Kit",
    onHand: 4,
    minimumStock: RDT_MIN,
    kind: "further",
    ...overrides,
  };
}

describe("reorder alert cascade", () => {
  it("says nothing while stock is above the minimum", () => {
    const result = decideReorderAlert({ onHand: 25, minimumStock: RDT_MIN }, NO_REORDER_ALERT);
    expect(result.kind).toBeNull();
    expect(result.nextState).toEqual(NO_REORDER_ALERT);
  });

  it("sends the first message when stock first touches the minimum", () => {
    const result = decideReorderAlert({ onHand: 10, minimumStock: RDT_MIN }, NO_REORDER_ALERT);
    expect(result.kind).toBe("first");
    expect(result.nextState).toEqual({ lastAlertedOnHand: 10, zeroAlertSent: false });
  });

  it("does not repeat itself when nothing has moved", () => {
    const state: ReorderAlertState = { lastAlertedOnHand: 10, zeroAlertSent: false };
    const result = decideReorderAlert({ onHand: 10, minimumStock: RDT_MIN }, state);
    expect(result.kind).toBeNull();
    expect(result.nextState).toEqual(state);
  });

  it("sends another message on every further fall, by one or by more", () => {
    let state: ReorderAlertState = { lastAlertedOnHand: 10, zeroAlertSent: false };

    const toNine = decideReorderAlert({ onHand: 9, minimumStock: RDT_MIN }, state);
    expect(toNine.kind).toBe("further");
    state = toNine.nextState;

    const toEight = decideReorderAlert({ onHand: 8, minimumStock: RDT_MIN }, state);
    expect(toEight.kind).toBe("further");
    state = toEight.nextState;

    const toSix = decideReorderAlert({ onHand: 6, minimumStock: RDT_MIN }, state);
    expect(toSix.kind).toBe("further");
    expect(toSix.nextState.lastAlertedOnHand).toBe(6);
  });

  it("walks Isaac's RDT example end to end: 10 down to zero", () => {
    const sequence = [10, 9, 8, 6, 3, 0];
    const kinds: Array<string | null> = [];
    let state = { ...NO_REORDER_ALERT };
    for (const onHand of sequence) {
      const result = decideReorderAlert({ onHand, minimumStock: RDT_MIN }, state);
      kinds.push(result.kind);
      state = result.nextState;
    }
    expect(kinds).toEqual(["first", "further", "further", "further", "further", "zero"]);
    expect(state).toEqual({ lastAlertedOnHand: 0, zeroAlertSent: true });
  });

  it("sends the zero message once and then stays quiet", () => {
    const afterZero: ReorderAlertState = { lastAlertedOnHand: 0, zeroAlertSent: true };
    const again = decideReorderAlert({ onHand: 0, minimumStock: RDT_MIN }, afterZero);
    expect(again.kind).toBeNull();
    expect(again.nextState).toEqual(afterZero);
  });

  it("goes straight to the zero message when stock falls from low to nothing", () => {
    const state: ReorderAlertState = { lastAlertedOnHand: 4, zeroAlertSent: false };
    const result = decideReorderAlert({ onHand: 0, minimumStock: RDT_MIN }, state);
    expect(result.kind).toBe("zero");
    expect(result.nextState.zeroAlertSent).toBe(true);
  });

  it("a delivery that does not clear the minimum re-baselines without sending", () => {
    const afterZero: ReorderAlertState = { lastAlertedOnHand: 0, zeroAlertSent: true };
    const restocked = decideReorderAlert({ onHand: 5, minimumStock: RDT_MIN }, afterZero);
    expect(restocked.kind).toBeNull();
    expect(restocked.nextState).toEqual({ lastAlertedOnHand: 5, zeroAlertSent: false });

    const fallsAgain = decideReorderAlert({ onHand: 4, minimumStock: RDT_MIN }, restocked.nextState);
    expect(fallsAgain.kind).toBe("further");
  });

  it("a delivery above the minimum closes the cycle and the next fall starts a new one", () => {
    const open: ReorderAlertState = { lastAlertedOnHand: 2, zeroAlertSent: false };
    const cleared = decideReorderAlert({ onHand: 40, minimumStock: RDT_MIN }, open);
    expect(cleared.kind).toBeNull();
    expect(cleared.nextState).toEqual(NO_REORDER_ALERT);

    const newCycle = decideReorderAlert({ onHand: 10, minimumStock: RDT_MIN }, cleared.nextState);
    expect(newCycle.kind).toBe("first");
  });

  it("raising the minimum above current stock opens a cycle", () => {
    const result = decideReorderAlert({ onHand: 15, minimumStock: 20 }, NO_REORDER_ALERT);
    expect(result.kind).toBe("first");
  });

  it("an item left at minimum zero never reports low, but still reports empty", () => {
    const low = decideReorderAlert({ onHand: 3, minimumStock: 0 }, NO_REORDER_ALERT);
    expect(low.kind).toBeNull();

    const empty = decideReorderAlert({ onHand: 0, minimumStock: 0 }, NO_REORDER_ALERT);
    expect(empty.kind).toBe("zero");
  });

  it("treats negative on-hand as empty rather than low", () => {
    const result = decideReorderAlert({ onHand: -2, minimumStock: RDT_MIN }, NO_REORDER_ALERT);
    expect(result.kind).toBe("zero");
  });
});

describe("stored alert state", () => {
  it("reads a missing or malformed value as no cycle open", () => {
    expect(parseReorderAlertState(undefined)).toEqual(NO_REORDER_ALERT);
    expect(parseReorderAlertState(null)).toEqual(NO_REORDER_ALERT);
    expect(parseReorderAlertState("nonsense")).toEqual(NO_REORDER_ALERT);
    expect(parseReorderAlertState({ lastAlertedOnHand: "8" })).toEqual(NO_REORDER_ALERT);
  });

  it("reads a stored cycle back", () => {
    expect(parseReorderAlertState({ lastAlertedOnHand: 8, zeroAlertSent: false })).toEqual({
      lastAlertedOnHand: 8,
      zeroAlertSent: false,
    });
    expect(parseReorderAlertState({ lastAlertedOnHand: 0, zeroAlertSent: true })).toEqual({
      lastAlertedOnHand: 0,
      zeroAlertSent: true,
    });
  });

  it("keeps a stored zero of lastAlertedOnHand distinct from no cycle", () => {
    expect(parseReorderAlertState({ lastAlertedOnHand: 0 }).lastAlertedOnHand).toBe(0);
  });
});

describe("digest wording", () => {
  it("carries the state as a word, not only as colour", () => {
    expect(reorderLineText(row({ kind: "zero", onHand: 0 }))).toContain("OUT OF STOCK");
    expect(reorderLineText(row({ kind: "first", onHand: 10 }))).toContain("LOW");
    expect(reorderLineText(row({ kind: "further", onHand: 4 }))).toContain("LOW");
  });

  it("pluralises the packing unit", () => {
    expect(reorderLineText(row({ onHand: 1, minimumStock: 10 }))).toContain("1 Kit left");
    expect(reorderLineText(row({ onHand: 4, minimumStock: 10 }))).toContain("4 Kits left");
    expect(reorderLineText(row({ onHand: 4, minimumStock: 1 }))).toContain("minimum 1 Kit");
  });

  it("puts out-of-stock items first", () => {
    const sorted = sortReorderRows([
      row({ itemId: "a", name: "Zinc sulphate", kind: "further" }),
      row({ itemId: "b", name: "Malaria RDT", kind: "zero" }),
      row({ itemId: "c", name: "Alcohol swabs", kind: "first" }),
    ]);
    expect(sorted.map((r) => r.itemId)).toEqual(["b", "c", "a"]);
  });

  it("leads the subject with the empty shelves when there are any", () => {
    const rows = [row({ kind: "zero" }), row({ itemId: "i2", kind: "first" })];
    expect(reorderDigestSubject("Medic Aid", rows)).toContain("1 out of stock");
    expect(reorderDigestSubject("Medic Aid", [row({ kind: "first" })])).toContain("1 low");
  });

  it("returns nothing when nothing is owed", () => {
    expect(buildReorderDigest("Medic Aid", [])).toBeNull();
  });

  it("builds both sections, in words, in text and HTML", () => {
    const digest = buildReorderDigest("Medic Aid", [
      row({ itemId: "a", name: "Malaria RDT", kind: "zero", onHand: 0 }),
      row({ itemId: "b", name: "Alcohol swabs", kind: "further", onHand: 3 }),
    ]);
    expect(digest).not.toBeNull();
    expect(digest!.outCount).toBe(1);
    expect(digest!.lowCount).toBe(1);
    expect(digest!.text).toContain("OUT OF STOCK");
    expect(digest!.text).toContain("LOW");
    expect(digest!.text).toContain("Malaria RDT");
    expect(digest!.text).toContain("Alcohol swabs");
    expect(digest!.html).toContain("OUT OF STOCK");
    expect(digest!.html).toContain("LOW");
    expect(digest!.text.indexOf("Malaria RDT")).toBeLessThan(digest!.text.indexOf("Alcohol swabs"));
  });

  it("escapes item names in the HTML body", () => {
    const digest = buildReorderDigest("Medic Aid", [
      row({ name: '<script>alert("x")</script>', kind: "first" }),
    ]);
    expect(digest!.html).not.toContain("<script>");
    expect(digest!.html).toContain("&lt;script&gt;");
  });
});

describe("banner wording", () => {
  it("says nothing when the store is healthy", () => {
    expect(reorderBannerText(0, 0)).toBeNull();
  });

  it("names both states in words", () => {
    expect(reorderBannerText(2, 3)).toBe("Stock needs reordering: 2 out of stock, 3 at or below minimum.");
    expect(reorderBannerText(0, 1)).toBe("Stock needs reordering: 1 at or below minimum.");
    expect(reorderBannerText(1, 0)).toBe("Stock needs reordering: 1 out of stock.");
  });
});
