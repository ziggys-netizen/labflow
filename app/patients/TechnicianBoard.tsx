"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import AppNav from "../lib/AppNav";
import { useAuth } from "../lib/AuthContext";
import { useClinicCollection } from "../lib/clinicListen";
import { isOrderForDeletedPatient } from "../lib/patientSoftDelete";
import { patientsByIdFromDocs } from "../lib/patientDisplay";
import { useStaffSession } from "../lib/pinSession";
import { canEnterResults, canRecordSampleCollection } from "../lib/permissions";
import { orderCollectionFromData } from "../lib/sampleCollection";
import { parseRosterEntry, rosterShiftWindow } from "../lib/roster";
import OperationalRow from "../lib/OperationalRow";
import NotYetSynced from "../lib/NotYetSynced";
import {
  attentionSubLabel,
  awaitingSubLabel,
  buildTechWorkItems,
  filterBoardItems,
  formatBoardMetaLine,
  formatGreetingLine,
  greetingFirstName,
  operationalForTechItem,
  orderWorklist,
  releaseWindowForBoard,
  releasedSubLabel,
  stageTimeLabel,
  techRowAction,
  tileCounts,
  visibleWorklist,
  type TechTileId,
} from "../lib/technicianBoard";

const TILES: Array<{
  id: TechTileId;
  label: string;
  stripe: string;
}> = [
  { id: "attention", label: "Needs attention", stripe: "border-lf-crit" },
  { id: "awaiting", label: "Awaiting collection", stripe: "border-lf-warn" },
  { id: "results", label: "Results to enter", stripe: "border-lf-line-strong" },
  { id: "released", label: "Released today", stripe: "border-lf-ok" },
];

export default function TechnicianBoard() {
  const { user, role, clinicId, username } = useAuth();
  const { acting } = useStaffSession();
  const [tile, setTile] = useState<TechTileId | null>(null);
  const [showAll, setShowAll] = useState(false);
  const now = useMemo(() => new Date(), []);

  const canCollect = canRecordSampleCollection(role);
  const canEnter = canEnterResults(role);

  const ordersQuery = useClinicCollection("orders", role, clinicId);
  const patientsQuery = useClinicCollection("patients", role, clinicId);
  const catalogQuery = useClinicCollection("testCatalog", role, clinicId);
  const rosterQuery = useClinicCollection("rosterEntries", role, clinicId);

  const patientsById = useMemo(() => patientsByIdFromDocs(patientsQuery.docs), [patientsQuery.docs]);

  const catalog = useMemo(
    () =>
      catalogQuery.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          code: typeof data.code === "string" ? data.code : "",
          name: typeof data.name === "string" ? data.name : "",
          specimenType: data.specimenType,
          tatMinutes: data.tatMinutes,
        };
      }),
    [catalogQuery.docs]
  );

  const items = useMemo(() => {
    const orders = ordersQuery.docs
      .filter((docSnap) => !isOrderForDeletedPatient(docSnap.data()))
      .map((docSnap) => {
        const data = docSnap.data();
        return {
          ...orderCollectionFromData(docSnap.id, data, docSnap.metadata.hasPendingWrites),
          createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
          reviewedAt: typeof data.reviewedAt === "string" ? data.reviewedAt : null,
          recollectionOfOrderId:
            typeof data.recollectionOfOrderId === "string" ? data.recollectionOfOrderId : null,
          patientId: typeof data.patientId === "string" ? data.patientId : null,
          patientLabId: typeof data.patientLabId === "string" ? data.patientLabId : null,
        };
      });
    return buildTechWorkItems(orders, patientsById, catalog);
  }, [ordersQuery.docs, patientsById, catalog]);

  const shift = useMemo(() => {
    const uid = acting?.uid || user?.uid;
    if (!uid) return null;
    const entries = rosterQuery.docs
      .map((docSnap) => parseRosterEntry(docSnap.id, docSnap.data()))
      .filter((row): row is NonNullable<typeof row> => row != null && row.userUid === uid);
    return rosterShiftWindow(entries, now);
  }, [acting?.uid, user?.uid, rosterQuery.docs, now]);

  const window = releaseWindowForBoard(shift, now);
  const counts = tileCounts(items, now, window);
  const ordered = orderWorklist(filterBoardItems(items, tile, now, window), now);
  const visible = visibleWorklist(ordered, showAll);
  const hidden = ordered.length - visible.length;
  const firstName = greetingFirstName(acting?.displayName, username);
  const sublabels = {
    attention: attentionSubLabel(items, now),
    awaiting: awaitingSubLabel(items, now),
    results: "COLLECTED",
    released: releasedSubLabel(window),
  } as const;

  const loading = ordersQuery.loading || patientsQuery.loading || catalogQuery.loading;

  function selectTile(id: TechTileId) {
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
              itemCount: filterBoardItems(items, null, now, window).length,
              shift,
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
                  "lf-op-stripe flex flex-col gap-2 rounded-lf-md border border-lf-line bg-lf-surface p-3 text-left",
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
          <p className="text-sm text-lf-ink-2">No work in this filter.</p>
        )}

        <div className="flex flex-col gap-3 overflow-x-auto">
          {visible.map((row) => {
            const operational = operationalForTechItem(row, now);
            const action = techRowAction(row, canCollect, canEnter);
            return (
              <OperationalRow
                key={row.id}
                state={operational.state}
                label={operational.label}
                elapsedMinutes={operational.elapsedMinutes}
                className="min-w-[20rem] p-3"
              >
                <div className="flex flex-col gap-2 min-[640px]:flex-row min-[640px]:items-center">
                  <span className="lf-num min-w-0 truncate text-sm text-lf-ink" title={row.labId}>
                    {row.labId}
                  </span>
                  <span className="min-w-0 truncate text-sm font-medium text-lf-ink">
                    {row.patientName}
                    <NotYetSynced show={row.notYetSynced} />
                  </span>
                  <span className="min-w-0 truncate text-sm text-lf-ink">{row.testName}</span>
                  <span className="lf-num text-sm text-lf-ink-3">{stageTimeLabel(row, now)}</span>
                  <Link
                    href={`/orders/${row.orderId}`}
                    className="lf-touch inline-flex items-center justify-center rounded-lf-md bg-lf-accent px-3 text-sm font-medium text-lf-on-accent"
                  >
                    {action.label}
                  </Link>
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
      </div>
    </main>
  );
}
