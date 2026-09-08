import { describe, expect, it } from "vitest";
import { CLINICAL_FLAG_LETTERS, isClinicalFlagLetter } from "./clinicalFlag";
import {
  OPERATIONAL_CHIP_WORDS,
  clinicalGreyscaleIdentity,
  countOperationalQueue,
  formatDurationToken,
  formatOperationalChipLabel,
  operationalChipClass,
  operationalFromOrder,
  operationalGreyscaleIdentity,
  operationalHasColour,
  operationalStripeClass,
  resolveOperationalFlag,
} from "./operationalFlag";
import { SAMPLE_COLLECTED_SOURCE } from "./sampleCollection";

const NOW = new Date("2026-09-04T12:00:00.000Z");

describe("formatOperationalChipLabel", () => {
  it("names overdue and due with a duration token the caller already computed", () => {
    expect(formatOperationalChipLabel({ state: "overdue", elapsedMinutes: 120 })).toBe("OVERDUE 2H");
    expect(formatOperationalChipLabel({ state: "due", elapsedMinutes: 30 })).toBe("DUE 30M");
    expect(formatDurationToken(89)).toBe("1H");
    expect(formatDurationToken(90)).toBe("2H");
  });

  it("accepts a precomputed label instead of inventing a TAT target", () => {
    expect(formatOperationalChipLabel({ state: "overdue", label: "OVERDUE 2H" })).toBe("OVERDUE 2H");
    expect(formatOperationalChipLabel({ state: "due", label: "due 30m" })).toBe("DUE 30M");
    expect(formatOperationalChipLabel({ state: "overdue" })).toBe("OVERDUE");
    expect(formatOperationalChipLabel({ state: "due" })).toBe("DUE");
  });

  it("uses fixed words for workflow stages", () => {
    expect(formatOperationalChipLabel({ state: "awaiting-sample" })).toBe("AWAITING SAMPLE");
    expect(formatOperationalChipLabel({ state: "collected" })).toBe("COLLECTED");
    expect(formatOperationalChipLabel({ state: "results-entered" })).toBe("AWAITING REVIEW");
    expect(formatOperationalChipLabel({ state: "returned" })).toBe("RETURNED");
    expect(formatOperationalChipLabel({ state: "recollect" })).toBe("RECOLLECT");
    expect(formatOperationalChipLabel({ state: "released" })).toBe("RELEASED");
  });

  it("requires a precomputed label for the ordinary state", () => {
    expect(formatOperationalChipLabel({ state: "ordinary", label: "Stopped" })).toBe("STOPPED");
    expect(() => formatOperationalChipLabel({ state: "ordinary" })).toThrow(/precomputed label/);
  });

  it("never emits a clinical letter as chip text", () => {
    const labels = [
      formatOperationalChipLabel({ state: "overdue", elapsedMinutes: 120 }),
      formatOperationalChipLabel({ state: "due", elapsedMinutes: 30 }),
      formatOperationalChipLabel({ state: "awaiting-sample" }),
      formatOperationalChipLabel({ state: "collected" }),
      formatOperationalChipLabel({ state: "results-entered" }),
      formatOperationalChipLabel({ state: "returned" }),
      formatOperationalChipLabel({ state: "recollect" }),
      formatOperationalChipLabel({ state: "released" }),
      formatOperationalChipLabel({ state: "ordinary", label: "STOPPED" }),
    ];
    for (const label of labels) {
      expect(CLINICAL_FLAG_LETTERS).not.toContain(label);
      expect(isClinicalFlagLetter(label)).toBe(false);
    }
    expect(OPERATIONAL_CHIP_WORDS).toEqual([
      "OVERDUE",
      "DUE",
      "AWAITING SAMPLE",
      "COLLECTED",
      "AWAITING REVIEW",
      "RETURNED",
      "RECOLLECT",
      "RELEASED",
    ]);
  });
});

describe("operational colour rules (D3)", () => {
  it("keeps awaiting-sample, collected, and fresh results-entered neutral", () => {
    expect(operationalHasColour("awaiting-sample")).toBe(false);
    expect(operationalHasColour("collected")).toBe(false);
    expect(operationalHasColour("results-entered", 60)).toBe(false);
    expect(operationalChipClass("awaiting-sample")).toContain("bg-lf-surface-2");
    expect(operationalChipClass("collected")).not.toContain("bg-lf-crit");
    expect(operationalChipClass("results-entered", 60)).not.toContain("bg-lf-warn");
  });

  it("maps released to ok; returned, recollect, overdue to crit; due to warn", () => {
    expect(operationalStripeClass("released")).toContain("border-lf-ok");
    expect(operationalChipClass("released")).toContain("bg-lf-ok-soft");
    expect(operationalStripeClass("returned")).toContain("border-lf-crit");
    expect(operationalStripeClass("recollect")).toContain("border-lf-crit");
    expect(operationalStripeClass("overdue")).toContain("border-lf-crit");
    expect(operationalChipClass("due")).toContain("bg-lf-warn-soft");
  });

  it("warns when results-entered has waited over 24h", () => {
    expect(operationalHasColour("results-entered", 24 * 60)).toBe(true);
    expect(operationalChipClass("results-entered", 24 * 60)).toContain("bg-lf-warn-soft");
    expect(operationalStripeClass("results-entered", 24 * 60)).toContain("border-lf-warn");
  });

  it("keeps stripe and chip utilities off the clinical letter vocabulary", () => {
    expect(operationalStripeClass("overdue")).toContain("lf-op-stripe");
    expect(operationalChipClass("overdue")).toContain("lf-op-chip");
    expect(operationalChipClass("overdue")).not.toContain("lf-clinical-letter");
  });
});

describe("operationalFromOrder", () => {
  const blood = {
    tests: [{ code: "FBC", name: "Full Blood Count", specimenType: "blood" as const }],
  };

  it("does not invent overdue or due without tatMinutes", () => {
    const rows = [
      operationalFromOrder({ ...blood, status: "pending" }, NOW),
      operationalFromOrder(
        {
          ...blood,
          status: "pending",
          sampleCollectedAt: "2026-09-04T09:00:00.000Z",
        },
        NOW
      ),
      operationalFromOrder({ ...blood, status: "results_entered" }, NOW),
      operationalFromOrder({ ...blood, status: "needs_correction" }, NOW),
    ];
    for (const row of rows) {
      expect(row?.state).not.toBe("overdue");
      expect(row?.state).not.toBe("due");
    }
  });

  it("maps real workflow stages — never falls back to queued", () => {
    expect(operationalFromOrder({ ...blood, status: "pending" }, NOW)).toEqual({
      state: "awaiting-sample",
    });
    expect(
      operationalFromOrder(
        {
          ...blood,
          status: "pending",
          sampleCollections: {
            blood: {
              collectedAt: "2026-09-04T09:00:00.000Z",
              collectedBy: "tech@lab.test",
              collectedBySource: SAMPLE_COLLECTED_SOURCE.order,
            },
          },
        },
        NOW
      )
    ).toEqual({ state: "collected" });
    expect(
      operationalFromOrder(
        {
          ...blood,
          status: "results_entered",
          resultsEnteredAt: "2026-09-04T10:00:00.000Z",
        },
        NOW
      )
    ).toEqual({ state: "results-entered", elapsedMinutes: 120 });
    expect(operationalFromOrder({ ...blood, status: "needs_correction" }, NOW)).toEqual({
      state: "returned",
    });
    expect(operationalFromOrder({ ...blood, status: "approved" }, NOW)).toEqual({
      state: "released",
    });
    expect(operationalFromOrder({ ...blood, status: "amended" }, NOW)).toEqual({
      state: "released",
    });
    expect(operationalFromOrder({ ...blood, status: "rejected" }, NOW)).toEqual({
      state: "recollect",
    });
    expect(
      operationalFromOrder(
        { ...blood, status: "pending", recollectionOfOrderId: "abc" },
        NOW
      )
    ).toEqual({ state: "recollect" });
    expect(operationalFromOrder({ ...blood, status: "cancelled" }, NOW)).toEqual({
      state: "ordinary",
      label: "STOPPED",
    });
    expect(operationalFromOrder({ ...blood, status: "mystery" }, NOW)).toBeNull();
  });

  it("applies overdue/due only when tatMinutes exists", () => {
    expect(
      operationalFromOrder(
        {
          ...blood,
          status: "pending",
          createdAt: "2026-09-04T08:00:00.000Z",
          tatMinutes: 60,
        },
        NOW
      )?.state
    ).toBe("overdue");
    expect(
      operationalFromOrder(
        {
          ...blood,
          status: "pending",
          createdAt: "2026-09-04T11:30:00.000Z",
          tatMinutes: 90,
        },
        NOW
      )?.state
    ).toBe("due");
  });
});

describe("countOperationalQueue shares operationalFromOrder", () => {
  it("counts the six workflow buckets from the same derivation", () => {
    const blood = {
      tests: [{ code: "FBC", name: "Full Blood Count", specimenType: "blood" as const }],
    };
    const counts = countOperationalQueue(
      [
        { ...blood, status: "pending" },
        {
          ...blood,
          status: "pending",
          sampleCollectedAt: "2026-09-04T09:00:00.000Z",
        },
        { ...blood, status: "results_entered" },
        { ...blood, status: "needs_correction" },
        { ...blood, status: "rejected" },
        { ...blood, status: "approved" },
      ],
      NOW
    );
    expect(counts).toEqual({
      "awaiting-sample": 1,
      collected: 1,
      "results-entered": 1,
      returned: 1,
      released: 0,
      recollect: 1,
    });
  });
});

describe("greyscale thumb test — text and position carry meaning", () => {
  it("identifies every operational state from words even when colour is ignored", () => {
    const identities = [
      operationalGreyscaleIdentity({ state: "overdue", elapsedMinutes: 120 }),
      operationalGreyscaleIdentity({ state: "due", elapsedMinutes: 30 }),
      operationalGreyscaleIdentity({ state: "awaiting-sample" }),
      operationalGreyscaleIdentity({ state: "collected" }),
      operationalGreyscaleIdentity({ state: "results-entered" }),
      operationalGreyscaleIdentity({ state: "returned" }),
      operationalGreyscaleIdentity({ state: "recollect" }),
      operationalGreyscaleIdentity({ state: "released" }),
      operationalGreyscaleIdentity({ state: "ordinary", label: "STOPPED" }),
    ];
    const texts = identities.map((row) => row.text);
    expect(new Set(texts).size).toBe(texts.length);
    for (const row of identities) {
      expect(row.position).toBe("row-left-stripe+row-right-chip");
      expect(row.text.length).toBeGreaterThan(1);
    }
  });

  it("keeps clinical letters at the value, not on the row edge", () => {
    for (const letter of CLINICAL_FLAG_LETTERS) {
      const clinical = clinicalGreyscaleIdentity(letter);
      expect(clinical.position).toBe("inline-after-value");
      expect(clinical.text).toBe(letter);
      expect(clinical.position).not.toBe(
        operationalGreyscaleIdentity({ state: "collected" }).position
      );
    }
  });

  it("resolveOperationalFlag returns separate state and label props", () => {
    const view = resolveOperationalFlag({ state: "overdue", elapsedMinutes: 120 });
    expect(view).toEqual({ state: "overdue", label: "OVERDUE 2H" });
    expect(view).not.toHaveProperty("flag");
  });
});
