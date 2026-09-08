/**
 * Storekeeper landing board.
 * Tiles ask what moved and what is about to run out.
 *
 * Pending department requests: no request collection or workflow exists in
 * this codebase. The tile stays at 0 and never invents rows.
 */

import {
  balanceFor,
  batchState,
  computeBalances,
  daysUntil,
  formatQuantity,
  isSameLocalDay,
  stockLevel,
  type InventoryBatch,
  type InventoryItem,
  type InventoryMovement,
} from "./inventory";
import type { ActorStamp } from "./actorStamp";
import type { OperationalFlagInput } from "./operationalFlag";
import { visibleWorklist } from "./technicianBoard";

export { visibleWorklist };

export const STOREKEEPER_TILES = ["reorder", "expiring", "requests", "issued"] as const;
export type StorekeeperTileId = (typeof STOREKEEPER_TILES)[number];

export const STOREKEEPER_BOARD_PAGE_SIZE = 10;

/** Board expiry horizon — distinct from inventory.EXPIRY_WARNING_DAYS (30). */
export const STOREKEEPER_EXPIRY_DAYS = 90;

export type StorekeeperStageKind = "reorder" | "expiring" | "issued";

export type StorekeeperStageRow = {
  id: string;
  tile: StorekeeperTileId;
  kind: StorekeeperStageKind;
  title: string;
  detail: string;
  href: string | null;
  actionLabel: string | null;
  at: string | null;
  daysToExpiry: number | null;
  notYetSynced?: boolean;
};

export type IssuedTodayRow = {
  id: string;
  itemName: string;
  quantityLabel: string;
  lotNumber: string;
  destination: string;
  occurredAt: string;
  notYetSynced?: boolean;
};

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

/** Items at or below minimumStock (includes zero on hand). */
export function isBelowReorder(onHand: number, minimumStock: number): boolean {
  const level = stockLevel(onHand, minimumStock);
  return level === "out" || level === "low";
}

export function isExpiringWithinDays(
  expiryDate: string | null | undefined,
  now: Date,
  withinDays = STOREKEEPER_EXPIRY_DAYS
): boolean {
  const days = daysUntil(expiryDate, now);
  if (days === null) return false;
  return days >= 0 && days <= withinDays;
}

export function isIssueToday(movement: InventoryMovement, now: Date): boolean {
  return movement.type === "issue" && isSameLocalDay(movement.occurredAt, now);
}

function actorUid(actor: ActorStamp | string | null | undefined): string | null {
  if (!actor) return null;
  if (typeof actor === "string") return null;
  return actor.uid || null;
}

export function isIssuedByUser(
  movement: InventoryMovement,
  userUid: string | null | undefined
): boolean {
  if (!userUid) return false;
  return actorUid(movement.actor) === userUid;
}

export function destinationLabel(movement: InventoryMovement): string {
  return (
    (movement.destination && movement.destination.trim()) ||
    (movement.issuedTo && movement.issuedTo.trim()) ||
    (movement.department && movement.department.trim()) ||
    "—"
  );
}

export function buildReorderRows(
  items: InventoryItem[],
  onHandByItem: Map<string, number>
): StorekeeperStageRow[] {
  const rows: StorekeeperStageRow[] = [];
  for (const item of items) {
    if (item.active === false) continue;
    const onHand = onHandByItem.get(item.id) ?? 0;
    if (!isBelowReorder(onHand, item.minimumStock)) continue;
    rows.push({
      id: `reorder:${item.id}`,
      tile: "reorder",
      kind: "reorder",
      title: item.name || "Unnamed item",
      detail: `${item.department || "Bench"} · ON HAND ${onHand} / MIN ${item.minimumStock}`,
      href: "/inventory/items",
      actionLabel: "Open items",
      at: null,
      daysToExpiry: null,
      notYetSynced: item.notYetSynced,
    });
  }
  return rows.sort((a, b) => a.title.localeCompare(b.title));
}

export function buildExpiringRows(
  items: InventoryItem[],
  batches: InventoryBatch[],
  movements: InventoryMovement[],
  now: Date
): StorekeeperStageRow[] {
  const balances = computeBalances(movements);
  const itemsById = new Map(items.map((item) => [item.id, item]));
  const rows: StorekeeperStageRow[] = [];
  for (const batch of batches) {
    const onHand = balanceFor(balances, batch.id).onHand;
    if (onHand <= 0) continue;
    const state = batchState(batch, onHand, now);
    if (state === "rejected" || state === "expired") continue;
    if (!isExpiringWithinDays(batch.expiryDate, now)) continue;
    const item = itemsById.get(batch.itemId);
    const days = daysUntil(batch.expiryDate, now);
    rows.push({
      id: `expiring:${batch.id}`,
      tile: "expiring",
      kind: "expiring",
      title: item?.name || batch.itemName || "Unnamed item",
      detail: `LOT ${batch.lotNumber || "—"} · ${days}D · ON HAND ${onHand}`,
      href: "/inventory",
      actionLabel: "Open store",
      at: batch.expiryDate,
      daysToExpiry: days,
      notYetSynced: batch.notYetSynced,
    });
  }
  return rows.sort((a, b) => {
    const ad = a.daysToExpiry ?? 9999;
    const bd = b.daysToExpiry ?? 9999;
    if (ad !== bd) return ad - bd;
    return a.id.localeCompare(b.id);
  });
}

export function buildIssuedTodayRows(
  movements: InventoryMovement[],
  now: Date
): StorekeeperStageRow[] {
  return movements
    .filter((movement) => isIssueToday(movement, now))
    .map((movement) => ({
      id: `issued:${movement.id}`,
      tile: "issued" as const,
      kind: "issued" as const,
      title: movement.itemName || "Unnamed item",
      detail: `${formatQuantity(movement.quantity, movement.packingUnit, movement.unitsPerPack, movement.baseUnit)} · LOT ${movement.lotNumber || "—"} · ${destinationLabel(movement)}`,
      href: "/inventory/movements",
      actionLabel: "Open movements",
      at: movement.occurredAt,
      daysToExpiry: null,
      notYetSynced: movement.notYetSynced,
    }))
    .sort((a, b) => (a.at || "").localeCompare(b.at || ""));
}

/**
 * Personal issue list for the signed-in storekeeper.
 * Falls back to all clinic issues today when uid is missing (should not happen).
 */
export function buildMyIssuedTodayList(
  movements: InventoryMovement[],
  userUid: string | null | undefined,
  now: Date
): IssuedTodayRow[] {
  return movements
    .filter((movement) => isIssueToday(movement, now))
    .filter((movement) => !userUid || isIssuedByUser(movement, userUid))
    .map((movement) => ({
      id: movement.id,
      itemName: movement.itemName || "Unnamed item",
      quantityLabel: formatQuantity(
        movement.quantity,
        movement.packingUnit,
        movement.unitsPerPack,
        movement.baseUnit
      ),
      lotNumber: movement.lotNumber || "—",
      destination: destinationLabel(movement),
      occurredAt: movement.occurredAt,
      notYetSynced: movement.notYetSynced,
    }))
    .sort((a, b) => a.occurredAt.localeCompare(b.occurredAt));
}

export function buildStorekeeperStages(input: {
  items: InventoryItem[];
  batches: InventoryBatch[];
  movements: InventoryMovement[];
  now: Date;
}): StorekeeperStageRow[] {
  const onHandByItem = usableOnHandByItem(input.batches, input.movements, input.now);
  return [
    ...buildReorderRows(input.items, onHandByItem),
    ...buildExpiringRows(input.items, input.batches, input.movements, input.now),
    ...buildIssuedTodayRows(input.movements, input.now),
  ];
}

export function filterBoardItems(
  rows: StorekeeperStageRow[],
  tile: StorekeeperTileId | null
): StorekeeperStageRow[] {
  if (!tile) return rows;
  if (tile === "requests") return [];
  return rows.filter((row) => row.tile === tile);
}

export function tileCounts(rows: StorekeeperStageRow[]): Record<StorekeeperTileId, number> {
  return {
    reorder: rows.filter((row) => row.tile === "reorder").length,
    expiring: rows.filter((row) => row.tile === "expiring").length,
    /** No department-request workflow exists — never invent a count. */
    requests: 0,
    issued: rows.filter((row) => row.tile === "issued").length,
  };
}

export function orderWorklist(rows: StorekeeperStageRow[]): StorekeeperStageRow[] {
  const rank = (kind: StorekeeperStageKind) => {
    switch (kind) {
      case "reorder":
        return 0;
      case "expiring":
        return 1;
      case "issued":
        return 2;
    }
  };
  return [...rows].sort((a, b) => {
    const byKind = rank(a.kind) - rank(b.kind);
    if (byKind !== 0) return byKind;
    if (a.kind === "expiring") {
      const ad = a.daysToExpiry ?? 9999;
      const bd = b.daysToExpiry ?? 9999;
      if (ad !== bd) return ad - bd;
    }
    if ((a.at || "") !== (b.at || "")) {
      if (!a.at) return 1;
      if (!b.at) return -1;
      return a.at < b.at ? -1 : 1;
    }
    return a.id.localeCompare(b.id);
  });
}

export function operationalForStorekeeperStage(row: StorekeeperStageRow): OperationalFlagInput {
  switch (row.kind) {
    case "reorder":
      return { state: "overdue", label: "REORDER" };
    case "expiring":
      return { state: "due", label: row.daysToExpiry == null ? "EXPIRING" : `${row.daysToExpiry}D` };
    case "issued":
      return { state: "released", label: "ISSUED" };
  }
}
