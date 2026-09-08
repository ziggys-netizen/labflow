"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import AppNav from "../lib/AppNav";
import CatalogReviewBanner from "../lib/CatalogReviewBanner";
import NotYetSynced from "../lib/NotYetSynced";
import OperationalRow from "../lib/OperationalRow";
import { useAuth } from "../lib/AuthContext";
import { useClinicCollection } from "../lib/clinicListen";
import { isOrderForDeletedPatient } from "../lib/patientSoftDelete";
import { useStaffSession } from "../lib/pinSession";
import { mapBatch, mapItem, mapMovement } from "../lib/inventory";
import { parseRosterEntry, parseRosterSession } from "../lib/roster";
import { orderCollectionFromData } from "../lib/sampleCollection";
import {
  formatBoardMetaLine,
  formatGreetingLine,
  greetingFirstName,
} from "../lib/technicianBoard";
import type { LabTest } from "../lib/testCatalog";
import {
  blockedSubLabel,
  buildManagerStages,
  clinicReleaseWindow,
  filterBoardItems,
  medianElapsedTatHours,
  operationalForManagerStage,
  orderWorklist,
  releasedOrdersForTat,
  releasedTatSubLabel,
  reviewSubLabel,
  tileCounts,
  visibleWorklist,
  type ManagerCatalogRow,
  type ManagerPatient,
  type ManagerTileId,
} from "../lib/managerBoard";

const TILES: Array<{ id: ManagerTileId; label: string; stripe: string }> = [
  { id: "blocked", label: "Blocked", stripe: "border-lf-crit" },
  { id: "review", label: "Awaiting review", stripe: "border-lf-warn" },
  { id: "progress", label: "In progress", stripe: "border-lf-line-strong" },
  { id: "released", label: "Released", stripe: "border-lf-ok" },
];

export default function ManagerBoard({ children }: { children?: ReactNode }) {
  const { role, clinicId, username } = useAuth();
  const { acting } = useStaffSession();
  const [tile, setTile] = useState<ManagerTileId | null>(null);
  const [showAll, setShowAll] = useState(false);
  const now = useMemo(() => new Date(), []);

  const ordersQuery = useClinicCollection("orders", role, clinicId);
  const patientsQuery = useClinicCollection("patients", role, clinicId);
  const catalogQuery = useClinicCollection("testCatalog", role, clinicId);
  const rosterQuery = useClinicCollection("rosterEntries", role, clinicId);
  const sessionsQuery = useClinicCollection("rosterSessions", role, clinicId);
  const itemsQuery = useClinicCollection("inventoryItems", role, clinicId);
  const batchesQuery = useClinicCollection("inventoryBatches", role, clinicId);
  const movementsQuery = useClinicCollection("inventoryMovements", role, clinicId);

  const patientsById = useMemo(() => {
    const map = new Map<string, ManagerPatient>();
    for (const docSnap of patientsQuery.docs) {
      map.set(docSnap.id, docSnap.data() as ManagerPatient);
    }
    return map;
  }, [patientsQuery.docs]);

  const catalog = useMemo<ManagerCatalogRow[]>(
    () =>
      catalogQuery.docs.map((docSnap) => {
        const data = docSnap.data() as LabTest;
        return {
          code: typeof data.code === "string" ? data.code : "",
          name: typeof data.name === "string" ? data.name : "",
          specimenType: data.specimenType,
          parameters: data.parameters ?? [],
        };
      }),
    [catalogQuery.docs]
  );

  const orders = useMemo(
    () =>
      ordersQuery.docs
        .filter((docSnap) => !isOrderForDeletedPatient(docSnap.data()))
        .map((docSnap) => {
          const data = docSnap.data();
          return {
            ...orderCollectionFromData(docSnap.id, data, docSnap.metadata.hasPendingWrites),
            createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
            reviewedAt: typeof data.reviewedAt === "string" ? data.reviewedAt : null,
            resultsEnteredAt: typeof data.resultsEnteredAt === "string" ? data.resultsEnteredAt : null,
            results: (data.results as Record<string, Record<string, string>>) || null,
            pendingAmendment: data.pendingAmendment,
            patientId: typeof data.patientId === "string" ? data.patientId : null,
            patientLabId: typeof data.patientLabId === "string" ? data.patientLabId : null,
            patientSex: typeof data.patientSex === "string" ? data.patientSex : null,
          };
        }),
    [ordersQuery.docs]
  );

  const items = useMemo(() => itemsQuery.docs.map(mapItem), [itemsQuery.docs]);
  const batches = useMemo(() => batchesQuery.docs.map(mapBatch), [batchesQuery.docs]);
  const movements = useMemo(() => movementsQuery.docs.map(mapMovement), [movementsQuery.docs]);
  const rosterEntries = useMemo(
    () =>
      rosterQuery.docs
        .map((docSnap) => parseRosterEntry(docSnap.id, docSnap.data()))
        .filter((row): row is NonNullable<typeof row> => row != null),
    [rosterQuery.docs]
  );
  const sessions = useMemo(
    () =>
      sessionsQuery.docs
        .map((docSnap) => parseRosterSession(docSnap.id, docSnap.data() as Record<string, unknown>))
        .filter((row): row is NonNullable<typeof row> => row != null),
    [sessionsQuery.docs]
  );

  const window = useMemo(() => clinicReleaseWindow(rosterEntries, now), [rosterEntries, now]);
  const rows = useMemo(
    () =>
      buildManagerStages({
        orders,
        patientsById,
        catalog,
        items,
        batches,
        movements,
        sessions,
        window,
        now,
      }),
    [orders, patientsById, catalog, items, batches, movements, sessions, window, now]
  );

  const counts = tileCounts(rows);
  const ordered = orderWorklist(filterBoardItems(rows, tile));
  const visible = visibleWorklist(ordered, showAll);
  const hidden = ordered.length - visible.length;
  const firstName = greetingFirstName(acting?.displayName, username);
  const medianHours = medianElapsedTatHours(releasedOrdersForTat(orders, window));
  const sublabels = {
    blocked: blockedSubLabel(rows),
    review: reviewSubLabel(rows),
    progress: "ON BENCH",
    released: releasedTatSubLabel(medianHours, window),
  } as const;

  const loading =
    ordersQuery.loading ||
    patientsQuery.loading ||
    catalogQuery.loading ||
    rosterQuery.loading ||
    sessionsQuery.loading ||
    itemsQuery.loading ||
    batchesQuery.loading ||
    movementsQuery.loading;

  function selectTile(id: ManagerTileId) {
    setTile((current) => (current === id ? null : id));
    setShowAll(false);
  }

  return (
    <main className="min-h-screen bg-lf-ground">
      <AppNav />
      <CatalogReviewBanner />
      <div className="lf-shell flex flex-col gap-6 py-8">
        <header className="flex flex-col gap-1">
          <h1 className="text-[19px] font-semibold text-lf-ink">{formatGreetingLine(now, firstName)}</h1>
          <p className="lf-num text-lf-ink-3">
            {formatBoardMetaLine({
              now,
              itemCount: filterBoardItems(rows, null).length,
              shift: window.kind === "shift" ? { startTime: formatHm(window.start), endTime: formatHm(window.end) } : null,
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
          <p className="text-sm text-lf-ink-2">No stages in this filter.</p>
        )}

        <div className="flex flex-col gap-3 overflow-x-auto">
          {visible.map((row) => {
            const operational = operationalForManagerStage(row);
            return (
              <OperationalRow
                key={row.id}
                state={operational.state}
                label={operational.label}
                elapsedMinutes={operational.elapsedMinutes}
                className="min-w-[20rem] p-3"
              >
                <div className="flex flex-col gap-2 min-[640px]:flex-row min-[640px]:items-center">
                  {row.labId ? (
                    <span className="lf-num min-w-0 truncate text-sm text-lf-ink" title={row.labId}>
                      {row.labId}
                    </span>
                  ) : null}
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

        {children}
      </div>
    </main>
  );
}

function formatHm(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}
