import { describe, expect, it } from "vitest";
import {
  ageFromDob,
  canPerformPrimaryAction,
  describeAge,
  formatActivityDay,
  formatPatientAge,
  formatSexAbbrev,
  formatSexAge,
  patientLastActivity,
  patientListChip,
  patientListMatchesQuery,
  patientPrimaryAction,
  primaryActionHref,
  type PatientListOrder,
} from "./patientList";
import { SAMPLE_COLLECTED_SOURCE, type OrderCollectionFields } from "./sampleCollection";

const NOW = new Date(2026, 8, 4, 12, 0, 0);

function order(
  partial: Partial<PatientListOrder> & Pick<OrderCollectionFields, "id">
): PatientListOrder {
  return {
    status: "pending",
    tests: [{ code: "FBC", name: "Full Blood Count", specimenType: "blood" }],
    sampleCollectedAt: null,
    sampleCollectedSource: null,
    sampleCollections: {},
    createdAt: "2026-09-04T08:00:00.000Z",
    resultsEnteredAt: null,
    reviewedAt: null,
    lastAmendedAt: null,
    recollectionOfOrderId: null,
    ...partial,
  };
}

describe("formatSexAge", () => {
  it("abbreviates sex and age from DOB as F · 34y", () => {
    expect(formatSexAbbrev("Female")).toBe("F");
    expect(formatSexAbbrev("male")).toBe("M");
    expect(formatPatientAge({ dob: "1992-06-15" }, NOW)).toBe("34y");
    expect(formatSexAge({ sex: "Female", dob: "1992-06-15" }, NOW)).toBe("F · 34y");
  });

  it("uses estimated ageYears or ageMonths when DOB is missing", () => {
    expect(formatPatientAge({ ageYears: 34 }, NOW)).toBe("34y");
    expect(formatPatientAge({ ageMonths: 8 }, NOW)).toBe("8m");
    expect(formatPatientAge({ dob: "2026-03-04" }, NOW)).toBe("6m");
  });
});

describe("ageFromDob", () => {
  const on = (y: number, m: number, d: number) => new Date(y, m - 1, d, 10, 30);

  it("counts completed years and months", () => {
    expect(ageFromDob("1992-06-15", on(2026, 9, 18))).toEqual({ years: 34, months: 3 });
  });

  it("turns over exactly on the birthday, not the day before", () => {
    expect(ageFromDob("1990-09-18", on(2026, 9, 18))).toEqual({ years: 36, months: 0 });
    expect(ageFromDob("1990-09-19", on(2026, 9, 18))).toEqual({ years: 35, months: 11 });
  });

  it("gives a newborn zero years and zero months", () => {
    expect(ageFromDob("2026-09-10", on(2026, 9, 18))).toEqual({ years: 0, months: 0 });
    expect(ageFromDob("2026-09-18", on(2026, 9, 18))).toEqual({ years: 0, months: 0 });
  });

  it("handles a leap-day birthday in a non-leap year", () => {
    expect(ageFromDob("2000-02-29", on(2026, 2, 28))).toEqual({ years: 25, months: 11 });
    expect(ageFromDob("2000-02-29", on(2026, 3, 1))).toEqual({ years: 26, months: 0 });
  });

  it("refuses a date in the future", () => {
    expect(ageFromDob("2026-09-19", on(2026, 9, 18))).toBeNull();
  });

  it("refuses anything that is not a real calendar date", () => {
    expect(ageFromDob("2026-02-30", on(2026, 9, 18))).toBeNull();
    expect(ageFromDob("", on(2026, 9, 18))).toBeNull();
    expect(ageFromDob(null, on(2026, 9, 18))).toBeNull();
    expect(ageFromDob("not a date", on(2026, 9, 18))).toBeNull();
  });
});

describe("describeAge", () => {
  it("writes the age out in words, with correct singulars", () => {
    expect(describeAge({ years: 34, months: 3 })).toBe("34 years, 3 months");
    expect(describeAge({ years: 1, months: 1 })).toBe("1 year, 1 month");
    expect(describeAge({ years: 36, months: 0 })).toBe("36 years");
    expect(describeAge({ years: 0, months: 7 })).toBe("7 months");
    expect(describeAge({ years: 0, months: 0 })).toBe("under 1 month");
  });
});

describe("patientListMatchesQuery", () => {
  const patient = {
    labId: "LF-20260904-0031",
    name: "Binta Sanneh",
    preferredName: "Binta",
    phone: "+2205551234",
  };

  it("matches Lab ID, name and phone, including digits-only phone", () => {
    expect(patientListMatchesQuery(patient, "lf-20260904-0031")).toBe(true);
    expect(patientListMatchesQuery(patient, "sanneh")).toBe(true);
    expect(patientListMatchesQuery(patient, "5551234")).toBe(true);
    expect(patientListMatchesQuery(patient, "+220 555 1234")).toBe(true);
    expect(patientListMatchesQuery(patient, "national-id")).toBe(false);
  });

  it("matches an empty query to everyone", () => {
    expect(patientListMatchesQuery(patient, "  ")).toBe(true);
  });
});

describe("patientPrimaryAction", () => {
  it("maps each row state to one next-step label", () => {
    expect(patientPrimaryAction([]).label).toBe("Order tests");
    expect(patientPrimaryAction([order({ id: "o1" })]).label).toBe("Collect");
    expect(
      patientPrimaryAction([
        order({
          id: "o2",
          sampleCollections: {
            blood: {
              collectedAt: "2026-09-04T09:00:00.000Z",
              collectedBy: "tech@lab.test",
              collectedBySource: SAMPLE_COLLECTED_SOURCE.order,
            },
          },
        }),
      ]).label
    ).toBe("Enter results");
    expect(
      patientPrimaryAction([
        order({
          id: "o3",
          status: "results_entered",
          sampleCollectedAt: "2026-09-04T09:00:00.000Z",
        }),
      ]).label
    ).toBe("Review");
    expect(patientPrimaryAction([order({ id: "o4", status: "approved" })]).label).toBe("Print");
  });

  it("prefers open collection work over an older released report", () => {
    const action = patientPrimaryAction([
      order({ id: "old", status: "approved", createdAt: "2026-08-01T08:00:00.000Z" }),
      order({ id: "new", createdAt: "2026-09-04T08:00:00.000Z" }),
    ]);
    expect(action).toEqual({ kind: "collect", label: "Collect", targetOrderId: "new" });
  });
});

describe("patientListChip", () => {
  it("uses workflow operational states, never QUEUED as a fallback", () => {
    expect(patientListChip([])).toEqual({ state: "ordinary", label: "REGISTERED" });
    expect(patientListChip([order({ id: "o1" })])?.state).toBe("awaiting-sample");
    expect(patientListChip([order({ id: "o2", status: "approved" })])?.state).toBe("released");
    expect(
      patientListChip([order({ id: "o3", recollectionOfOrderId: "old" })])?.state
    ).toBe("recollect");
  });
});

describe("patientLastActivity", () => {
  const sep4 = new Date(2026, 8, 4, 12, 0, 0).toISOString();
  const sep3 = new Date(2026, 8, 3, 12, 0, 0).toISOString();
  const aug1 = new Date(2026, 7, 1, 12, 0, 0).toISOString();
  const sep2 = new Date(2026, 8, 2, 12, 0, 0).toISOString();
  const sep1 = new Date(2026, 8, 1, 12, 0, 0).toISOString();

  it("formats date and what happened, using the latest event", () => {
    expect(patientLastActivity(sep4, [])).toBe("4 Sep · registered");
    expect(
      patientLastActivity(aug1, [
        order({
          id: "o1",
          status: "approved",
          reviewedAt: sep4,
        }),
      ])
    ).toBe("4 Sep · FBC released");
  });

  it("uses collection time when that is the latest fact", () => {
    expect(
      patientLastActivity(sep1, [
        order({
          id: "o1",
          createdAt: sep2,
          sampleCollections: {
            blood: {
              collectedAt: sep3,
              collectedBy: "tech@lab.test",
              collectedBySource: SAMPLE_COLLECTED_SOURCE.order,
            },
          },
        }),
      ])
    ).toBe("3 Sep · FBC collected");
  });
});

describe("primaryActionHref and permissions", () => {
  it("sends collect/enter/review to the order and print to the report", () => {
    expect(primaryActionHref("p1", { kind: "order", label: "Order tests", targetOrderId: null })).toBe(
      "/orders/new/p1"
    );
    expect(
      primaryActionHref("p1", { kind: "collect", label: "Collect", targetOrderId: "o9" })
    ).toBe("/orders/o9");
    expect(primaryActionHref("p1", { kind: "print", label: "Print", targetOrderId: null })).toBe(
      "/patients/p1/print"
    );
  });

  it("gates actions by role capability", () => {
    const none = { canOrder: false, canCollect: false, canEnter: false, canReview: false };
    expect(canPerformPrimaryAction("order", none)).toBe(false);
    expect(canPerformPrimaryAction("print", none)).toBe(true);
    expect(canPerformPrimaryAction("review", { ...none, canReview: true })).toBe(true);
  });
});

describe("formatActivityDay", () => {
  it("uses day and short month without a year", () => {
    expect(formatActivityDay(new Date(2026, 8, 4, 12, 0, 0).toISOString())).toBe("4 Sep");
  });
});
