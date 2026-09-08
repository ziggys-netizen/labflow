"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AppNav from "../lib/AppNav";
import NotYetSynced from "../lib/NotYetSynced";
import OperationalRow from "../lib/OperationalRow";
import { useAuth } from "../lib/AuthContext";
import { useClinicCollection } from "../lib/clinicListen";
import { formatDateTime, mapBatch, mapItem, mapMovement } from "../lib/inventory";
import { useStaffSession } from "../lib/pinSession";
import {
  formatBoardMetaLine,
  formatGreetingLine,
  greetingFirstName,
} from "../lib/technicianBoard";
import {
  buildMyIssuedTodayList,
  buildStorekeeperStages,
  filterBoardItems,
  operationalForStorekeeperStage,
  orderWorklist,
  tileCounts,
  visibleWorklist,
  type StorekeeperTileId,
} from "../lib/storekeeperBoard";

const TILES: Array<{ id: StorekeeperTileId; label: string; stripe: string }> = [
  { id: "reorder", label: "Below reorder level", stripe: "border-lf-crit" },
  { id: "expiring", label: "Expiring within 90 days", stripe: "border-lf-warn" },
  { id: "requests", label: "Pending requests", stripe: "border-lf-line-strong" },
  { id: "issued", label: "Issued today", stripe: "border-lf-ok" },
];

export default function StorekeeperBoard() {
  const { user, role, clinicId, username } = useAuth();
  const { acting } = useStaffSession();
  const [tile, setTile] = useState<StorekeeperTileId | null>(null);
  const [showAll, setShowAll] = useState(false);
  const now = useMemo(() => new Date(), []);

  const itemsQuery = useClinicCollection("inventoryItems", role, clinicId);
  const batchesQuery = useClinicCollection("inventoryBatches", role, clinicId);
  const movementsQuery = useClinicCollection("inventoryMovements", role, clinicId);

  const items = useMemo(() => itemsQuery.docs.map(mapItem), [itemsQuery.docs]);
  const batches = useMemo(() => batchesQuery.docs.map(mapBatch), [batchesQuery.docs]);
  const movements = useMemo(() => movementsQuery.docs.map(mapMovement), [movementsQuery.docs]);

  const rows = useMemo(
    () => buildStorekeeperStages({ items, batches, movements, now }),
    [items, batches, movements, now]
  );
  const counts = tileCounts(rows);
  const ordered = orderWorklist(filterBoardItems(rows, tile));
  const visible = visibleWorklist(ordered, showAll);
  const hidden = ordered.length - visible.length;
  const actorUid = acting?.uid || user?.uid || null;
  const myIssues = useMemo(
    () => buildMyIssuedTodayList(movements, actorUid, now),
    [movements, actorUid, now]
  );
  const firstName = greetingFirstName(acting?.displayName, username);
  const sublabels = {
    reorder: "AT OR BELOW MIN",
    expiring: "NEAREST LOTS",
    requests: "NOT IN USE",
    issued: "CLINIC ISSUES",
  } as const;

  const loading = itemsQuery.loading || batchesQuery.loading || movementsQuery.loading;

  function selectTile(id: StorekeeperTileId) {
    setTile((current) => (current === id ? null : id));
    setShowAll(false);
  }

  return (
    <main className="min-h-screen bg-lf-ground">
      <AppNav />
      <div className="lf-shell flex flex-col gap-6 py-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-[19px] font-semibold text-lf-ink">{formatGreetingLine(now, firstName)}</h1>
          <p className="lf-num text-lf-ink-3">
            {formatBoardMetaLine({
              now,
              itemCount: filterBoardItems(rows, null).length,
              shift: null,
            })}
          </p>
        </header>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {TILES.map((row) => {
            const selected = tile === row.id;
            return (
              <button
                key={row.id}
                type="button"
                aria-pressed={selected}
                onClick={() => selectTile(row.id)}
                className={[
                  "lf-op-stripe lf-touch flex flex-col gap-2 rounded-lf-md border border-lf-line bg-lf-surface p-3 text-left",
                  row.stripe,
                  selected ? "ring-1 ring-lf-accent" : "",
                ].join(" ")}
              >
                <span className="text-[11.5px] text-lf-ink">{row.label}</span>
                <span className="lf-num text-[24px] font-semibold text-lf-ink">{counts[row.id]}</span>
                <span className="lf-num text-[11px] text-lf-ink-3">{sublabels[row.id]}</span>
              </button>
            );
          })}
        </div>

        {loading && <p className="text-sm text-lf-ink-2">Loading…</p>}
        {!loading && ordered.length === 0 && (
          <p className="text-sm text-lf-ink-2">
            {tile === "requests"
              ? "Department stock requests are not recorded in LabFlow yet."
              : "No stages in this filter."}
          </p>
        )}

        <div className="flex flex-col gap-3 overflow-x-auto">
          {visible.map((row) => {
            const operational = operationalForStorekeeperStage(row);
            return (
              <OperationalRow
                key={row.id}
                state={operational.state}
                label={operational.label}
                elapsedMinutes={operational.elapsedMinutes}
                className="min-w-[20rem] p-3"
              >
                <div className="flex flex-col gap-2 min-[640px]:flex-row min-[640px]:items-center">
                  <span className="min-w-0 truncate text-sm font-medium text-lf-ink">
                    {row.title}
                    <NotYetSynced show={row.notYetSynced} />
                  </span>
                  <span className="min-w-0 truncate text-sm text-lf-ink">{row.detail}</span>
                  {row.href && row.actionLabel ? (
                    <Link
                      href={row.href}
                      className="lf-touch inline-flex items-center justify-center rounded-lf-md bg-lf-accent px-3 text-sm font-medium text-lf-on-accent"
                    >
                      {row.actionLabel}
                    </Link>
                  ) : null}
                </div>
              </OperationalRow>
            );
          })}
        </div>

        {hidden > 0 && (
          <button
            type="button"
            onClick={() => setShowAll(true)}
            className="lf-touch inline-flex items-center self-start text-sm font-medium text-lf-accent"
          >
            Show all
          </button>
        )}

        <section className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-lf-ink">What I issued today</h2>
          {myIssues.length === 0 ? (
            <p className="text-sm text-lf-ink-2">No issues recorded under your name today.</p>
          ) : (
            <div className="flex flex-col gap-2 overflow-x-auto">
              {myIssues.map((row) => {
                const when = formatDateTime(row.occurredAt);
                return (
                  <div
                    key={row.id}
                    className="flex flex-col gap-1 rounded-lf-md border border-lf-line bg-lf-surface p-3 min-[640px]:flex-row min-[640px]:items-center min-[640px]:gap-3"
                  >
                    <span className="min-w-0 truncate text-sm font-medium text-lf-ink">
                      {row.itemName}
                      <NotYetSynced show={row.notYetSynced} />
                    </span>
                    <span className="lf-num text-sm text-lf-ink">{row.quantityLabel}</span>
                    <span className="lf-num text-sm text-lf-ink">LOT {row.lotNumber}</span>
                    <span className="min-w-0 truncate text-sm text-lf-ink">{row.destination}</span>
                    <span className="lf-num text-sm text-lf-ink-3">{when.time}</span>
                  </div>
                );
              })}
            </div>
          )}
        </section>

        <p className="text-[11px] text-lf-ink-3">
          Full store filters and specimen custody stay on the store pages linked from each row.
        </p>
      </div>
    </main>
  );
}
