import { describe, expect, it } from "vitest";
import { TEST_CATALOG } from "./testCatalog";
import { parseTatMinutes } from "./testCatalog";
import {
  attentionSubLabel,
  awaitingSubLabel,
  boardItems,
  buildTechWorkItems,
  computeTatClock,
  filterBoardItems,
  formatBoardMetaLine,
  formatGreetingLine,
  greetingFirstName,
  isAwaitingCollection,
  isNeedsAttention,
  isReleasedInWindow,
  isResultsToEnter,
  operationalForTechItem,
  orderWorklist,
  releasedSubLabel,
  techRowAction,
  tileCounts,
  visibleWorklist,
  type TechWorkItem,
} from "./technicianBoard";

const NOW = new Date("2026-09-04T10:00:00.000Z");
const LOCAL_MORNING = new Date(2026, 8, 4, 10, 0, 0);

function item(overrides: Partial<TechWorkItem> = {}): TechWorkItem {
  return {
    id: "o1:FBC:0",
    orderId: "o1",
    labId: "LAB-1",
    patientName: "Ada",
    testName: "Full Blood Count (FBC)",
    testCode: "FBC",
    status: "pending",
    recollectionOfOrderId: null,
    collected: false,
    createdAt: "2026-09-04T08:00:00.000Z",
    collectedAt: null,
    reviewedAt: null,
    tatMinutes: null,
    ...overrides,
  };
}

describe("tatMinutes belongs on the test, not the parameter", () => {
  it("seed FBC has no tatMinutes and parameters have no such field", () => {
    const fbc = TEST_CATALOG.find((row) => row.code === "FBC");
    expect(fbc).toBeTruthy();
    expect(fbc?.tatMinutes).toBeUndefined();
    expect(fbc?.parameters.every((parameter) => !("tatMinutes" in parameter))).toBe(true);
    expect(parseTatMinutes(undefined)).toBeNull();
    expect(parseTatMinutes(0)).toBeNull();
    expect(parseTatMinutes("")).toBeNull();
    expect(parseTatMinutes(90)).toBe(90);
  });
});

describe("honest TAT clock", () => {
  it("does not invent overdue or due-within without tatMinutes", () => {
    const pending = item();
    expect(computeTatClock(pending.tatMinutes, pending.createdAt, NOW)).toBeNull();
    expect(isNeedsAttention(pending, NOW)).toBe(false);
    expect(operationalForTechItem(pending, NOW)).toEqual({ state: "queued" });
    expect(awaitingSubLabel([pending], NOW)).toBe("NOT COLLECTED");
  });

  it("marks overdue only when tatMinutes exists and the clock has passed", () => {
    const overdue = item({ tatMinutes: 60, createdAt: "2026-09-04T08:00:00.000Z" });
    const due = item({
      id: "o2:HB:0",
      orderId: "o2",
      testCode: "HB",
      testName: "Haemoglobin",
      tatMinutes: 90,
      createdAt: "2026-09-04T09:15:00.000Z",
    });
    expect(computeTatClock(overdue.tatMinutes, overdue.createdAt, NOW)?.overdue).toBe(true);
    expect(computeTatClock(due.tatMinutes, due.createdAt, NOW)?.dueWithin1h).toBe(true);
    expect(isNeedsAttention(overdue, NOW)).toBe(true);
    expect(isNeedsAttention(due, NOW)).toBe(false);
    expect(operationalForTechItem(overdue, NOW).state).toBe("overdue");
    expect(operationalForTechItem(due, NOW).state).toBe("due");
  });
});

describe("tile definitions", () => {
  it("counts recollect and rejection as needs attention without calling them overdue", () => {
    const rejected = item({
      id: "o3:UA:0",
      status: "rejected",
      testCode: "UA",
    });
    const recollect = item({
      id: "o4:UA:0",
      recollectionOfOrderId: "old",
      testCode: "UA",
    });
    expect(isNeedsAttention(rejected, NOW)).toBe(true);
    expect(isNeedsAttention(recollect, NOW)).toBe(true);
    expect(attentionSubLabel([rejected, recollect], NOW)).toBe("RECOLLECT");
    expect(operationalForTechItem(rejected, NOW)).toEqual({ state: "recollect" });
  });

  it("awaiting collection is pending uncollected; due-within only when a target exists", () => {
    const plain = item();
    const dueSoon = item({
      id: "o5:MAL-RDT:0",
      testCode: "MAL-RDT",
      tatMinutes: 90,
      createdAt: "2026-09-04T09:15:00.000Z",
    });
    expect(isAwaitingCollection(plain)).toBe(true);
    expect(isAwaitingCollection(dueSoon)).toBe(true);
    expect(awaitingSubLabel([plain], NOW)).toBe("NOT COLLECTED");
    expect(awaitingSubLabel([plain, dueSoon], NOW)).toBe("1 DUE WITHIN 1H");
  });

  it("results to enter are collected pending or needs_correction", () => {
    const collected = item({
      collected: true,
      collectedAt: "2026-09-04T09:00:00.000Z",
      status: "pending",
    });
    const correction = item({
      id: "o6:FBC:0",
      collected: true,
      collectedAt: "2026-09-04T09:00:00.000Z",
      status: "needs_correction",
    });
    const waitingReview = item({
      id: "o7:FBC:0",
      collected: true,
      collectedAt: "2026-09-04T09:00:00.000Z",
      status: "results_entered",
    });
    expect(isResultsToEnter(collected)).toBe(true);
    expect(isResultsToEnter(correction)).toBe(true);
    expect(isResultsToEnter(waitingReview)).toBe(false);
    expect(operationalForTechItem(collected, NOW)).toEqual({ state: "ordinary", label: "COLLECTED" });
  });

  it("released today uses the supplied window and an honest sub-label", () => {
    const today = {
      start: new Date("2026-09-04T00:00:00.000Z"),
      end: new Date("2026-09-05T00:00:00.000Z"),
      kind: "today" as const,
    };
    const shift = {
      start: new Date("2026-09-04T07:00:00.000Z"),
      end: new Date("2026-09-04T15:00:00.000Z"),
      kind: "shift" as const,
    };
    const released = item({
      status: "approved",
      collected: true,
      collectedAt: "2026-09-04T08:00:00.000Z",
      reviewedAt: "2026-09-04T09:30:00.000Z",
    });
    const yesterday = item({
      id: "o8:FBC:0",
      status: "approved",
      collected: true,
      reviewedAt: "2026-09-03T18:00:00.000Z",
    });
    expect(isReleasedInWindow(released, today)).toBe(true);
    expect(isReleasedInWindow(yesterday, today)).toBe(false);
    expect(isReleasedInWindow(released, shift)).toBe(true);
    expect(releasedSubLabel(today)).toBe("TODAY");
    expect(releasedSubLabel(shift)).toBe("BY THIS SHIFT");
  });
});

describe("tile filtering and worklist order", () => {
  it("filters in place without dropping items from other tiles' counts", () => {
    const window = {
      start: new Date("2026-09-04T00:00:00.000Z"),
      end: new Date("2026-09-05T00:00:00.000Z"),
      kind: "today" as const,
    };
    const rows = [
      item({ id: "a", recollectionOfOrderId: "old" }),
      item({ id: "b", testCode: "HB", createdAt: "2026-09-04T09:30:00.000Z" }),
      item({
        id: "c",
        collected: true,
        collectedAt: "2026-09-04T09:00:00.000Z",
        status: "pending",
      }),
      item({
        id: "d",
        status: "approved",
        collected: true,
        reviewedAt: "2026-09-04T09:10:00.000Z",
      }),
    ];
    const counts = tileCounts(rows, NOW, window);
    expect(counts).toEqual({ attention: 1, awaiting: 2, results: 1, released: 1 });
    expect(filterBoardItems(rows, "results", NOW, window).map((row) => row.id)).toEqual(["c"]);
    expect(filterBoardItems(rows, "attention", NOW, window).map((row) => row.id)).toEqual(["a"]);
    expect(filterBoardItems(rows, null, NOW, window)).toHaveLength(4);
  });

  it("orders recollect, then overdue, then due-within, then results, then awaiting", () => {
    const rows = [
      item({ id: "await", createdAt: "2026-09-04T09:50:00.000Z" }),
      item({
        id: "enter",
        collected: true,
        collectedAt: "2026-09-04T09:40:00.000Z",
        status: "pending",
      }),
      item({
        id: "due",
        tatMinutes: 90,
        createdAt: "2026-09-04T09:15:00.000Z",
      }),
      item({
        id: "late",
        tatMinutes: 30,
        createdAt: "2026-09-04T08:00:00.000Z",
        collected: true,
        collectedAt: "2026-09-04T08:00:00.000Z",
      }),
      item({ id: "recollect", recollectionOfOrderId: "old" }),
    ];
    expect(orderWorklist(rows, NOW).map((row) => row.id)).toEqual([
      "recollect",
      "late",
      "due",
      "enter",
      "await",
    ]);
  });

  it("caps the list at ten until show-all", () => {
    const rows = Array.from({ length: 12 }, (_, i) => item({ id: `n${i}` }));
    expect(visibleWorklist(rows, false)).toHaveLength(10);
    expect(visibleWorklist(rows, true)).toHaveLength(12);
  });
});

describe("greeting and actions", () => {
  it("omits the shift segment when no roster window exists", () => {
    expect(greetingFirstName("binta jallow", "x")).toBe("Binta");
    expect(formatGreetingLine(LOCAL_MORNING, "Binta")).toBe("Good morning, Binta");
    expect(formatBoardMetaLine({ now: LOCAL_MORNING, itemCount: 11 })).toBe("FRI 4 SEP · 11 ITEMS");
    expect(
      formatBoardMetaLine({
        now: LOCAL_MORNING,
        itemCount: 11,
        shift: { startTime: "07:00", endTime: "15:00" },
      })
    ).toBe("FRI 4 SEP · SHIFT 07:00–15:00 · 11 ITEMS");
  });

  it("uses collect, enter results, or open from real next work", () => {
    expect(techRowAction(item(), true, true).label).toBe("Collect");
    expect(
      techRowAction(
        item({ collected: true, collectedAt: "2026-09-04T09:00:00.000Z" }),
        true,
        true
      ).label
    ).toBe("Enter results");
    expect(techRowAction(item(), false, false).label).toBe("Open");
  });
});

describe("buildTechWorkItems", () => {
  it("looks up tatMinutes from the catalogue test, never a parameter", () => {
    const items = buildTechWorkItems(
      [
        {
          id: "o1",
          status: "pending",
          tests: [{ code: "FBC", name: "Full Blood Count (FBC)", specimenType: "blood" }],
          sampleCollectedAt: null,
          sampleCollectedBy: null,
          sampleCollectedSource: null,
          sampleCollections: null,
          createdAt: "2026-09-04T08:00:00.000Z",
          reviewedAt: null,
          recollectionOfOrderId: null,
          patientId: "p1",
          patientLabId: "LAB-1",
        },
      ],
      new Map([["p1", { name: "Ada", labId: "LAB-1" }]]),
      [
        { code: "FBC", tatMinutes: 120, specimenType: "blood" },
        { code: "HB", tatMinutes: 30, specimenType: "blood" },
      ]
    );
    expect(items).toHaveLength(1);
    expect(items[0]?.tatMinutes).toBe(120);
    expect(items[0]?.patientName).toBe("Ada");
  });

  it("drops cancelled orders and keeps rejected recollect work", () => {
    const items = buildTechWorkItems(
      [
        {
          id: "stopped",
          status: "cancelled",
          tests: [{ code: "HB", name: "Hb" }],
          sampleCollectedAt: null,
          sampleCollectedBy: null,
          sampleCollectedSource: null,
          sampleCollections: null,
          patientId: "p1",
        },
        {
          id: "bad",
          status: "rejected",
          tests: [{ code: "HB", name: "Hb" }],
          sampleCollectedAt: null,
          sampleCollectedBy: null,
          sampleCollectedSource: null,
          sampleCollections: null,
          recollectionOfOrderId: null,
          patientId: "p1",
          patientLabId: "L2",
        },
      ],
      new Map([["p1", { name: "Bea" }]]),
      [{ code: "HB" }]
    );
    expect(items.map((row) => row.orderId)).toEqual(["bad"]);
    expect(boardItems(items, NOW, {
      start: new Date("2026-09-04T00:00:00.000Z"),
      end: new Date("2026-09-05T00:00:00.000Z"),
      kind: "today",
    })).toHaveLength(1);
  });
});
