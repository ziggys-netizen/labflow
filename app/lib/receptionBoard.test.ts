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
    expect(operationalForReceptionRow(rows[0]!)).toEqual({ state: "awaiting-sample" });
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
