/**
 * Lab manager / supervisor landing board.
 * Tiles ask whether the line is moving. Rows are stages, not per-test samples.
 *
 * Stock-out → orders-affected is joined only when an inventory item has
 * testCode. No testCode means no count — never guessed.
 * Median TAT is classifyTurnaround elapsed hours (collection → review), not a target.
 */

import {
  balanceFor,
  batchState,
  computeBalances,
  stockLevel,
  type InventoryBatch,
  type InventoryItem,
  type InventoryMovement,
} from "./inventory";
import type { OperationalFlagInput } from "./operationalFlag";
import { BREAK_GLASS_CODES, reasonCodeLabel } from "./reasonCodes";
import { orderHasCriticalResults } from "./resultFlag";
import { isReleasedResultStatus, parsePendingAmendment } from "./resultAmendment";
import { isTerminalOrderStatus } from "./orderLifecycle";
import { rosterShiftWindow, type RosterEntry, type RosterSession } from "./roster";
import {
  interpretCollection,
  type OrderCollectionFields,
  type OrderTestRef,
} from "./sampleCollection";
import { classifyTurnaround, summarizeTurnaround, type TurnaroundSample } from "./datetime";
import type { TestParameter } from "./testCatalog";
import {
  releaseWindowForBoard,
  visibleWorklist,
  type TechReleaseWindow,
} from "./technicianBoard";

export { visibleWorklist };
export type { TechReleaseWindow };

export const MANAGER_TILES = ["blocked", "review", "progress", "released"] as const;
export type ManagerTileId = (typeof MANAGER_TILES)[number];

export const MANAGER_BOARD_PAGE_SIZE = 10;

export type ManagerStageKind =
  | "stock_out"
  | "critical_unreleased"
  | "amendment_pending"
  | "off_roster"
  | "awaiting_review"
  | "in_progress"
  | "released";

export type ManagerCatalogRow = {
  code: string;
  name?: string;
  specimenType?: unknown;
  parameters: TestParameter[];
};

export type ManagerOrder = OrderCollectionFields & {
  createdAt?: string | null;
  reviewedAt?: string | null;
  resultsEnteredAt?: string | null;
  results?: Record<string, Record<string, string>> | null;
  pendingAmendment?: unknown;
  patientId?: string | null;
  patientLabId?: string | null;
  patientSex?: string | null;
};

export type ManagerPatient = {
  name?: unknown;
  preferredName?: unknown;
  labId?: unknown;
  sex?: unknown;
};

export type ManagerStageRow = {
  id: string;
  tile: ManagerTileId;
  kind: ManagerStageKind;
  labId: string | null;
  title: string;
  detail: string;
  href: string | null;
  actionLabel: string | null;
  at: string | null;
  elapsedMinutes: number | null;
  ordersAffected: number | null;
  notYetSynced?: boolean;
};

export function clinicReleaseWindow(
  entries: Array<RosterEntry | null | undefined>,
  now: Date
): TechReleaseWindow {
  const valid = entries.filter((row): row is RosterEntry => row != null);
  return releaseWindowForBoard(rosterShiftWindow(valid, now), now);
}

export function sessionOverlapsWindow(
  session: Pick<RosterSession, "startsAt" | "endsAt">,
  window: TechReleaseWindow
): boolean {
  const start = Date.parse(session.startsAt);
  const end = Date.parse(session.endsAt);
  if (Number.isNaN(start) || Number.isNaN(end)) return false;
  return start < window.end.getTime() && end > window.start.getTime();
}

export function isOpenWork(status: string | null | undefined): boolean {
  return status === "pending" || status === "results_entered" || status === "needs_correction";
}

function timeMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

export function elapsedMinutesSince(iso: string | null | undefined, now: Date): number | null {
  const start = timeMs(iso);
  if (start == null) return null;
  return Math.max(0, (now.getTime() - start) / 60000);
}

/** Same usable-stock rule as the store page: skip expired and rejected lots. */
export function usableOnHandByItem(
  batches: InventoryBatch[],
  movements: InventoryMovement[],
  now: Date
): Map<string, number> {
  const balances = computeBalances(movements);
  const totals = new Map<string, number>();
  for (const batch of batches) {
    const onHand = balanceFor(balances, batch.id).onHand;
    const state = batchState(batch, onHand, now);
    if (state === "expired" || state === "rejected") continue;
    totals.set(batch.itemId, (totals.get(batch.itemId) ?? 0) + Math.max(onHand, 0));
  }
  return totals;
}

/**
 * Count open orders whose tests include this catalogue code.
 * Returns null when there is no code to join on — callers must not display a number.
 */
export function openOrdersAffectedByTestCode(
  testCode: string | null | undefined,
  orders: Array<{ status: string; tests: OrderTestRef[] }>
): number | null {
  const code = typeof testCode === "string" ? testCode.trim() : "";
  if (!code) return null;
  return orders.filter(
    (order) => isOpenWork(order.status) && order.tests.some((test) => test.code === code)
  ).length;
}

export function isCriticalUnreleased(
  order: ManagerOrder,
  catalog: ManagerCatalogRow[],
  sex: string | null | undefined
): boolean {
  if (isReleasedResultStatus(order.status) || isTerminalOrderStatus(order.status)) return false;
  return orderHasCriticalResults(order.tests, order.results, catalog, sex ?? null);
}

export function isAwaitingReviewStage(order: ManagerOrder): boolean {
  return order.status === "results_entered";
}

export function isInProgressStage(order: ManagerOrder, catalog: ManagerCatalogRow[]): boolean {
  if (order.status === "needs_correction") return true;
  if (order.status !== "pending") return false;
  return interpretCollection(order, catalog).allCollected;
}

export function isReleasedInWindow(order: ManagerOrder, window: TechReleaseWindow): boolean {
  if (!isReleasedResultStatus(order.status)) return false;
  const at = timeMs(order.reviewedAt);
  if (at == null) return false;
  return at >= window.start.getTime() && at < window.end.getTime();
}

function testNames(order: Pick<ManagerOrder, "tests">): string {
  const names = order.tests.map((test) => test.name || test.code).filter(Boolean);
  return names.length > 0 ? names.join(", ") : "—";
}

function patientTitle(
  order: ManagerOrder,
  patientsById: Map<string, ManagerPatient>
): { labId: string; name: string } {
  const patient = order.patientId ? patientsById.get(order.patientId) : undefined;
  const name =
    (typeof patient?.preferredName === "string" && patient.preferredName.trim()) ||
    (typeof patient?.name === "string" && patient.name.trim()) ||
    "Unknown patient";
  const labId =
    (typeof order.patientLabId === "string" && order.patientLabId) ||
    (typeof patient?.labId === "string" && patient.labId) ||
    "—";
  return { labId, name };
}

function patientSex(
  order: ManagerOrder,
  patientsById: Map<string, ManagerPatient>
): string | null {
  if (typeof order.patientSex === "string" && order.patientSex) return order.patientSex;
  const patient = order.patientId ? patientsById.get(order.patientId) : undefined;
  return typeof patient?.sex === "string" ? patient.sex : null;
}

function formatHoursToken(hours: number): string {
  if (hours < 10) return `${hours.toFixed(1)}H`;
  return `${Math.round(hours)}H`;
}

export function releasedTatSubLabel(
  medianHours: number | null,
  window: TechReleaseWindow
): string {
  const when = window.kind === "shift" ? "THIS SHIFT" : "TODAY";
  if (medianHours == null) return `ELAPSED TAT — · ${when}`;
  return `MEDIAN ${formatHoursToken(medianHours)} ELAPSED · ${when}`;
}

export function medianElapsedTatHours(orders: TurnaroundSample[]): number | null {
  return summarizeTurnaround(orders).median;
}

export function stockOutDetail(
  item: Pick<InventoryItem, "department" | "minimumStock">,
  onHand: number,
  ordersAffected: number | null
): string {
  const parts = [
    item.department || "Bench",
    `ON HAND ${onHand} / MIN ${item.minimumStock}`,
  ];
  if (ordersAffected != null) {
    parts.push(`${ordersAffected} ${ordersAffected === 1 ? "ORDER" : "ORDERS"}`);
  }
  return parts.join(" · ");
}

function buildStockOutRows(
  items: InventoryItem[],
  onHandByItem: Map<string, number>,
  orders: ManagerOrder[]
): ManagerStageRow[] {
  const rows: ManagerStageRow[] = [];
  for (const item of items) {
    if (item.active === false) continue;
    const onHand = onHandByItem.get(item.id) ?? 0;
    if (stockLevel(onHand, item.minimumStock) !== "out") continue;
    const ordersAffected = openOrdersAffectedByTestCode(item.testCode, orders);
    rows.push({
      id: `stock:${item.id}`,
      tile: "blocked",
      kind: "stock_out",
      labId: null,
      title: item.name || "Unnamed item",
      detail: stockOutDetail(item, onHand, ordersAffected),
      href: "/inventory",
      actionLabel: "Open store",
      at: null,
      elapsedMinutes: null,
      ordersAffected,
      notYetSynced: item.notYetSynced,
    });
  }
  return rows;
}

function buildOffRosterRows(
  sessions: RosterSession[],
  window: TechReleaseWindow
): ManagerStageRow[] {
  return sessions.filter((session) => sessionOverlapsWindow(session, window)).map((session) => ({
    id: `roster:${session.id}`,
    tile: "blocked" as const,
    kind: "off_roster" as const,
    labId: null,
    title: session.displayName || session.userUid,
    detail: reasonCodeLabel(BREAK_GLASS_CODES, session.reasonCode) || session.reasonCode,
    href: null,
    actionLabel: null,
    at: session.startsAt,
    elapsedMinutes: null,
    ordersAffected: null,
  }));
}

export function buildManagerStages(input: {
  orders: ManagerOrder[];
  patientsById: Map<string, ManagerPatient>;
  catalog: ManagerCatalogRow[];
  items: InventoryItem[];
  batches: InventoryBatch[];
  movements: InventoryMovement[];
  sessions: RosterSession[];
  window: TechReleaseWindow;
  now: Date;
}): ManagerStageRow[] {
  const { orders, patientsById, catalog, items, batches, movements, sessions, window, now } =
    input;
  const onHandByItem = usableOnHandByItem(batches, movements, now);
  const rows: ManagerStageRow[] = [
    ...buildStockOutRows(items, onHandByItem, orders),
    ...buildOffRosterRows(sessions, window),
  ];

  for (const order of orders) {
    if (order.status === "cancelled") continue;
    const pending = parsePendingAmendment(order.pendingAmendment);
    if (pending) {
      const identity = patientTitle(order, patientsById);
      rows.push({
        id: `amend:${order.id}`,
        tile: "review",
        kind: "amendment_pending",
        labId: identity.labId,
        title: identity.name,
        detail: pending.amendmentReason || "Waiting for a second approver",
        href: `/orders/${order.id}`,
        actionLabel: "Open",
        at: pending.initiatedAt,
        elapsedMinutes: elapsedMinutesSince(pending.initiatedAt, now),
        ordersAffected: null,
        notYetSynced: order.notYetSynced,
      });
    }

    const sex = patientSex(order, patientsById);
    const identity = patientTitle(order, patientsById);
    const names = testNames(order);

    if (isCriticalUnreleased(order, catalog, sex)) {
      const enteredAt = order.resultsEnteredAt || null;
      rows.push({
        id: `crit:${order.id}`,
        tile: "blocked",
        kind: "critical_unreleased",
        labId: identity.labId,
        title: identity.name,
        detail: names,
        href: `/orders/${order.id}`,
        actionLabel: "Open",
        at: enteredAt,
        elapsedMinutes: elapsedMinutesSince(enteredAt, now),
        ordersAffected: null,
        notYetSynced: order.notYetSynced,
      });
      continue;
    }

    if (isAwaitingReviewStage(order)) {
      rows.push({
        id: `review:${order.id}`,
        tile: "review",
        kind: "awaiting_review",
        labId: identity.labId,
        title: identity.name,
        detail: names,
        href: `/orders/${order.id}`,
        actionLabel: "Open",
        at: order.resultsEnteredAt || order.createdAt || null,
        elapsedMinutes: elapsedMinutesSince(order.resultsEnteredAt, now),
        ordersAffected: null,
        notYetSynced: order.notYetSynced,
      });
      continue;
    }

    if (isInProgressStage(order, catalog)) {
      rows.push({
        id: `progress:${order.id}`,
        tile: "progress",
        kind: "in_progress",
        labId: identity.labId,
        title: identity.name,
        detail: names,
        href: `/orders/${order.id}`,
        actionLabel: "Open",
        at: order.createdAt || null,
        elapsedMinutes: null,
        ordersAffected: null,
        notYetSynced: order.notYetSynced,
      });
      continue;
    }

    if (isReleasedInWindow(order, window)) {
      const tat = classifyTurnaround(order);
      const tatDetail =
        tat.hours == null ? names : `${names} · ${formatHoursToken(tat.hours)} ELAPSED`;
      rows.push({
        id: `released:${order.id}`,
        tile: "released",
        kind: "released",
        labId: identity.labId,
        title: identity.name,
        detail: tatDetail,
        href: `/orders/${order.id}`,
        actionLabel: "Open",
        at: order.reviewedAt || null,
        elapsedMinutes: null,
        ordersAffected: null,
        notYetSynced: order.notYetSynced,
      });
    }
  }

  return rows;
}

export function itemInTile(row: ManagerStageRow, tile: ManagerTileId): boolean {
  return row.tile === tile;
}

export function filterBoardItems(
  rows: ManagerStageRow[],
  tile: ManagerTileId | null
): ManagerStageRow[] {
  if (!tile) return rows;
  return rows.filter((row) => itemInTile(row, tile));
}

export function tileCounts(rows: ManagerStageRow[]): Record<ManagerTileId, number> {
  return {
    blocked: rows.filter((row) => row.tile === "blocked").length,
    review: rows.filter((row) => row.tile === "review").length,
    progress: rows.filter((row) => row.tile === "progress").length,
    released: rows.filter((row) => row.tile === "released").length,
  };
}

function kindRank(kind: ManagerStageKind): number {
  switch (kind) {
    case "stock_out":
      return 0;
    case "critical_unreleased":
      return 1;
    case "off_roster":
      return 2;
    case "amendment_pending":
      return 3;
    case "awaiting_review":
      return 4;
    case "in_progress":
      return 5;
    case "released":
      return 6;
  }
}

export function orderWorklist(rows: ManagerStageRow[]): ManagerStageRow[] {
  return [...rows].sort((a, b) => {
    const rank = kindRank(a.kind) - kindRank(b.kind);
    if (rank !== 0) return rank;
    const aAt = a.at || "";
    const bAt = b.at || "";
    if (aAt !== bAt) {
      if (!a.at) return 1;
      if (!b.at) return -1;
      return aAt < bAt ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });
}

export function blockedSubLabel(rows: ManagerStageRow[]): string {
  const kinds = new Set(rows.filter((row) => row.tile === "blocked").map((row) => row.kind));
  const parts: string[] = [];
  if (kinds.has("stock_out")) parts.push("STOCK OUT");
  if (kinds.has("critical_unreleased")) parts.push("CRITICAL");
  if (kinds.has("off_roster")) parts.push("OFF-ROSTER");
  return parts.join(" / ") || "STOCK OUT / CRITICAL";
}

export function reviewSubLabel(rows: ManagerStageRow[]): string {
  const kinds = new Set(rows.filter((row) => row.tile === "review").map((row) => row.kind));
  if (kinds.has("amendment_pending") && kinds.has("awaiting_review")) return "REVIEW / AMENDMENT";
  if (kinds.has("amendment_pending")) return "SECOND APPROVER";
  return "RESULTS ENTERED";
}

export function operationalForManagerStage(row: ManagerStageRow): OperationalFlagInput {
  switch (row.kind) {
    case "stock_out":
      return { state: "overdue", label: "STOCK OUT" };
    case "critical_unreleased":
      if (row.elapsedMinutes == null) return { state: "overdue", label: "CRITICAL" };
      return { state: "overdue", elapsedMinutes: row.elapsedMinutes };
    case "off_roster":
      return { state: "overdue", label: "OFF ROSTER" };
    case "amendment_pending":
      return { state: "due", label: "AMENDMENT" };
    case "awaiting_review":
      return { state: "results-entered" };
    case "in_progress":
      return { state: "collected" };
    case "released":
      return { state: "released" };
  }
}

export function releasedOrdersForTat(
  orders: ManagerOrder[],
  window: TechReleaseWindow
): TurnaroundSample[] {
  return orders.filter((order) => isReleasedInWindow(order, window));
}
