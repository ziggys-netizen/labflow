import { describe, expect, it } from "vitest";
import type { InventoryBatch, InventoryItem, InventoryMovement } from "./inventory";
import {
  STOREKEEPER_EXPIRY_DAYS,
  buildExpiringRows,
  buildMyIssuedTodayList,
  buildReorderRows,
  buildStorekeeperStages,
  filterBoardItems,
  isBelowReorder,
  isExpiringWithinDays,
  isIssueToday,
  operationalForStorekeeperStage,
  orderWorklist,
  tileCounts,
  usableOnHandByItem,
  visibleWorklist,
  type StorekeeperStageRow,
} from "./storekeeperBoard";

const NOW = new Date(2026, 8, 4, 10, 0, 0);

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
    expiryDate: "2026-10-01",
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
    expiryDate: "2026-10-01",
    type: "issue",
    direction: "out",
    quantity: 1,
    packingUnit: "Bottle",
    unitsPerPack: 1,
    baseUnit: "mL",
    occurredAt: "2026-09-04T09:00:00.000Z",
    recordedAt: null,
    actor: { uid: "u1", username: "khadija", email: null },
    supplier: null,
    deliveryNote: null,
    conditionOnArrival: null,
    department: "Haematology",
    issuedTo: "Bench A",
    purpose: null,
    destination: null,
    reason: null,
    note: null,
    ...overrides,
  };
}

describe("reorder and expiry tiles", () => {
  it("treats on-hand at or below minimum as below reorder", () => {
    expect(isBelowReorder(0, 2)).toBe(true);
    expect(isBelowReorder(2, 2)).toBe(true);
    expect(isBelowReorder(3, 2)).toBe(false);
  });

  it("flags batches within 90 days and not already expired", () => {
    expect(STOREKEEPER_EXPIRY_DAYS).toBe(90);
    expect(isExpiringWithinDays("2026-10-01", NOW)).toBe(true);
    expect(isExpiringWithinDays("2026-08-01", NOW)).toBe(false);
    expect(isExpiringWithinDays(null, NOW)).toBe(false);
  });

  it("builds reorder and nearest-expiry rows without inventing requests", () => {
    const rows = buildStorekeeperStages({
      items: [item()],
      batches: [batch({ expiryDate: "2026-09-20" })],
      movements: [movement({ type: "receipt", direction: "in", quantity: 1, occurredAt: "2026-09-01T08:00:00.000Z" })],
      now: NOW,
    });
    expect(tileCounts(rows)).toEqual({
      reorder: 1,
      expiring: 1,
      requests: 0,
      issued: 0,
    });
    expect(filterBoardItems(rows, "requests")).toEqual([]);
    expect(rows.some((row) => row.kind === "reorder")).toBe(true);
    expect(rows.some((row) => row.kind === "expiring")).toBe(true);
  });
});

describe("issued today", () => {
  it("counts clinic issues today and lists only the signed-in actor's issues", () => {
    const mine = movement({ id: "mine", occurredAt: new Date(2026, 8, 4, 9, 0, 0).toISOString() });
    const theirs = movement({
      id: "theirs",
      actor: { uid: "u2", username: "other", email: null },
      occurredAt: new Date(2026, 8, 4, 11, 0, 0).toISOString(),
    });
    const yesterday = movement({
      id: "old",
      occurredAt: new Date(2026, 8, 3, 9, 0, 0).toISOString(),
    });
    expect(isIssueToday(mine, NOW)).toBe(true);
    expect(isIssueToday(yesterday, NOW)).toBe(false);
    const stages = buildStorekeeperStages({
      items: [item({ minimumStock: 0 })],
      batches: [batch()],
      movements: [
        movement({ type: "receipt", direction: "in", quantity: 10, occurredAt: "2026-09-01T08:00:00.000Z" }),
        mine,
        theirs,
        yesterday,
      ],
      now: NOW,
    });
    expect(tileCounts(stages).issued).toBe(2);
    const mineList = buildMyIssuedTodayList([mine, theirs, yesterday], "u1", NOW);
    expect(mineList).toHaveLength(1);
    expect(mineList[0]?.destination).toBe("Bench A");
  });
});

describe("filtering and page size", () => {
  it("filters in place and caps at ten until show-all", () => {
    const rows: StorekeeperStageRow[] = Array.from({ length: 12 }, (_, index) => ({
      id: `row:${index}`,
      tile: "reorder",
      kind: "reorder",
      title: `Item ${index}`,
      detail: "ON HAND 0 / MIN 2",
      href: "/inventory/items",
      actionLabel: "Open items",
      at: null,
      daysToExpiry: null,
    }));
    expect(filterBoardItems(rows, "reorder")).toHaveLength(12);
    expect(visibleWorklist(rows, false)).toHaveLength(10);
    expect(visibleWorklist(rows, true)).toHaveLength(12);
    expect(operationalForStorekeeperStage(rows[0]!)).toEqual({ state: "overdue", label: "REORDER" });
  });

  it("orders reorder before expiring before issued", () => {
    const ordered = orderWorklist(
      buildStorekeeperStages({
        items: [item({ minimumStock: 10 })],
        batches: [batch({ expiryDate: "2026-09-20" })],
        movements: [
          movement({ type: "receipt", direction: "in", quantity: 5, occurredAt: "2026-09-01T08:00:00.000Z" }),
          movement({ id: "iss", occurredAt: new Date(2026, 8, 4, 9, 0, 0).toISOString() }),
        ],
        now: NOW,
      })
    );
    expect(ordered.map((row) => row.kind)).toEqual(["reorder", "expiring", "issued"]);
  });
});

describe("usable on-hand", () => {
  it("skips expired and rejected lots when totalling stock", () => {
    const onHand = usableOnHandByItem(
      [
        batch({ id: "ok", acceptance: "accepted", expiryDate: "2027-01-01" }),
        batch({ id: "dead", acceptance: "rejected", expiryDate: "2027-01-01" }),
      ],
      [
        movement({ id: "r1", batchId: "ok", type: "receipt", direction: "in", quantity: 4 }),
        movement({ id: "r2", batchId: "dead", type: "receipt", direction: "in", quantity: 9 }),
      ],
      NOW
    );
    expect(onHand.get("i1")).toBe(4);
    expect(buildReorderRows([item({ minimumStock: 5 })], onHand)).toHaveLength(1);
    expect(buildExpiringRows([item()], [batch({ expiryDate: "2026-09-10" })], [], NOW)).toHaveLength(0);
  });
});
