/**
 * Read-only / print assembly only.
 * Do not edit, amend, delete, or change status from this page.
 */
"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  where,
  type DocumentReference,
  type Query,
} from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuth } from "../../../lib/AuthContext";
import ProtectedRoute from "../../../lib/ProtectedRoute";
import AppNav from "../../../lib/AppNav";
import { clinicCollectionQuery, isOwner } from "../../../lib/clinicScope";
import { isPatientDeleted } from "../../../lib/patientSoftDelete";
import { LabTest } from "../../../lib/testCatalog";
import {
  isProvisionalPrint,
  planReportPrint,
  PRINT_DISCLOSURE_ACTION,
  PROVISIONAL_HEADING,
  PROVISIONAL_NOTICE,
} from "../../../lib/provisionalReport";
import { canApproveResults } from "../../../lib/permissions";
import ClinicalFlagLetter from "../../../lib/ClinicalFlagLetter";
import { orderCollectionFromData } from "../../../lib/sampleCollection";
import { useStaffSession, useWriteIdentity } from "../../../lib/pinSession";
import { SensitivePinPrompt } from "../../../lib/PinGate";
import { trackedSetDoc, writeActorFromUser } from "../../../lib/trackedWrites";
import { actorFromAuth, auditTargetLabel, safeLogAudit } from "../../../lib/audit";
import { isReleasedResultStatus } from "../../../lib/resultAmendment";
import { parameterFlag, parseAgeYears } from "../../../lib/resultFlag";
import { patientDisplayName } from "../../../lib/patientDisplay";
import { formatSexAge } from "../../../lib/patientList";
import { formatHeaderName } from "../../../lib/headerIdentity";
import {
  CUMULATIVE_ALIGNMENT_NOTE,
  HISTORY_CUMULATIVE_ROWS_PER_PAGE,
  HISTORY_READONLY_NOTE,
  HISTORY_VISIT_PARAMS_PER_PAGE,
  allHistoryOrderIds,
  formatHistoryPageLine,
  formatHistoryReleaser,
  historyCumulativeColumns,
  historyCumulativeRows,
  historyDateRangeLabel,
  historyDisclosureDetail,
  historyHasUnsynced,
  historyPrintPages,
  historyVisitParameters,
  historyVisitRows,
  paginateByWeight,
  resolvePrintOrders,
  toggleSelectedId,
  type HistoryLayout,
  type HistoryOrderInput,
  type HistoryPrintMode,
} from "../../../lib/patientHistory";

interface PatientRecord {
  clinicId?: string;
  createdByUid?: string;
  labId?: string;
  name?: string;
  preferredName?: string | null;
  sex?: string;
  dob?: string | null;
  ageYears?: number | null;
  ageMonths?: number | null;
}

interface ClinicRecord {
  name?: string;
  address?: string;
}

const PRINT_CSS = `
  @page { size: A4; margin: 14mm 12mm 16mm 12mm; }
  @page {
    @bottom-center { content: "Page " counter(page) " of " counter(pages); }
  }
  @media screen {
    .print-sheet { display: none !important; }
  }
  @media print {
    .no-print { display: none !important; }
    body { background: #fff; }
    .print-sheet { display: block !important; box-shadow: none !important; border: 0 !important; margin: 0 !important; padding: 0 !important; width: auto !important; }
    .print-page { break-after: page; page-break-after: always; }
    .print-page:last-child { break-after: auto; page-break-after: auto; }
    .avoid-break { break-inside: avoid; }
  }
`;

async function docFromCacheOrServer(ref: DocumentReference) {
  try {
    return await getDocFromCache(ref);
  } catch {
    return getDoc(ref);
  }
}

async function docsFromCacheOrServer(q: Query) {
  try {
    const cached = await getDocsFromCache(q);
    if (!cached.empty) return cached;
  } catch {
    // No matching cache — fall through to the live query.
  }
  return getDocs(q);
}

function HistoryPrintChrome({
  clinic,
  patient,
  sexAge,
  dateRange,
  printedBy,
  printedAt,
  page,
  of,
  provisional,
}: {
  clinic: ClinicRecord | null;
  patient: PatientRecord;
  sexAge: string;
  dateRange: string;
  printedBy: string;
  printedAt: string;
  page: number;
  of: number;
  provisional: boolean;
}) {
  const name = patientDisplayName(patient) || patient.name || "—";
  return (
    <header className="border-b border-gray-300 pb-3 mb-4">
      {provisional && (
        <div className="mb-3 border-2 border-amber-700 bg-amber-50 px-3 py-2">
          <p className="text-sm font-semibold tracking-wide text-amber-950">{PROVISIONAL_HEADING}</p>
          <p className="text-xs text-amber-900 mt-1">{PROVISIONAL_NOTICE}</p>
        </div>
      )}
      <p className="text-sm font-semibold text-gray-900">{clinic?.name || "Clinic"}</p>
      {clinic?.address && <p className="text-xs text-gray-600">{clinic.address}</p>}
      <p className="text-xs text-gray-700 mt-2">
        {name} · Lab ID {patient.labId || "—"} · {sexAge}
      </p>
      <p className="text-xs text-gray-600">Date range {dateRange}</p>
      <p className="text-xs text-gray-600">
        Printed {printedAt} by {printedBy}
      </p>
      <p className="text-xs text-gray-500 mt-1">{formatHistoryPageLine(page, of)}</p>
    </header>
  );
}

function PatientHistoryContent() {
  const params = useParams<{ patientId: string }>();
  const patientId = params.patientId;
  const { user, role, clinicId } = useAuth();
  const writer = useWriteIdentity();
  const { locked, needsSetup, ready } = useStaffSession();
  const staffGateOpen = !ready || locked || needsSetup;

  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [clinic, setClinic] = useState<ClinicRecord | null>(null);
  const [orders, setOrders] = useState<HistoryOrderInput[]>([]);
  const [catalog, setCatalog] = useState<LabTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [view, setView] = useState<HistoryLayout>("visit");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [printLayout, setPrintLayout] = useState<HistoryLayout>("visit");
  const [pinFor, setPinFor] = useState<HistoryPrintMode | null>(null);
  const [printJob, setPrintJob] = useState<{
    layout: HistoryLayout;
    orders: HistoryOrderInput[];
    printedAt: string;
  } | null>(null);
  const printed = useRef(false);

  useEffect(() => {
    async function load() {
      try {
        const patientSnap = await docFromCacheOrServer(doc(db, "patients", patientId));
        if (!patientSnap.exists()) {
          setNotFound(true);
          return;
        }
        const data = patientSnap.data() as PatientRecord & { deleted?: boolean };
        if (isPatientDeleted(data)) {
          setNotFound(true);
          return;
        }
        if (!isOwner(role) && clinicId && data.clinicId && data.clinicId !== clinicId) {
          setNotFound(true);
          return;
        }
        setPatient(data);

        const [clinicSnap, orderSnap, catalogSnap] = await Promise.all([
          data.clinicId ? docFromCacheOrServer(doc(db, "clinics", data.clinicId)) : Promise.resolve(null),
          docsFromCacheOrServer(
            clinicCollectionQuery("orders", role, clinicId, [where("patientId", "==", patientId)])
          ),
          docsFromCacheOrServer(clinicCollectionQuery("testCatalog", role, clinicId)),
        ]);

        if (clinicSnap?.exists()) setClinic(clinicSnap.data() as ClinicRecord);

        const loaded = orderSnap.docs
          .map((d) => {
            const o = d.data();
            const parsed = orderCollectionFromData(d.id, o);
            return {
              id: parsed.id,
              tests: parsed.tests,
              status: parsed.status,
              createdAt: typeof o.createdAt === "string" ? o.createdAt : "",
              results: o.results || {},
              reviewedBy: typeof o.reviewedBy === "string" ? o.reviewedBy : null,
              reviewedAt: typeof o.reviewedAt === "string" ? o.reviewedAt : null,
              resultVersions: o.resultVersions,
              lastAmendedAt: typeof o.lastAmendedAt === "string" ? o.lastAmendedAt : null,
              lastAmendedBy: typeof o.lastAmendedBy === "string" ? o.lastAmendedBy : null,
              currentResultVersion:
                typeof o.currentResultVersion === "number" ? o.currentResultVersion : null,
              notYetSynced: d.metadata.hasPendingWrites,
            } satisfies HistoryOrderInput;
          })
          .filter((order) => isReleasedResultStatus(order.status));
        setOrders(loaded);
        setSelectedIds(allHistoryOrderIds(loaded));

        const catalogRows = catalogSnap.docs.map((d) => d.data() as LabTest);
        setCatalog(
          data.clinicId
            ? catalogRows.filter((t) => !t.clinicId || t.clinicId === data.clinicId)
            : catalogRows
        );
      } catch (err) {
        console.error(err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [patientId, role, clinicId]);

  const visits = useMemo(() => historyVisitRows(orders), [orders]);
  const cumulativeColumns = useMemo(() => historyCumulativeColumns(orders), [orders]);
  const cumulativeRows = useMemo(() => historyCumulativeRows(orders, catalog), [orders, catalog]);
  const unsynced = historyHasUnsynced(orders);
  const sexAge = patient ? formatSexAge(patient) : "—";
  const displayName = patientDisplayName(patient) || patient?.name || "Patient";
  const flagCtx = {
    sex: patient?.sex,
    dob: patient?.dob,
    ageYears: parseAgeYears(patient?.ageYears),
  };
  const printedBy =
    formatHeaderName(writer.username, writer.username) !== "SET USERNAME"
      ? formatHeaderName(writer.username, writer.username)
      : formatHistoryReleaser(writer.email);

  useEffect(() => {
    if (!printJob || staffGateOpen || !patient) return;
    if (printed.current) return;
    const timer = window.setTimeout(() => {
      if (printed.current) return;
      printed.current = true;
      const plan = planReportPrint(printJob.orders);
      const actor = writeActorFromUser(
        user ? { uid: writer.uid, email: writer.email } : null,
        writer.username
      );
      const auditActor = actorFromAuth(
        user ? { uid: writer.uid, email: writer.email } : null,
        writer.role,
        writer.shift
      );
      const provisional = printJob.orders.filter((order) =>
        plan.provisionalOrderIds.includes(order.id)
      );
      for (const order of provisional) {
        void trackedSetDoc(
          doc(db, "orders", order.id),
          {
            needsFinalReprint: true,
            provisionalPrintedAt: new Date().toISOString(),
          },
          { merge: true },
          {
            summary: `Provisional history printed for ${patient.labId || patientId}`,
            actorUid: actor.actorUid,
            actorLabel: actor.actorLabel,
            clinicId: patient.clinicId,
            patientLabId: patient.labId,
            orderId: order.id,
          }
        );
      }
      if (auditActor && plan.allowPrint) {
        const detail = historyDisclosureDetail({
          labId: patient.labId,
          orders: printJob.orders,
          layout: printJob.layout,
        });
        safeLogAudit({
          clinicId: patient.clinicId || clinicId,
          actor: auditActor,
          action: PRINT_DISCLOSURE_ACTION,
          targetCollection: "patients",
          targetId: patientId,
          targetLabel: auditTargetLabel(patient.labId, "history"),
          detail,
        });
        if (provisional.length > 0) {
          safeLogAudit({
            clinicId: patient.clinicId || clinicId,
            actor: auditActor,
            action: "order.provisionalPrinted",
            targetCollection: "orders",
            targetId: provisional[0].id,
            targetLabel: auditTargetLabel(patient.labId, "history"),
            detail: { orderIds: provisional.map((row) => row.id), labIds: detail.labIds },
          });
        }
      }
      window.print();
    }, 300);
    return () => window.clearTimeout(timer);
  }, [
    printJob,
    staffGateOpen,
    patient,
    user,
    writer.uid,
    writer.email,
    writer.username,
    writer.role,
    writer.shift,
    clinicId,
    patientId,
  ]);

  function requestPrint(mode: HistoryPrintMode) {
    const chosen = resolvePrintOrders(orders, selectedIds, mode);
    if (chosen.length === 0) return;
    setPinFor(mode);
  }

  function confirmPrint() {
    const mode = pinFor;
    setPinFor(null);
    if (!mode) return;
    const chosen = resolvePrintOrders(orders, selectedIds, mode);
    if (chosen.length === 0) return;
    printed.current = false;
    setPrintJob({
      layout: printLayout,
      orders: chosen,
      printedAt: new Date().toLocaleString(),
    });
  }

  const printVisits = printJob ? historyVisitRows(printJob.orders) : [];
  const printVisitPages = historyPrintPages(
    paginateByWeight(
      printVisits,
      (visit) => Math.max(2, historyVisitParameters(visit, catalog).length),
      HISTORY_VISIT_PARAMS_PER_PAGE
    )
  );
  const printCumColumns = printJob ? historyCumulativeColumns(printJob.orders) : [];
  const printCumRows = printJob ? historyCumulativeRows(printJob.orders, catalog) : [];
  const printCumPages = historyPrintPages(
    paginateByWeight(printCumRows, () => 1, HISTORY_CUMULATIVE_ROWS_PER_PAGE)
  );
  const printRange = printJob ? historyDateRangeLabel(printJob.orders) : "—";
  const printProvisional = printJob
    ? printJob.orders.some((order) =>
        isProvisionalPrint({
          released: isReleasedResultStatus(order.status),
          locallyConfirmed: true,
          synced: !order.notYetSynced,
        })
      )
    : false;

  if (loading) {
    return (
      <main className="min-h-screen bg-lf-ground">
        <div className="no-print">
          <AppNav />
        </div>
        <p className="lf-shell py-8 text-lf-ink-2">Loading history...</p>
      </main>
    );
  }

  if (notFound || !patient) {
    return (
      <main className="min-h-screen bg-lf-ground">
        <div className="no-print">
          <AppNav />
        </div>
        <div className="lf-shell flex flex-col gap-4 py-8">
          <p className="text-lf-ink-2">Patient record not found.</p>
          <Link href="/patients" className="lf-touch inline-flex items-center text-sm text-lf-accent">
            Back to patients
          </Link>
        </div>
      </main>
    );
  }

  const allIds = allHistoryOrderIds(orders);
  const allSelected = allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));

  return (
    <main className="min-h-screen bg-lf-ground print:bg-white">
      <style>{PRINT_CSS}</style>
      <div className="no-print">
        <AppNav />
        <div className="lf-shell flex flex-col gap-6 py-8">
          <Link
            href={`/patients/${patientId}`}
            className="lf-touch inline-flex items-center text-sm text-lf-accent"
          >
            Back to patient
          </Link>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex min-w-0 flex-col gap-2">
              <p className="lf-num text-sm text-lf-ink-2">{patient.labId || "—"}</p>
              <h1 className="text-2xl font-semibold text-lf-ink">History</h1>
              <p className="text-sm text-lf-ink-2">
                {displayName} · {sexAge}
              </p>
              <p className="text-xs text-lf-ink-3">{HISTORY_READONLY_NOTE}</p>
            </div>
          </div>

          {unsynced && (
            <div className="rounded-lf-md border-2 border-lf-warn bg-lf-warn-soft px-3 py-2">
              <p className="text-sm font-medium text-lf-ink">{PROVISIONAL_HEADING}</p>
              <p className="text-sm text-lf-ink-2">
                Unsynced orders are included. A printed copy is provisional until those writes
                confirm.
              </p>
            </div>
          )}

          {visits.length === 0 ? (
            <p className="text-sm text-lf-ink-2">No released results for this patient.</p>
          ) : (
            <>
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex flex-wrap gap-2" role="tablist" aria-label="History view">
                  <button
                    type="button"
                    role="tab"
                    aria-selected={view === "visit"}
                    className={`lf-touch inline-flex items-center justify-center rounded-lf-md px-3 text-sm font-medium ${
                      view === "visit"
                        ? "bg-lf-accent text-lf-on-accent"
                        : "border border-lf-line bg-lf-surface text-lf-ink"
                    }`}
                    onClick={() => setView("visit")}
                  >
                    By visit
                  </button>
                  <button
                    type="button"
                    role="tab"
                    aria-selected={view === "cumulative"}
                    className={`lf-touch inline-flex items-center justify-center rounded-lf-md px-3 text-sm font-medium ${
                      view === "cumulative"
                        ? "bg-lf-accent text-lf-on-accent"
                        : "border border-lf-line bg-lf-surface text-lf-ink"
                    }`}
                    onClick={() => setView("cumulative")}
                  >
                    Cumulative
                  </button>
                </div>
              </div>

              {view === "visit" ? (
                <div className="flex flex-col gap-2">
                  <label className="lf-touch inline-flex items-center gap-2 text-sm text-lf-ink">
                    <input
                      type="checkbox"
                      checked={allSelected}
                      onChange={() => setSelectedIds(allSelected ? [] : allIds)}
                    />
                    Select all
                  </label>
                  <ul className="flex flex-col gap-2">
                    {visits.map((visit) => {
                      const open = expandedId === visit.orderId;
                      const params = open ? historyVisitParameters(visit, catalog) : [];
                      return (
                        <li
                          key={visit.orderId}
                          className="rounded-lf-md border border-lf-line bg-lf-surface"
                        >
                          <div className="flex items-start gap-3 p-3">
                            <label className="lf-touch inline-flex items-center">
                              <span className="sr-only">Select {visit.dateLabel}</span>
                              <input
                                type="checkbox"
                                checked={selectedIds.includes(visit.orderId)}
                                onChange={() =>
                                  setSelectedIds((ids) => toggleSelectedId(ids, visit.orderId))
                                }
                                onClick={(e) => e.stopPropagation()}
                              />
                            </label>
                            <button
                              type="button"
                              className="flex min-w-0 flex-1 flex-col gap-1 text-left sm:grid sm:grid-cols-[7rem_1fr_auto_auto] sm:items-center sm:gap-3"
                              onClick={() => setExpandedId(open ? null : visit.orderId)}
                              aria-expanded={open}
                            >
                              <span className="lf-num text-sm text-lf-ink">{visit.dateLabel}</span>
                              <span className="text-sm text-lf-ink">{visit.testNames}</span>
                              <span className="text-sm text-lf-ink-2">
                                {visit.statusLabel}
                                {visit.amended
                                  ? ` · amended v${visit.version}${
                                      visit.amendmentDateLabel ? ` ${visit.amendmentDateLabel}` : ""
                                    }`
                                  : ""}
                              </span>
                              <span className="text-sm text-lf-ink-2">{visit.releaserLabel}</span>
                            </button>
                          </div>
                          {open && (
                            <div className="border-t border-lf-line px-3 py-3">
                              {params.length === 0 ? (
                                <p className="text-sm text-lf-ink-2">No parameters on this order.</p>
                              ) : (
                                <div className="overflow-x-auto">
                                  <table className="w-full min-w-[20rem] text-left text-sm">
                                    <thead>
                                      <tr className="border-b border-lf-line text-lf-ink-2">
                                        <th className="py-1 pr-3 font-medium">Parameter</th>
                                        <th className="py-1 pr-3 font-medium">Value</th>
                                        <th className="py-1 font-medium">Unit</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {params.map((param) => {
                                        const flag = parameterFlag(
                                          param.value,
                                          param.definition,
                                          flagCtx
                                        );
                                        return (
                                          <tr
                                            key={`${param.testCode}-${param.parameter}`}
                                            className="border-b border-lf-line"
                                          >
                                            <td className="py-1 pr-3 text-lf-ink">
                                              {param.testName} — {param.parameter}
                                            </td>
                                            <td className="py-1 pr-3 text-lf-ink">
                                              <span className="inline-flex items-baseline gap-1">
                                                <span>{param.value || "—"}</span>
                                                {flag ? <ClinicalFlagLetter flag={flag} /> : null}
                                              </span>
                                            </td>
                                            <td className="py-1 text-lf-ink-2">{param.unit}</td>
                                          </tr>
                                        );
                                      })}
                                    </tbody>
                                  </table>
                                </div>
                              )}
                            </div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </div>
              ) : (
                <div className="flex flex-col gap-3">
                  <p className="text-xs text-lf-ink-3">{CUMULATIVE_ALIGNMENT_NOTE}</p>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-max text-left text-sm">
                      <thead>
                        <tr className="border-b border-lf-line">
                          <th className="py-2 pr-3 font-medium text-lf-ink-2">Analyte</th>
                          <th className="py-2 pr-3 font-medium text-lf-ink-2">Unit</th>
                          {cumulativeColumns.map((col) => (
                            <th key={col.orderId} className="lf-num py-2 pr-3 font-medium text-lf-ink-2">
                              {col.dateLabel}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {cumulativeRows.map((row) => (
                          <tr key={row.key} className="border-b border-lf-line">
                            <td className="py-2 pr-3 text-lf-ink">{row.label}</td>
                            <td className="py-2 pr-3 text-lf-ink-2">{row.unit}</td>
                            {cumulativeColumns.map((col) => {
                              const cell = row.values[col.orderId];
                              const definition =
                                catalog
                                  .find((test) => test.code === row.testCode)
                                  ?.parameters.find((param) => param.name === row.parameter) || null;
                              const flag = cell
                                ? parameterFlag(cell.value, definition, flagCtx)
                                : null;
                              return (
                                <td key={col.orderId} className="lf-num py-2 pr-3 text-lf-ink">
                                  {cell ? (
                                    <span className="inline-flex items-baseline gap-1">
                                      <span>{cell.value || "—"}</span>
                                      {flag ? <ClinicalFlagLetter flag={flag} /> : null}
                                      {cell.amended ? (
                                        <span className="text-[10px] uppercase text-lf-warn">amended</span>
                                      ) : null}
                                    </span>
                                  ) : (
                                    "—"
                                  )}
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              <section className="flex flex-col gap-3 rounded-lf-md border border-lf-line bg-lf-surface p-4">
                <h2 className="text-sm font-semibold text-lf-ink">Print</h2>
                <p className="text-xs text-lf-ink-3">
                  Choose the layout at print time. Only released results are included.
                </p>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <label className="lf-touch inline-flex items-center gap-2 text-sm text-lf-ink">
                    <input
                      type="radio"
                      name="print-layout"
                      checked={printLayout === "visit"}
                      onChange={() => setPrintLayout("visit")}
                    />
                    By visit
                  </label>
                  <label className="lf-touch inline-flex items-center gap-2 text-sm text-lf-ink">
                    <input
                      type="radio"
                      name="print-layout"
                      checked={printLayout === "cumulative"}
                      onChange={() => setPrintLayout("cumulative")}
                    />
                    Cumulative
                  </label>
                </div>
                <div className="flex flex-col gap-2 sm:flex-row">
                  <button
                    type="button"
                    disabled={selectedIds.length === 0}
                    onClick={() => requestPrint("selected")}
                    className="lf-touch inline-flex items-center justify-center rounded-lf-md bg-lf-accent px-4 text-sm font-medium text-lf-on-accent disabled:opacity-50"
                  >
                    Print selected
                  </button>
                  <button
                    type="button"
                    onClick={() => requestPrint("all")}
                    className="lf-touch inline-flex items-center justify-center rounded-lf-md border border-lf-line bg-lf-surface px-4 text-sm font-medium text-lf-ink"
                  >
                    Print all
                  </button>
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      {printJob && (
        <div className="print-sheet bg-white mx-auto w-[210mm] p-[12mm]">
          {printJob.layout === "visit"
            ? printVisitPages.map((sheet) => (
                <section key={`visit-${sheet.page}`} className="print-page">
                  <HistoryPrintChrome
                    clinic={clinic}
                    patient={patient}
                    sexAge={sexAge}
                    dateRange={printRange}
                    printedBy={printedBy}
                    printedAt={printJob.printedAt}
                    page={sheet.page}
                    of={sheet.of}
                    provisional={printProvisional}
                  />
                  <div className="flex flex-col gap-4">
                    {sheet.items.map((visit) => {
                      const params = historyVisitParameters(visit, catalog);
                      return (
                        <div key={visit.orderId} className="avoid-break border border-gray-300 p-3">
                          <p className="text-sm font-medium text-gray-900">
                            {visit.dateLabel} · {visit.testNames}
                          </p>
                          <p className="text-xs text-gray-600">
                            Released · {visit.releaserLabel}
                            {visit.amended
                              ? ` · amended v${visit.version}${
                                  visit.amendmentDateLabel ? ` ${visit.amendmentDateLabel}` : ""
                                }`
                              : ""}
                          </p>
                          <table className="mt-2 w-full text-left text-xs">
                            <tbody>
                              {params.map((param) => {
                                const flag = parameterFlag(param.value, param.definition, flagCtx);
                                return (
                                  <tr key={`${visit.orderId}-${param.testCode}-${param.parameter}`}>
                                    <td className="py-0.5 pr-3 text-gray-900">
                                      {param.testName} — {param.parameter}
                                    </td>
                                    <td className="py-0.5 pr-3 text-gray-900">
                                      {param.value || "—"}
                                      {flag ? ` ${flag}` : ""}
                                    </td>
                                    <td className="py-0.5 text-gray-600">{param.unit}</td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        </div>
                      );
                    })}
                  </div>
                  <footer className="mt-6 border-t border-gray-300 pt-2 text-[10px] text-gray-500">
                    {clinic?.name || "Clinic"}
                    {clinic?.address ? ` · ${clinic.address}` : ""} · {displayName} · Lab ID{" "}
                    {patient.labId || "—"} · {sexAge} · {printRange} · Printed {printJob.printedAt} by{" "}
                    {printedBy} · {formatHistoryPageLine(sheet.page, sheet.of)}
                  </footer>
                </section>
              ))
            : printCumPages.map((sheet) => (
                <section key={`cum-${sheet.page}`} className="print-page">
                  <HistoryPrintChrome
                    clinic={clinic}
                    patient={patient}
                    sexAge={sexAge}
                    dateRange={printRange}
                    printedBy={printedBy}
                    printedAt={printJob.printedAt}
                    page={sheet.page}
                    of={sheet.of}
                    provisional={printProvisional}
                  />
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-gray-300">
                        <th className="py-1 pr-2 font-medium">Analyte</th>
                        <th className="py-1 pr-2 font-medium">Unit</th>
                        {printCumColumns.map((col) => (
                          <th key={col.orderId} className="py-1 pr-2 font-medium">
                            {col.dateLabel}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {sheet.items.map((row) => (
                        <tr key={row.key} className="border-b border-gray-100">
                          <td className="py-1 pr-2">{row.label}</td>
                          <td className="py-1 pr-2">{row.unit}</td>
                          {printCumColumns.map((col) => {
                            const cell = row.values[col.orderId];
                            const definition =
                              catalog
                                .find((test) => test.code === row.testCode)
                                ?.parameters.find((param) => param.name === row.parameter) || null;
                            const flag = cell
                              ? parameterFlag(cell.value, definition, flagCtx)
                              : null;
                            return (
                              <td key={col.orderId} className="py-1 pr-2">
                                {cell ? `${cell.value || "—"}${flag ? ` ${flag}` : ""}${cell.amended ? " *" : ""}` : "—"}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  <footer className="mt-6 border-t border-gray-300 pt-2 text-[10px] text-gray-500">
                    {clinic?.name || "Clinic"}
                    {clinic?.address ? ` · ${clinic.address}` : ""} · {displayName} · Lab ID{" "}
                    {patient.labId || "—"} · {sexAge} · {printRange} · Printed {printJob.printedAt} by{" "}
                    {printedBy} · {formatHistoryPageLine(sheet.page, sheet.of)}
                  </footer>
                </section>
              ))}
        </div>
      )}

      {pinFor && (
        <SensitivePinPrompt
          action="print"
          onClose={() => setPinFor(null)}
          onConfirmed={confirmPrint}
        />
      )}
    </main>
  );
}

export default function PatientHistoryPage() {
  return (
    <ProtectedRoute require={canApproveResults}>
      <PatientHistoryContent />
    </ProtectedRoute>
  );
}
