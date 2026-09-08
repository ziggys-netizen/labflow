"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAuth } from "../lib/AuthContext";
import { useClinicCollection } from "../lib/clinicListen";
import {
  DASHBOARD_QUEUE_PANEL_LIMIT,
  DASHBOARD_QUEUE_TILES,
  countAllDashboardQueues,
  dashboardQueueAllHref,
  dashboardQueueTile,
  filterDashboardQueue,
  formatDashboardQueueTestLabel,
  parseDashboardQueueSlug,
  type DashboardQueueOrder,
  type DashboardQueueSlug,
} from "../lib/dashboardQueue";
import IconButton from "../lib/IconButton";
import { ICON_ACTION_LABELS } from "../lib/iconAction";
import {
  canAmendResult,
  canApproveResults,
  canEnterResults,
  canOrderTests,
  canRecordSampleCollection,
} from "../lib/permissions";
import { isOrderForDeletedPatient, isPatientDeleted } from "../lib/patientSoftDelete";
import { patientDisplayName } from "../lib/patientDisplay";
import { patientHistoryHref } from "../lib/patientHistory";
import {
  canPerformPrimaryAction,
  formatSexAge,
  patientListChip,
  patientPrimaryAction,
  patientRecordHref,
  primaryActionHref,
  type PatientListOrder,
} from "../lib/patientList";
import { parseAgeYears } from "../lib/resultFlag";
import { isReleasedResultStatus } from "../lib/resultAmendment";
import { orderCollectionFromData } from "../lib/sampleCollection";
import type { LabTest } from "../lib/testCatalog";
import {
  PatientListMobileCard,
  PatientListTableHeader,
  PatientListTableRow,
  type PatientListRowData,
} from "../patients/PatientListRow";

type QueuePatient = {
  id: string;
  labId: string;
  name: string;
  preferredName: string;
  sex: string;
  dob: string;
  ageYears: number | null;
  ageMonths: number | null;
};

function parseAgeMonths(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const months = Number(value.trim());
    return Number.isFinite(months) ? months : null;
  }
  return null;
}

function toPatientListOrder(order: DashboardQueueOrder): PatientListOrder {
  return {
    id: order.id,
    status: order.status,
    tests: order.tests || [],
    sampleCollectedAt: order.sampleCollectedAt ?? null,
    sampleCollectedSource: order.sampleCollectedSource ?? null,
    sampleCollections: order.sampleCollections ?? null,
    createdAt: order.createdAt ?? null,
    resultsEnteredAt: order.resultsEnteredAt ?? null,
    reviewedAt: order.reviewedAt ?? null,
    lastAmendedAt: order.lastAmendedAt ?? null,
    recollectionOfOrderId: order.recollectionOfOrderId ?? null,
    notYetSynced: order.notYetSynced,
  };
}

function orderForList(
  id: string,
  data: Record<string, unknown>,
  notYetSynced?: boolean
): PatientListOrder & DashboardQueueOrder {
  const parsed = orderCollectionFromData(id, data, notYetSynced);
  return {
    ...parsed,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
    resultsEnteredAt: typeof data.resultsEnteredAt === "string" ? data.resultsEnteredAt : null,
    reviewedAt: typeof data.reviewedAt === "string" ? data.reviewedAt : null,
    lastAmendedAt: typeof data.lastAmendedAt === "string" ? data.lastAmendedAt : null,
    recollectionOfOrderId:
      typeof data.recollectionOfOrderId === "string" ? data.recollectionOfOrderId : null,
    needsFinalReprint: data.needsFinalReprint === true,
    provisionalPrintedAt:
      typeof data.provisionalPrintedAt === "string" ? data.provisionalPrintedAt : null,
    criticalNotification: data.criticalNotification,
    results: (data.results as Record<string, Record<string, string>>) || null,
    patientId: typeof data.patientId === "string" ? data.patientId : null,
    patientLabId: typeof data.patientLabId === "string" ? data.patientLabId : null,
    patientSex: typeof data.patientSex === "string" ? data.patientSex : null,
  };
}

function MoreMenu({
  open,
  onToggle,
  onClose,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative shrink-0">
      <IconButton
        label={ICON_ACTION_LABELS.more}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <span aria-hidden="true">⋯</span>
      </IconButton>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[10rem] rounded-lf-md border border-lf-line bg-lf-surface py-1 shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  );
}

function menuItemClass() {
  return "lf-touch flex w-full items-center px-3 text-left text-sm text-lf-ink hover:bg-lf-surface-2";
}

function primaryDisabledTitle(
  kind: ReturnType<typeof patientPrimaryAction>["kind"],
  canAct: boolean
) {
  if (canAct) return undefined;
  if (kind === "order") return "Your role cannot order tests";
  if (kind === "collect") {
    return "Only a technician, laboratory lead, or owner can record sample collection";
  }
  if (kind === "enter") return "Your role cannot enter results";
  if (kind === "review") return "Your role cannot review results";
  return undefined;
}

export function CurrentQueueList({
  rows,
  patientsById,
  emptyLabel = "Nothing pending",
}: {
  rows: Array<
    DashboardQueueOrder & {
      waitStartedAt: string | null;
      timeInState: string;
    }
  >;
  patientsById: Map<string, QueuePatient>;
  emptyLabel?: string;
}) {
  const router = useRouter();
  const { role } = useAuth();
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
  const canOrder = canOrderTests(role);
  const canCollect = canRecordSampleCollection(role);
  const canEnter = canEnterResults(role);
  const canReview = canApproveResults(role);
  const canAmend = canAmendResult(role);

  if (rows.length === 0) {
    return <p className="text-sm text-lf-ink-2">{emptyLabel}</p>;
  }

  function rowData(
    order: DashboardQueueOrder & { timeInState: string }
  ): { patientId: string; data: PatientListRowData; listOrders: PatientListOrder[] } {
    const patientId = order.patientId || "";
    const patient = patientsById.get(patientId);
    if (!patient) {
      return {
        patientId: patientId || order.id,
        listOrders: [toPatientListOrder(order)],
        data: {
          id: patientId || order.id,
          labId: order.patientLabId || "—",
          displayName: "Unknown patient",
          sexAge: formatSexAge({ sex: order.patientSex }),
          chip: patientListChip([toPatientListOrder(order)]),
          notYetSynced: order.notYetSynced,
          testLabel: formatDashboardQueueTestLabel(order.tests),
          timeInState: order.timeInState,
        },
      };
    }
    const listOrders = [toPatientListOrder(order)];
    return {
      patientId: patient.id,
      listOrders,
      data: {
        id: patient.id,
        labId: patient.labId,
        displayName: patientDisplayName(patient) || patient.name,
        sexAge: formatSexAge(patient),
        chip: patientListChip(listOrders),
        notYetSynced: order.notYetSynced,
        testLabel: formatDashboardQueueTestLabel(order.tests),
        timeInState: order.timeInState,
      },
    };
  }

  function renderPrimary(order: DashboardQueueOrder, listOrders: PatientListOrder[], patientId: string) {
    const action = patientPrimaryAction(listOrders);
    const canAct = canPerformPrimaryAction(action.kind, {
      canOrder,
      canCollect,
      canEnter,
      canReview,
    });
    const href = primaryActionHref(patientId, action);
    const title = primaryDisabledTitle(action.kind, canAct);
    const className =
      "lf-touch inline-flex w-full items-center justify-center rounded-lf-md bg-lf-accent px-3 text-sm font-medium text-lf-on-accent disabled:opacity-50 sm:w-auto";

    if (!href || !canAct) {
      return (
        <button type="button" disabled title={title} className={className} onClick={(e) => e.stopPropagation()}>
          {action.label}
        </button>
      );
    }

    return (
      <Link href={href} title={title} onClick={(e) => e.stopPropagation()} className={className}>
        {action.label}
      </Link>
    );
  }

  function renderExtras(order: DashboardQueueOrder, listOrders: PatientListOrder[], patientId: string) {
    const released = isReleasedResultStatus(order.status) ? order : null;
    const items: ReactNode[] = [];
    if (released) {
      items.push(
        <Link
          key="print"
          role="menuitem"
          href={`/patients/${patientId}/print`}
          className={menuItemClass()}
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId(null);
          }}
        >
          {ICON_ACTION_LABELS.print}
        </Link>
      );
    }
    if (canReview) {
      items.push(
        <Link
          key="history"
          role="menuitem"
          href={patientHistoryHref(patientId)}
          className={menuItemClass()}
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId(null);
          }}
        >
          {ICON_ACTION_LABELS.history}
        </Link>
      );
    }
    if (canAmend && released) {
      items.push(
        <Link
          key="amend"
          role="menuitem"
          href={`/orders/${released.id}`}
          className={menuItemClass()}
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId(null);
          }}
        >
          Amend
        </Link>
      );
    }

    return (
      <MoreMenu
        open={openMenuId === order.id}
        onToggle={() => setOpenMenuId((id) => (id === order.id ? null : order.id))}
        onClose={() => setOpenMenuId(null)}
      >
        {items.length > 0 ? (
          items
        ) : (
          <span className="block px-3 py-2 text-sm text-lf-ink-3">No further actions</span>
        )}
      </MoreMenu>
    );
  }

  const prepared = rows.map((order) => {
    const built = rowData(order);
    return { order, ...built };
  });

  return (
    <>
      <ul className="flex flex-col gap-3 sm:hidden">
        {prepared.map(({ order, data, listOrders, patientId }) => (
          <PatientListMobileCard
            key={order.id}
            mode="queue"
            row={data}
            primary={renderPrimary(order, listOrders, patientId)}
            extras={renderExtras(order, listOrders, patientId)}
          />
        ))}
      </ul>
      <div className="hidden min-w-0 overflow-x-auto sm:block">
        <table className="w-full min-w-0 border-collapse text-left text-sm">
          <PatientListTableHeader mode="queue" />
          <tbody>
            {prepared.map(({ order, data, listOrders, patientId }) => (
              <PatientListTableRow
                key={order.id}
                mode="queue"
                row={data}
                primary={renderPrimary(order, listOrders, patientId)}
                extras={renderExtras(order, listOrders, patientId)}
                onActivate={() => router.push(patientRecordHref(patientId))}
              />
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

export default function CurrentQueue({ className = "" }: { className?: string }) {
  const { role, clinicId } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const openSlug = parseDashboardQueueSlug(searchParams.get("queue"));
  const nowMs = useMemo(() => Date.now(), []);

  const ordersQuery = useClinicCollection("orders", role, clinicId);
  const patientsQuery = useClinicCollection("patients", role, clinicId);
  const catalogQuery = useClinicCollection("testCatalog", role, clinicId);

  const catalog = useMemo(
    () => catalogQuery.docs.map((docSnap) => docSnap.data() as LabTest),
    [catalogQuery.docs]
  );

  const orders = useMemo(
    () =>
      ordersQuery.docs
        .filter((docSnap) => !isOrderForDeletedPatient(docSnap.data()))
        .map((docSnap) => orderForList(docSnap.id, docSnap.data(), docSnap.metadata.hasPendingWrites)),
    [ordersQuery.docs]
  );

  const patientsById = useMemo(() => {
    const map = new Map<string, QueuePatient>();
    for (const docSnap of patientsQuery.docs) {
      if (isPatientDeleted(docSnap.data())) continue;
      const data = docSnap.data();
      map.set(docSnap.id, {
        id: docSnap.id,
        labId: typeof data.labId === "string" && data.labId ? data.labId : "—",
        name: typeof data.name === "string" && data.name ? data.name : "—",
        preferredName: typeof data.preferredName === "string" ? data.preferredName : "",
        sex: typeof data.sex === "string" ? data.sex : "",
        dob: typeof data.dob === "string" ? data.dob : "",
        ageYears: parseAgeYears(data.ageYears),
        ageMonths: parseAgeMonths(data.ageMonths),
      });
    }
    return map;
  }, [patientsQuery.docs]);

  const counts = useMemo(() => countAllDashboardQueues(orders, catalog), [orders, catalog]);

  const openRows = useMemo(() => {
    if (!openSlug) return [];
    return filterDashboardQueue(orders, openSlug, catalog, nowMs);
  }, [openSlug, orders, catalog, nowMs]);

  const panelRows = openRows.slice(0, DASHBOARD_QUEUE_PANEL_LIMIT);
  const openCount = openSlug ? counts[openSlug] : 0;

  function setQueue(slug: DashboardQueueSlug | null) {
    const params = new URLSearchParams(searchParams.toString());
    if (slug) params.set("queue", slug);
    else params.delete("queue");
    const query = params.toString();
    router.replace(query ? `${pathname}?${query}` : pathname, { scroll: false });
  }

  function onTileClick(slug: DashboardQueueSlug, count: number) {
    if (openSlug === slug) {
      setQueue(null);
      return;
    }
    if (count <= 0) return;
    setQueue(slug);
  }

  const loading = ordersQuery.loading || patientsQuery.loading || catalogQuery.loading;

  return (
    <section className={className}>
      <h2 className="mb-3 text-sm font-medium text-lf-ink">Current queue</h2>
      <p className="mb-3 text-sm text-lf-ink-3">
        Live counts across all open work, not limited to the selected period.
      </p>
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3">
        {DASHBOARD_QUEUE_TILES.map((tile) => {
          const count = counts[tile.slug];
          const selected = openSlug === tile.slug;
          const clickable = count > 0;
          return (
            <button
              key={tile.slug}
              type="button"
              aria-pressed={selected}
              aria-disabled={!clickable}
              disabled={!clickable && !selected}
              onClick={() => onTileClick(tile.slug, count)}
              className={[
                "rounded-lf-md border border-lf-line bg-lf-surface p-4 text-left",
                clickable || selected ? "cursor-pointer" : "cursor-default",
                selected ? "ring-1 ring-lf-accent" : "",
              ]
                .filter(Boolean)
                .join(" ")}
            >
              <p className="text-sm text-lf-ink-2">{tile.label}</p>
              <p className="lf-num mt-1 text-2xl font-semibold text-lf-ink">
                {loading ? "…" : String(count)}
              </p>
              <p className="mt-1 text-xs text-lf-ink-3">{tile.hint}</p>
            </button>
          );
        })}
      </div>

      {openSlug ? (
        <div className="mt-4 rounded-lf-md border border-lf-line bg-lf-surface p-4">
          <div className="mb-3 flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-sm font-medium text-lf-ink">{dashboardQueueTile(openSlug).label}</h3>
              <p className="text-sm text-lf-ink-3">{dashboardQueueTile(openSlug).hint}</p>
            </div>
            <button
              type="button"
              onClick={() => setQueue(null)}
              className="lf-touch inline-flex items-center rounded-lf-md border border-lf-line px-3 text-sm font-medium text-lf-ink-2 hover:bg-lf-surface-2"
            >
              Close
            </button>
          </div>
          {loading ? (
            <p className="text-sm text-lf-ink-2">Loading…</p>
          ) : (
            <CurrentQueueList rows={panelRows} patientsById={patientsById} />
          )}
          {!loading && openCount > DASHBOARD_QUEUE_PANEL_LIMIT ? (
            <Link
              href={dashboardQueueAllHref(openSlug)}
              className="lf-touch mt-4 inline-flex items-center text-sm font-medium text-lf-accent"
            >
              Show all {openCount}
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
