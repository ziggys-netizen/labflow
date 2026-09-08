import { describe, expect, it, vi } from "vitest";

vi.mock("./firebase", () => ({
  db: {},
  auth: {},
  storage: {},
  googleProvider: {},
}));

import { classifyTurnaround, summarizeTurnaround } from "./datetime";
import { numericParam } from "./resultModel";
import type { InventoryBatch, InventoryItem, InventoryMovement } from "./inventory";
import type { RosterEntry, RosterSession } from "./roster";
import {
  blockedSubLabel,
  buildManagerStages,
  clinicReleaseWindow,
  filterBoardItems,
  isCriticalUnreleased,
  medianElapsedTatHours,
  openOrdersAffectedByTestCode,
  operationalForManagerStage,
  orderWorklist,
  releasedTatSubLabel,
  reviewSubLabel,
  sessionOverlapsWindow,
  stockOutDetail,
  tileCounts,
  usableOnHandByItem,
  visibleWorklist,
  type ManagerCatalogRow,
  type ManagerOrder,
  type ManagerPatient,
  type ManagerStageRow,
} from "./managerBoard";

const NOW = new Date("2026-09-04T10:00:00.000Z");
const LOCAL_FRIDAY = new Date(2026, 8, 4, 10, 0, 0);

const TODAY = {
  start: new Date("2026-09-04T00:00:00.000Z"),
  end: new Date("2026-09-05T00:00:00.000Z"),
  kind: "today" as const,
};

const HB = numericParam("Hb", "g/dL", "12-16", { criticalLow: 5 });
const CATALOG: ManagerCatalogRow[] = [{ code: "FBC", name: "Full Blood Count", parameters: [HB] }];

const PATIENTS = new Map<string, ManagerPatient>([
  ["p1", { name: "Ada", labId: "LAB-1", sex: "Female" }],
]);

function order(overrides: Partial<ManagerOrder> = {}): ManagerOrder {
  return {
    id: "o1",
    status: "pending",
    tests: [{ code: "FBC", name: "Full Blood Count" }],
    sampleCollectedAt: null,
    sampleCollectedSource: null,
    createdAt: "2026-09-04T08:00:00.000Z",
    reviewedAt: null,
    resultsEnteredAt: null,
    results: null,
    pendingAmendment: null,
    patientId: "p1",
    patientLabId: "LAB-1",
    ...overrides,
  };
}

function item(overrides: Partial<InventoryItem> = {}): InventoryItem {
  return {
    id: "i1",
    clinicId: "c1",
    name: "Urea reagent",
    category: "Reagent",
    testCode: null,
    manufacturer: "Acme",
    supplier: "Acme",
    catalogueCode: "UR-1",
    packingUnit: "Bottle",
    unitsPerPack: 1,
    baseUnit: "mL",
    unitSize: "500 mL",
    packsPerCarton: null,
    storageCondition: "2–8 °C (refrigerated)",
    department: "Clinical Chemistry",
    minimumStock: 2,
    active: true,
    createdAt: null,
    createdBy: null,
    updatedAt: null,
    ...overrides,
  };
}

function batch(overrides: Partial<InventoryBatch> = {}): InventoryBatch {
  return {
    id: "b1",
    clinicId: "c1",
    itemId: "i1",
    itemName: "Urea reagent",
    lotNumber: "L1",
    expiryDate: "2027-01-01",
    manufactureDate: null,
    supplier: "Acme",
    location: "Main store",
    acceptance: "accepted",
    createdAt: null,
    createdBy: null,
    ...overrides,
  };
}

function movement(overrides: Partial<InventoryMovement> = {}): InventoryMovement {
  return {
    id: "m1",
    clinicId: "c1",
    itemId: "i1",
    itemName: "Urea reagent",
    batchId: "b1",
    lotNumber: "L1",
    expiryDate: "2027-01-01",
    type: "receipt",
    direction: "in",
    quantity: 4,
    packingUnit: "Bottle",
    unitsPerPack: 1,
    baseUnit: "mL",
    occurredAt: "2026-09-01T08:00:00.000Z",
    recordedAt: null,
    actor: null,
    supplier: null,
    deliveryNote: null,
    conditionOnArrival: null,
    department: null,
    issuedTo: null,
    purpose: null,
    destination: null,
    reason: null,
    note: null,
    ...overrides,
  };
}

function session(overrides: Partial<RosterSession> = {}): RosterSession {
  return {
    id: "s1",
    clinicId: "c1",
    userUid: "u2",
    displayName: "Khadija",
    reasonCode: "covering_absent_colleague",
    note: null,
    startsAt: "2026-09-04T08:30:00.000Z",
    endsAt: "2026-09-04T12:30:00.000Z",
    createdByUid: "u2",
    createdAt: "2026-09-04T08:30:00.000Z",
    ...overrides,
  };
}

function stages(overrides: Partial<Parameters<typeof buildManagerStages>[0]> = {}) {
  return buildManagerStages({
    orders: [],
    patientsById: PATIENTS,
    catalog: CATALOG,
    items: [],
    batches: [],
    movements: [],
    sessions: [],
    window: TODAY,
    now: NOW,
    ...overrides,
  });
}

describe("tile definitions", () => {
  it("maps the four tiles onto stages, not per-test samples", () => {
    const rows = stages({
      orders: [
        order({
          id: "crit",
          status: "results_entered",
          resultsEnteredAt: "2026-09-04T08:00:00.000Z",
          results: { FBC: { Hb: "4" } },
        }),
        order({
          id: "review",
          status: "results_entered",
          resultsEnteredAt: "2026-09-04T09:00:00.000Z",
          results: { FBC: { Hb: "13" } },
        }),
        order({
          id: "bench",
          status: "pending",
          sampleCollectedAt: "2026-09-04T09:00:00.000Z",
        }),
        order({
          id: "done",
          status: "approved",
          sampleCollectedAt: "2026-09-04T08:00:00.000Z",
          reviewedAt: "2026-09-04T09:30:00.000Z",
        }),
      ],
      items: [item({ testCode: null })],
      sessions: [session()],
    });
    expect(tileCounts(rows)).toEqual({
      blocked: 3,
      review: 1,
      progress: 1,
      released: 1,
    });
    expect(rows.filter((row) => row.kind === "stock_out")).toHaveLength(1);
    expect(rows.filter((row) => row.kind === "critical_unreleased")).toHaveLength(1);
    expect(rows.filter((row) => row.kind === "off_roster")).toHaveLength(1);
    expect(rows.filter((row) => row.kind === "awaiting_review")).toHaveLength(1);
    expect(rows.some((row) => row.id.includes(":0"))).toBe(false);
  });

  it("keeps a critical unreleased order in blocked, not awaiting review", () => {
    const rows = stages({
      orders: [
        order({
          status: "results_entered",
          resultsEnteredAt: "2026-09-04T08:00:00.000Z",
          results: { FBC: { Hb: "4" } },
        }),
      ],
    });
    expect(rows.map((row) => row.kind)).toEqual(["critical_unreleased"]);
    expect(isCriticalUnreleased(order({ status: "approved", results: { FBC: { Hb: "4" } } }), CATALOG, "Female")).toBe(
      false
    );
  });
});

describe("tile filtering", () => {
  it("filters the list in place without changing other tile counts", () => {
    const rows = stages({
      orders: [
        order({
          id: "review",
          status: "results_entered",
          resultsEnteredAt: "2026-09-04T09:00:00.000Z",
          results: { FBC: { Hb: "13" } },
        }),
        order({
          id: "bench",
          status: "pending",
          sampleCollectedAt: "2026-09-04T09:00:00.000Z",
        }),
        order({
          id: "done",
          status: "approved",
          sampleCollectedAt: "2026-09-04T08:00:00.000Z",
          reviewedAt: "2026-09-04T09:30:00.000Z",
        }),
      ],
      items: [item()],
    });
    const counts = tileCounts(rows);
    expect(filterBoardItems(rows, "review").map((row) => row.kind)).toEqual(["awaiting_review"]);
    expect(filterBoardItems(rows, "progress").map((row) => row.kind)).toEqual(["in_progress"]);
    expect(filterBoardItems(rows, "released").map((row) => row.kind)).toEqual(["released"]);
    expect(filterBoardItems(rows, "blocked").every((row) => row.tile === "blocked")).toBe(true);
    expect(tileCounts(rows)).toEqual(counts);
    expect(filterBoardItems(rows, null)).toHaveLength(rows.length);
  });

  it("caps the list at ten rows until show-all", () => {
    const extra: ManagerStageRow[] = Array.from({ length: 12 }, (_, index) => ({
      id: `row:${index}`,
      tile: "progress",
      kind: "in_progress",
      labId: `LAB-${index}`,
      title: "Ada",
      detail: "FBC",
      href: "/orders/x",
      actionLabel: "Open",
      at: null,
      elapsedMinutes: null,
      ordersAffected: null,
    }));
    expect(visibleWorklist(extra, false)).toHaveLength(10);
    expect(visibleWorklist(extra, true)).toHaveLength(12);
  });
});

describe("reagent stock-out", () => {
  it("does not invent orders-affected when the item has no testCode", () => {
    expect(openOrdersAffectedByTestCode(null, [order({ status: "pending" })])).toBeNull();
    expect(openOrdersAffectedByTestCode("", [order({ status: "pending" })])).toBeNull();
    const rows = stages({
      items: [item({ testCode: null })],
      orders: [order({ status: "pending", tests: [{ code: "FBC", name: "FBC" }] })],
    });
    const stock = rows.find((row) => row.kind === "stock_out");
    expect(stock?.ordersAffected).toBeNull();
    expect(stock?.detail).toContain("ON HAND 0 / MIN 2");
    expect(stock?.detail).not.toMatch(/ORDER/);
  });

  it("counts open orders only when testCode matches", () => {
    const open = order({
      id: "open",
      status: "pending",
      tests: [{ code: "UREA", name: "Urea" }],
    });
    const released = order({
      id: "done",
      status: "approved",
      tests: [{ code: "UREA", name: "Urea" }],
    });
    const other = order({
      id: "other",
      status: "pending",
      tests: [{ code: "FBC", name: "FBC" }],
    });
    expect(openOrdersAffectedByTestCode("UREA", [open, released, other])).toBe(1);
    const rows = stages({
      items: [item({ testCode: "UREA" })],
      orders: [open, released, other],
    });
    expect(rows.find((row) => row.kind === "stock_out")?.ordersAffected).toBe(1);
    expect(stockOutDetail(item({ department: "Haematology", minimumStock: 2 }), 0, 1)).toBe(
      "Haematology · ON HAND 0 / MIN 2 · 1 ORDER"
    );
  });

  it("treats on-hand at or below zero as stock-out, not merely low", () => {
    const onHand = usableOnHandByItem(
      [batch()],
      [movement({ type: "receipt", direction: "in", quantity: 3 })],
      NOW
    );
    expect(onHand.get("i1")).toBe(3);
    const low = stages({
      items: [item({ minimumStock: 5 })],
      batches: [batch()],
      movements: [movement({ type: "receipt", direction: "in", quantity: 3 })],
    });
    expect(low.filter((row) => row.kind === "stock_out")).toHaveLength(0);
    const empty = stages({ items: [item()] });
    expect(empty.filter((row) => row.kind === "stock_out")).toHaveLength(1);
  });
});

describe("amendment second approver", () => {
  it("lists a pending amendment as awaiting review", () => {
    const rows = stages({
      orders: [
        order({
          status: "approved",
          reviewedAt: "2026-09-03T12:00:00.000Z",
          pendingAmendment: {
            values: { FBC: { Hb: "13.4" } },
            amendmentReason: "Transcription error",
            initiatedBy: "awa@clinic.gm",
            initiatedByUid: "u1",
            initiatedAt: "2026-09-04T09:00:00.000Z",
            fromVersion: 1,
          },
        }),
      ],
    });
    expect(rows.some((row) => row.kind === "amendment_pending" && row.tile === "review")).toBe(true);
    expect(reviewSubLabel(rows)).toBe("SECOND APPROVER");
    expect(operationalForManagerStage(rows.find((row) => row.kind === "amendment_pending")!).label).toBe(
      "AMENDMENT"
    );
  });
});

describe("off-roster sessions this shift", () => {
  it("includes sessions overlapping the clinic window and keeps the reason code", () => {
    const entry: RosterEntry = {
      id: "e1",
      clinicId: "c1",
      userUid: "u1",
      pattern: "weekly",
      weeksOfMonth: [],
      weekParity: null,
      daysOfWeek: [5],
      startTime: "08:00",
      endTime: "16:00",
      graceMinutes: 30,
      dates: [],
      effectiveFrom: "2026-09-01",
      effectiveTo: null,
      createdByUid: "admin",
      createdAt: "2026-09-01T00:00:00.000Z",
    };
    const window = clinicReleaseWindow([entry], LOCAL_FRIDAY);
    expect(window.kind).toBe("shift");
    const onShift = session({
      startsAt: window.start.toISOString(),
      endsAt: new Date(window.start.getTime() + 2 * 3600000).toISOString(),
    });
    const otherDay = session({
      id: "s2",
      startsAt: "2026-09-03T08:00:00.000Z",
      endsAt: "2026-09-03T10:00:00.000Z",
    });
    expect(sessionOverlapsWindow(onShift, window)).toBe(true);
    expect(sessionOverlapsWindow(otherDay, window)).toBe(false);
    const rows = stages({ window, sessions: [onShift, otherDay] });
    const off = rows.filter((row) => row.kind === "off_roster");
    expect(off).toHaveLength(1);
    expect(off[0]?.detail).toBe("Covering absent colleague");
  });

  it("falls back to calendar today when the clinic has no roster window", () => {
    expect(clinicReleaseWindow([], LOCAL_FRIDAY).kind).toBe("today");
  });
});

describe("elapsed TAT on released", () => {
  it("uses classifyTurnaround hours and never a target", () => {
    const released = order({
      status: "approved",
      sampleCollectedAt: "2026-09-04T08:00:00.000Z",
      reviewedAt: "2026-09-04T10:00:00.000Z",
    });
    expect(classifyTurnaround(released).hours).toBe(2);
    expect(medianElapsedTatHours([released])).toBe(summarizeTurnaround([released]).median);
    expect(releasedTatSubLabel(2, TODAY)).toBe("MEDIAN 2.0H ELAPSED · TODAY");
    expect(releasedTatSubLabel(null, { ...TODAY, kind: "shift" })).toBe("ELAPSED TAT — · THIS SHIFT");
    expect(releasedTatSubLabel(2, TODAY)).not.toMatch(/target/i);
  });
});

describe("worklist order and blocked sub-label", () => {
  it("orders stock-out, then critical, then off-roster, then review", () => {
    const rows = orderWorklist(
      stages({
        items: [item()],
        sessions: [session()],
        orders: [
          order({
            id: "review",
            status: "results_entered",
            resultsEnteredAt: "2026-09-04T09:00:00.000Z",
            results: { FBC: { Hb: "13" } },
          }),
          order({
            id: "crit",
            status: "results_entered",
            resultsEnteredAt: "2026-09-04T08:00:00.000Z",
            results: { FBC: { Hb: "4" } },
          }),
        ],
      })
    );
    expect(rows.map((row) => row.kind)).toEqual([
      "stock_out",
      "critical_unreleased",
      "off_roster",
      "awaiting_review",
    ]);
    expect(blockedSubLabel(rows)).toBe("STOCK OUT / CRITICAL / OFF-ROSTER");
    expect(operationalForManagerStage(rows[0]!)).toEqual({ state: "overdue", label: "STOCK OUT" });
  });
});
