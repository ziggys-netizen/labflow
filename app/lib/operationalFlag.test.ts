import { describe, expect, it } from "vitest";
import { CLINICAL_FLAG_LETTERS, isClinicalFlagLetter } from "./clinicalFlag";
import {
  OPERATIONAL_CHIP_WORDS,
  clinicalGreyscaleIdentity,
  formatDurationToken,
  formatOperationalChipLabel,
  operationalChipClass,
  operationalFromOrderStage,
  operationalGreyscaleIdentity,
  operationalHasColour,
  operationalStripeClass,
  resolveOperationalFlag,
} from "./operationalFlag";

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

  it("uses fixed words for recollect, released, and queued", () => {
    expect(formatOperationalChipLabel({ state: "recollect" })).toBe("RECOLLECT");
    expect(formatOperationalChipLabel({ state: "released" })).toBe("RELEASED");
    expect(formatOperationalChipLabel({ state: "queued" })).toBe("QUEUED");
  });

  it("requires a precomputed label for the ordinary state", () => {
    expect(formatOperationalChipLabel({ state: "ordinary", label: "Stopped" })).toBe("STOPPED");
    expect(() => formatOperationalChipLabel({ state: "ordinary" })).toThrow(
      /precomputed label/
    );
  });

  it("never emits a clinical letter as chip text", () => {
    const labels = [
      formatOperationalChipLabel({ state: "overdue", elapsedMinutes: 120 }),
      formatOperationalChipLabel({ state: "due", elapsedMinutes: 30 }),
      formatOperationalChipLabel({ state: "recollect" }),
      formatOperationalChipLabel({ state: "released" }),
      formatOperationalChipLabel({ state: "queued" }),
      formatOperationalChipLabel({ state: "ordinary", label: "STOPPED" }),
    ];
    for (const label of labels) {
      expect(CLINICAL_FLAG_LETTERS).not.toContain(label);
      expect(isClinicalFlagLetter(label)).toBe(false);
    }
    expect(OPERATIONAL_CHIP_WORDS).toEqual(["OVERDUE", "DUE", "RECOLLECT", "RELEASED", "QUEUED"]);
  });
});

describe("operational colour rules", () => {
  it("gives queued and ordinary no colour — neutral stripe and muted chip", () => {
    expect(operationalHasColour("queued")).toBe(false);
    expect(operationalHasColour("ordinary")).toBe(false);
    expect(operationalStripeClass("queued")).toContain("border-lf-line-strong");
    expect(operationalStripeClass("ordinary")).toContain("border-lf-line-strong");
    expect(operationalChipClass("queued")).toContain("bg-lf-surface-2");
    expect(operationalChipClass("queued")).not.toContain("bg-lf-crit");
    expect(operationalChipClass("queued")).not.toContain("bg-lf-warn");
    expect(operationalChipClass("queued")).not.toContain("bg-lf-ok");
  });

  it("maps overdue to crit, due and recollect to warn, released to ok", () => {
    expect(operationalStripeClass("overdue")).toContain("border-lf-crit");
    expect(operationalChipClass("overdue")).toContain("bg-lf-crit-soft");
    expect(operationalStripeClass("due")).toContain("border-lf-warn");
    expect(operationalStripeClass("recollect")).toContain("border-lf-warn");
    expect(operationalStripeClass("released")).toContain("border-lf-ok");
    expect(operationalChipClass("released")).toContain("border-lf-ok/30");
  });

  it("keeps stripe and chip utilities off the clinical letter vocabulary", () => {
    expect(operationalStripeClass("overdue")).toContain("lf-op-stripe");
    expect(operationalChipClass("overdue")).toContain("lf-op-chip");
    expect(operationalChipClass("overdue")).not.toContain("lf-clinical-letter");
  });
});

describe("operationalFromOrderStage", () => {
  it("does not invent overdue or due from order status", () => {
    const rows = [
      operationalFromOrderStage({ status: "pending" }),
      operationalFromOrderStage({ status: "results_entered" }),
      operationalFromOrderStage({ status: "needs_correction" }),
      operationalFromOrderStage({ status: "approved" }),
      operationalFromOrderStage({ status: "amended" }),
      operationalFromOrderStage({ status: "rejected" }),
      operationalFromOrderStage({ status: "cancelled" }),
      operationalFromOrderStage({ status: "pending", recollectionOfOrderId: "order-1" }),
    ];
    for (const row of rows) {
      expect(row.state).not.toBe("overdue");
      expect(row.state).not.toBe("due");
    }
  });

  it("maps existing stages that this codebase actually has", () => {
    expect(operationalFromOrderStage({ status: "pending" })).toEqual({ state: "queued" });
    expect(operationalFromOrderStage({ status: "results_entered" })).toEqual({ state: "queued" });
    expect(operationalFromOrderStage({ status: "approved" })).toEqual({ state: "released" });
    expect(operationalFromOrderStage({ status: "amended" })).toEqual({ state: "released" });
    expect(operationalFromOrderStage({ status: "rejected" })).toEqual({ state: "recollect" });
    expect(operationalFromOrderStage({ status: "pending", recollectionOfOrderId: "abc" })).toEqual({
      state: "recollect",
    });
    expect(operationalFromOrderStage({ status: "cancelled" })).toEqual({
      state: "ordinary",
      label: "STOPPED",
    });
  });
});

describe("greyscale thumb test — text and position carry meaning", () => {
  it("identifies every operational state from words even when colour is ignored", () => {
    const identities = [
      operationalGreyscaleIdentity({ state: "overdue", elapsedMinutes: 120 }),
      operationalGreyscaleIdentity({ state: "due", elapsedMinutes: 30 }),
      operationalGreyscaleIdentity({ state: "recollect" }),
      operationalGreyscaleIdentity({ state: "released" }),
      operationalGreyscaleIdentity({ state: "queued" }),
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
      expect(clinical.position).not.toBe(operationalGreyscaleIdentity({ state: "queued" }).position);
    }
  });

  it("resolveOperationalFlag returns separate state and label props", () => {
    const view = resolveOperationalFlag({ state: "overdue", elapsedMinutes: 120 });
    expect(view).toEqual({ state: "overdue", label: "OVERDUE 2H" });
    expect(view).not.toHaveProperty("flag");
  });
});
