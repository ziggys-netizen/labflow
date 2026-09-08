/**
 * Technician landing board. Overdue / due-within are computed only when the
 * catalogue test has tatMinutes. No clinic-wide fallback, no guessed SLA.
 */

import { operationalFromOrder } from "./operationalFlag";
import type { OperationalFlagInput } from "./operationalFlag";
import { isReleasedResultStatus } from "./resultAmendment";
import { interpretCollection, type OrderCollectionFields, type OrderTestRef } from "./sampleCollection";
import { parseTatMinutes, resolveSpecimenType, type LabTest } from "./testCatalog";

export const TECH_TILES = ["attention", "awaiting", "results", "released"] as const;

export type TechTileId = (typeof TECH_TILES)[number];

export const TECH_BOARD_PAGE_SIZE = 10;

export type TechWorkItem = {
  id: string;
  orderId: string;
  labId: string;
  patientName: string;
  testName: string;
  testCode: string;
  status: string;
  recollectionOfOrderId: string | null;
  collected: boolean;
  createdAt: string | null;
  collectedAt: string | null;
  reviewedAt: string | null;
  tatMinutes: number | null;
  notYetSynced?: boolean;
};

export type TechTatClock = {
  elapsedMinutes: number;
  remainingMinutes: number;
  overdue: boolean;
  dueWithin1h: boolean;
};

export type TechReleaseWindow = {
  start: Date;
  end: Date;
  kind: "shift" | "today";
};

export type CatalogTatRow = Pick<LabTest, "code"> & {
  tatMinutes?: unknown;
  specimenType?: unknown;
  name?: string;
};

export function greetingPeriod(now: Date): "morning" | "afternoon" | "evening" {
  const hour = now.getHours();
  if (hour < 12) return "morning";
  if (hour < 17) return "afternoon";
  return "evening";
}

export function greetingFirstName(displayName: string | null | undefined, username: string | null | undefined): string {
  const raw = (displayName || username || "").trim();
  if (!raw) return "";
  const token = raw.split(/\s+/)[0] ?? "";
  if (!token) return "";
  return token.charAt(0).toUpperCase() + token.slice(1);
}

export function formatGreetingLine(now: Date, firstName: string): string {
  const period = greetingPeriod(now);
  return firstName ? `Good ${period}, ${firstName}` : `Good ${period}`;
}

const WEEKDAYS = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"] as const;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"] as const;

export function formatBoardDay(now: Date): string {
  return `${WEEKDAYS[now.getDay()]} ${now.getDate()} ${MONTHS[now.getMonth()]}`;
}

export function formatBoardMetaLine(input: {
  now: Date;
  itemCount: number;
  shift?: { startTime: string; endTime: string } | null;
}): string {
  const parts = [formatBoardDay(input.now)];
  if (input.shift) {
    parts.push(`SHIFT ${input.shift.startTime}–${input.shift.endTime}`);
  }
  parts.push(`${input.itemCount} ${input.itemCount === 1 ? "ITEM" : "ITEMS"}`);
  return parts.join(" · ");
}

export function calendarTodayWindow(now: Date): TechReleaseWindow {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  const end = new Date(start);
  end.setDate(end.getDate() + 1);
  return { start, end, kind: "today" };
}

export function releaseWindowForBoard(
  shift: { start: Date; end: Date } | null,
  now: Date
): TechReleaseWindow {
  if (shift) return { start: shift.start, end: shift.end, kind: "shift" };
  return calendarTodayWindow(now);
}

function timeMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

export function tatClockStartIso(item: Pick<TechWorkItem, "collected" | "collectedAt" | "createdAt">): string | null {
  if (item.collected && item.collectedAt) return item.collectedAt;
  return item.createdAt;
}

export function computeTatClock(
  tatMinutes: number | null,
  clockStartedAt: string | null,
  now: Date
): TechTatClock | null {
  const target = parseTatMinutes(tatMinutes);
  const start = timeMs(clockStartedAt);
  if (target == null || start == null) return null;
  const elapsedMinutes = (now.getTime() - start) / 60000;
  const remainingMinutes = target - elapsedMinutes;
  return {
    elapsedMinutes,
    remainingMinutes,
    overdue: remainingMinutes < 0,
    dueWithin1h: remainingMinutes >= 0 && remainingMinutes <= 60,
  };
}

export function isRecollectWork(item: Pick<TechWorkItem, "status" | "recollectionOfOrderId">): boolean {
  return Boolean(item.recollectionOfOrderId) || item.status === "rejected";
}

export function isNeedsAttention(item: TechWorkItem, now: Date): boolean {
  if (isRecollectWork(item)) return true;
  if (item.status === "cancelled") return false;
  if (isReleasedResultStatus(item.status)) return false;
  const clock = computeTatClock(item.tatMinutes, tatClockStartIso(item), now);
  return clock?.overdue === true;
}

export function isAwaitingCollection(item: TechWorkItem): boolean {
  if (item.status === "cancelled") return false;
  if (isReleasedResultStatus(item.status)) return false;
  if (item.status === "rejected") return false;
  return !item.collected;
}

export function isResultsToEnter(item: TechWorkItem): boolean {
  if (item.status === "cancelled") return false;
  if (isReleasedResultStatus(item.status)) return false;
  if (item.status === "rejected") return false;
  return item.collected && (item.status === "pending" || item.status === "needs_correction");
}

export function isReleasedInWindow(item: TechWorkItem, window: TechReleaseWindow): boolean {
  if (!isReleasedResultStatus(item.status)) return false;
  const at = timeMs(item.reviewedAt);
  if (at == null) return false;
  return at >= window.start.getTime() && at < window.end.getTime();
}

export function itemInTile(
  item: TechWorkItem,
  tile: TechTileId,
  now: Date,
  window: TechReleaseWindow
): boolean {
  switch (tile) {
    case "attention":
      return isNeedsAttention(item, now);
    case "awaiting":
      return isAwaitingCollection(item);
    case "results":
      return isResultsToEnter(item);
    case "released":
      return isReleasedInWindow(item, window);
  }
}

export function boardItems(
  items: TechWorkItem[],
  now: Date,
  window: TechReleaseWindow
): TechWorkItem[] {
  return items.filter((item) => TECH_TILES.some((tile) => itemInTile(item, tile, now, window)));
}

export function filterBoardItems(
  items: TechWorkItem[],
  tile: TechTileId | null,
  now: Date,
  window: TechReleaseWindow
): TechWorkItem[] {
  const scoped = boardItems(items, now, window);
  if (!tile) return scoped;
  return scoped.filter((item) => itemInTile(item, tile, now, window));
}

export function urgencyRank(item: TechWorkItem, now: Date): number {
  if (isRecollectWork(item)) return 0;
  const clock = computeTatClock(item.tatMinutes, tatClockStartIso(item), now);
  if (clock?.overdue) return 1;
  if (clock?.dueWithin1h) return 2;
  if (item.status === "needs_correction") return 3;
  if (isResultsToEnter(item)) return 4;
  if (isAwaitingCollection(item)) return 5;
  if (isReleasedResultStatus(item.status)) return 6;
  return 7;
}

export function orderWorklist(items: TechWorkItem[], now: Date): TechWorkItem[] {
  return [...items].sort((a, b) => {
    const rank = urgencyRank(a, now) - urgencyRank(b, now);
    if (rank !== 0) return rank;
    const aClock = computeTatClock(a.tatMinutes, tatClockStartIso(a), now);
    const bClock = computeTatClock(b.tatMinutes, tatClockStartIso(b), now);
    if (aClock && bClock && aClock.remainingMinutes !== bClock.remainingMinutes) {
      return aClock.remainingMinutes - bClock.remainingMinutes;
    }
    const aStart = tatClockStartIso(a) || "";
    const bStart = tatClockStartIso(b) || "";
    if (aStart !== bStart) return aStart < bStart ? -1 : 1;
    return a.id.localeCompare(b.id);
  });
}

export function tileCounts(
  items: TechWorkItem[],
  now: Date,
  window: TechReleaseWindow
): Record<TechTileId, number> {
  const scoped = boardItems(items, now, window);
  return {
    attention: scoped.filter((item) => isNeedsAttention(item, now)).length,
    awaiting: scoped.filter((item) => isAwaitingCollection(item)).length,
    results: scoped.filter((item) => isResultsToEnter(item)).length,
    released: scoped.filter((item) => isReleasedInWindow(item, window)).length,
  };
}

export function attentionSubLabel(items: TechWorkItem[], now: Date): string {
  const rows = items.filter((item) => isNeedsAttention(item, now));
  const recollect = rows.some(isRecollectWork);
  const overdue = rows.some((item) => {
    if (isRecollectWork(item) || isReleasedResultStatus(item.status) || item.status === "cancelled") {
      return false;
    }
    return computeTatClock(item.tatMinutes, tatClockStartIso(item), now)?.overdue === true;
  });
  if (recollect && overdue) return "RECOLLECT / OVERDUE";
  if (overdue) return "OVERDUE";
  if (recollect) return "RECOLLECT";
  return "RECOLLECT / OVERDUE";
}

export function awaitingSubLabel(items: TechWorkItem[], now: Date): string {
  const due = items.filter((item) => {
    if (!isAwaitingCollection(item)) return false;
    return computeTatClock(item.tatMinutes, tatClockStartIso(item), now)?.dueWithin1h === true;
  }).length;
  if (due > 0) return `${due} DUE WITHIN 1H`;
  return "NOT COLLECTED";
}

export function releasedSubLabel(window: TechReleaseWindow): string {
  return window.kind === "shift" ? "BY THIS SHIFT" : "TODAY";
}

export function operationalForTechItem(item: TechWorkItem, now: Date): OperationalFlagInput {
  const flag = operationalFromOrder(
    {
      status: item.status,
      recollectionOfOrderId: item.recollectionOfOrderId,
      createdAt: item.createdAt,
      tatMinutes: item.tatMinutes,
      collected: item.collected,
      collectedAt: item.collectedAt,
      tests: item.testCode
        ? [{ code: item.testCode, name: item.testName, specimenType: null }]
        : [],
      sampleCollectedAt: item.collected ? item.collectedAt : null,
    },
    now
  );
  return flag ?? { state: "ordinary", label: item.collected ? "COLLECTED" : "OPEN" };
}

export function stageTimeLabel(item: TechWorkItem, now: Date): string {
  const op = operationalForTechItem(item, now);
  const iso =
    op.state === "released"
      ? item.reviewedAt
      : item.collected
        ? item.collectedAt
        : item.createdAt;
  const time = formatHm(iso);
  if (op.state === "recollect") return time ? `RECOLLECT ${time}` : "RECOLLECT";
  if (op.state === "released") return time ? `RELEASED ${time}` : "RELEASED";
  if (op.state === "awaiting-sample") return time ? `AWAITING SAMPLE ${time}` : "AWAITING SAMPLE";
  if (item.collected) return time ? `COLLECTED ${time}` : "COLLECTED";
  return time ? `OPEN ${time}` : "OPEN";
}

function formatHm(iso: string | null | undefined): string {
  const ms = timeMs(iso);
  if (ms == null) return "";
  const d = new Date(ms);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

export type TechRowAction = {
  kind: "collect" | "enter" | "open";
  label: "Collect" | "Enter results" | "Open";
};

export function techRowAction(
  item: TechWorkItem,
  canCollect: boolean,
  canEnter: boolean
): TechRowAction {
  if (isAwaitingCollection(item) && canCollect) {
    return { kind: "collect", label: "Collect" };
  }
  if (isResultsToEnter(item) && canEnter) {
    return { kind: "enter", label: "Enter results" };
  }
  return { kind: "open", label: "Open" };
}

export function visibleWorklist<T>(items: T[], showAll: boolean, pageSize = TECH_BOARD_PAGE_SIZE): T[] {
  if (showAll) return items;
  return items.slice(0, pageSize);
}

function specimenCollectedAt(
  order: OrderCollectionFields,
  test: OrderTestRef,
  catalog: CatalogTatRow[]
): string | null {
  const type = resolveSpecimenType(test.specimenType, test.code, catalog);
  const interpreted = interpretCollection(order, catalog);
  const row = interpreted.byType.find((entry) => entry.type === type);
  return row?.collectedAt ?? (interpreted.allCollected ? interpreted.latestCollectedAt : null);
}

export function buildTechWorkItems(
  orders: Array<
    OrderCollectionFields & {
      createdAt?: string | null;
      reviewedAt?: string | null;
      recollectionOfOrderId?: string | null;
      patientId?: string | null;
      patientLabId?: string | null;
    }
  >,
  patientsById: Map<string, { name?: unknown; preferredName?: unknown; labId?: unknown }>,
  catalog: CatalogTatRow[]
): TechWorkItem[] {
  const tatByCode = new Map(catalog.map((row) => [row.code, parseTatMinutes(row.tatMinutes)]));
  const items: TechWorkItem[] = [];

  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const patient = order.patientId ? patientsById.get(order.patientId) : undefined;
    const patientName =
      (typeof patient?.preferredName === "string" && patient.preferredName.trim()) ||
      (typeof patient?.name === "string" && patient.name.trim()) ||
      "Unknown patient";
    const labId =
      (typeof order.patientLabId === "string" && order.patientLabId) ||
      (typeof patient?.labId === "string" && patient.labId) ||
      "—";
    const tests = order.tests.length > 0 ? order.tests : [{ code: "", name: "—" }];

    tests.forEach((test, index) => {
      const collectedAt = test.code ? specimenCollectedAt(order, test, catalog) : interpretCollection(order, catalog).latestCollectedAt;
      const collected = Boolean(collectedAt);
      items.push({
        id: `${order.id}:${test.code || "none"}:${index}`,
        orderId: order.id,
        labId,
        patientName,
        testName: test.name || test.code || "—",
        testCode: test.code || "",
        status: order.status,
        recollectionOfOrderId: order.recollectionOfOrderId ?? null,
        collected,
        createdAt: typeof order.createdAt === "string" ? order.createdAt : null,
        collectedAt,
        reviewedAt: typeof order.reviewedAt === "string" ? order.reviewedAt : null,
        tatMinutes: test.code ? (tatByCode.get(test.code) ?? null) : null,
        notYetSynced: order.notYetSynced,
      });
    });
  }

  return items;
}
