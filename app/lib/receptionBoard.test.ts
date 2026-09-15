import { describe, expect, it } from "vitest";
import {
  buildAwaitingCollection,
  buildTodaysRegistrations,
  isAwaitingCollection,
  isRegisteredToday,
  matchesPatientSearch,
  operationalForReceptionRow,
  visibleReceptionList,
  type ReceptionOrder,
  type ReceptionPatient,
} from "./receptionBoard";

const NOW = new Date(2026, 8, 4, 10, 0, 0);

function patient(overrides: Partial<ReceptionPatient> = {}): ReceptionPatient {
  return {
    id: "p1",
    labId: "LAB-1",
    name: "Ada Lovelace",
    preferredName: "",
    createdAt: new Date(2026, 8, 4, 8, 0, 0).toISOString(),
    createdByUid: "u1",
    ...overrides,
  };
}

function order(overrides: Partial<ReceptionOrder> = {}): ReceptionOrder {
  return {
    id: "o1",
    status: "pending",
    tests: [{ code: "FBC", name: "Full Blood Count" }],
    sampleCollectedAt: null,
    sampleCollectedSource: null,
    createdAt: new Date(2026, 8, 4, 9, 0, 0).toISOString(),
    patientId: "p1",
    patientLabId: "LAB-1",
    ...overrides,
  };
}

describe("today's registrations", () => {
  it("keeps only same-day patients and can scope to the registrar", () => {
    const today = patient();
    const yesterday = patient({
      id: "p2",
      createdAt: new Date(2026, 8, 3, 8, 0, 0).toISOString(),
    });
    const other = patient({ id: "p3", createdByUid: "u2" });
    expect(isRegisteredToday(today, NOW)).toBe(true);
    expect(isRegisteredToday(yesterday, NOW)).toBe(false);
    expect(buildTodaysRegistrations([today, yesterday, other], NOW, { onlyCreatedByUid: "u1" })).toHaveLength(1);
  });

  it("links to the patient list by default — intern's only patient surface", () => {
    const [row] = buildTodaysRegistrations([patient()], NOW);
    expect(row).toMatchObject({ href: "/patients", actionLabel: "Open list" });
  });

  it("links straight to ordering tests for a viewer who can order — cashier", () => {
    const [row] = buildTodaysRegistrations([patient()], NOW, { canOrder: true });
    expect(row).toMatchObject({ href: "/orders/new/p1", actionLabel: "Order tests" });
  });
});

describe("awaiting collection", () => {
  it("lists pending orders that still need a specimen", () => {
    const open = order();
    const collected = order({
      id: "o2",
      sampleCollectedAt: new Date(2026, 8, 4, 9, 30, 0).toISOString(),
    });
    expect(isAwaitingCollection(open, [])).toBe(true);
    expect(isAwaitingCollection(collected, [])).toBe(false);
    const patients = new Map([["p1", patient()]]);
    const rows = buildAwaitingCollection([open, collected], patients, []);
    expect(rows).toHaveLength(1);
    expect(rows[0]?.kind).toBe("awaiting_collection");
    expect(rows[0]).toMatchObject({ href: "/patients", actionLabel: "Open list" });
    expect(operationalForReceptionRow(rows[0]!)).toEqual({ state: "awaiting-sample" });
  });
});

describe("awaiting collection — payment", () => {
  it("says the order was paid, in words, without the transaction ID", () => {
    const paid = order({
      payment: {
        method: "mobile_money",
        amount: 350,
        currency: "D",
        reference: "MP-SECRETISH",
        recordedAt: "2026-09-04T09:00:00.000Z",
        recordedByUid: "u1",
        recordedByRole: "cashier",
      },
    });
    const [row] = buildAwaitingCollection([paid], new Map([["p1", patient()]]), []);
    expect(row?.detail).toBe("Full Blood Count · Paid D 350.00 · Mobile money transfer");
    expect(row?.detail).not.toContain("MP-SECRETISH");
  });

  it("shows only the tests when no payment is on record", () => {
    const [row] = buildAwaitingCollection([order()], new Map([["p1", patient()]]), []);
    expect(row?.detail).toBe("Full Blood Count");
  });
});

describe("search and page size", () => {
  it("matches lab id or name and caps the list at ten", () => {
    expect(matchesPatientSearch(patient(), "lab-1")).toBe(true);
    expect(matchesPatientSearch(patient(), "ada")).toBe(true);
    expect(matchesPatientSearch(patient(), "zzz")).toBe(false);
    const items = Array.from({ length: 12 }, (_, i) => i);
    expect(visibleReceptionList(items, false)).toHaveLength(10);
    expect(visibleReceptionList(items, true)).toHaveLength(12);
  });
});
