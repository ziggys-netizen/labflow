"use client";

import { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "../lib/ProtectedRoute";
import AppNav from "../lib/AppNav";
import NotYetSynced from "../lib/NotYetSynced";
import { useAuth } from "../lib/AuthContext";
import { useConnection } from "../lib/ConnectionContext";
import { useClinicCollection } from "../lib/clinicListen";
import { authedGet, authedPost } from "../lib/authApi";
import { canExportData, canViewDashboard } from "../lib/permissions";
import { isOrderForDeletedPatient, isPatientDeleted } from "../lib/patientSoftDelete";
import { getTimeWindow, isWithin, summarizeTurnaround, formatTurnaroundExclusionCopy, TimeWindowKey, TURNAROUND_DEFINITION } from "../lib/datetime";
import CatalogReviewBanner from "../lib/CatalogReviewBanner";
import { interpretCollection, orderCollectionFromData, type OrderTestRef, type SampleCollections } from "../lib/sampleCollection";
import { countAmendmentsInWindow, isReleasedResultStatus } from "../lib/resultAmendment";
import { criticalAwaitingCommunication } from "../lib/criticalResults";
import { orderHasCriticalResults } from "../lib/resultFlag";
import { SAMPLE_REJECTION_CODES } from "../lib/reasonCodes";
import { SensitivePinPrompt } from "../lib/PinGate";
import type { LabTest } from "../lib/testCatalog";
import { parseRosterSession } from "../lib/rosterStore";
import { reasonCodeLabel, BREAK_GLASS_CODES } from "../lib/reasonCodes";
import {
  MAX_EXPORT_RANGE_DAYS,
  MAX_EXPORTS_PER_HOUR,
  REPORT_TYPE_LABELS,
  REPORT_TYPES,
  exportFilename,
  parseRecentExports,
  type RecentExport,
  type ReportType,
} from "../lib/reportExport";

interface OrderRecord {
  id: string;
  status: string;
  createdAt: string;
  tests: OrderTestRef[];
  sampleCollectedAt?: string | null;
  sampleCollections?: SampleCollections | null;
  reviewedAt?: string | null;
  resultVersions?: unknown;
  lastAmendedAt?: string | null;
  notYetSynced?: boolean;
  selfReleased?: boolean;
  rejectionReasonCode?: string | null;
  rejectedAt?: string | null;
  needsFinalReprint?: boolean;
  criticalNotification?: unknown;
  results?: Record<string, Record<string, string>> | null;
  patientSex?: string | null;
}

const WINDOWS: { key: TimeWindowKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
];

function ymdLocal(d: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

function defaultExportEnd() {
  return ymdLocal(new Date());
}

function defaultExportStart() {
  const d = new Date();
  d.setDate(d.getDate() - 6);
  return ymdLocal(d);
}

function ExportReports() {
  const { isOnline } = useConnection();
  const [startDate, setStartDate] = useState(defaultExportStart);
  const [endDate, setEndDate] = useState(defaultExportEnd);
  const [reportType, setReportType] = useState<ReportType>("patients");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [recipient, setRecipient] = useState<string | null>(null);
  const [recent, setRecent] = useState<RecentExport[]>([]);
  const [pinFor, setPinFor] = useState<"download" | "email" | null>(null);

  useEffect(() => {
    if (!isOnline) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await authedGet("/api/reports/export");
        const data = (await res.json().catch(() => ({}))) as {
          recipient?: string | null;
          recent?: RecentExport[];
          error?: string;
        };
        if (cancelled) return;
        if (!res.ok) {
          setError(data.error || "Could not load recent exports.");
          return;
        }
        setRecipient(typeof data.recipient === "string" ? data.recipient : null);
        setRecent(parseRecentExports(data.recent));
        setError("");
      } catch (err) {
        console.error(err);
        if (!cancelled) setError("Could not load recent exports.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isOnline]);

  async function runExport(delivery: "download" | "email") {
    setError("");
    setConfirmation("");
    if (!isOnline) {
      setError("Export needs the server, so it is unavailable while this device is offline.");
      return;
    }
    setBusy(true);
    try {
      const res = await authedPost("/api/reports/export", { startDate, endDate, reportType, delivery });
      if (res.status === 429) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        setError(data.error || `Too many exports. Limit is ${MAX_EXPORTS_PER_HOUR} per hour.`);
        return;
      }
      if (!res.ok) {
        const data = (await res.json().catch(() => ({}))) as { error?: string };
        if (res.status === 503) {
          setError(data.error || "Export is temporarily unavailable. Try again shortly.");
          return;
        }
        setError(data.error || "Could not build the export.");
        return;
      }

      if (delivery === "download") {
        const blob = await res.blob();
        const headerCount = Number(res.headers.get("X-Export-Row-Count") || 0);
        const filename = exportFilename(reportType, startDate, endDate);
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        link.click();
        URL.revokeObjectURL(url);
        setConfirmation(
          `Downloaded ${headerCount} row${headerCount === 1 ? "" : "s"}. Email still creates the traceable copy if you need it.`
        );
        setRecent((prev) =>
          [
            {
              at: new Date().toISOString(),
              reportType,
              startDate,
              endDate,
              rowCount: headerCount,
              recipient: recipient || "download",
            },
            ...prev,
          ].slice(0, 10)
        );
        return;
      }

      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        recipient?: string;
        rowCount?: number;
      };
      const emailedTo = typeof data.recipient === "string" ? data.recipient : recipient;
      const rows = typeof data.rowCount === "number" ? data.rowCount : 0;
      setRecipient(emailedTo);
      setConfirmation(
        emailedTo
          ? `Emailed ${rows} row${rows === 1 ? "" : "s"} to ${emailedTo}.`
          : `Emailed ${rows} row${rows === 1 ? "" : "s"}.`
      );
      setRecent((prev) => [
        {
          at: new Date().toISOString(),
          reportType,
          startDate,
          endDate,
          rowCount: rows,
          recipient: emailedTo || "",
        },
        ...prev,
      ].slice(0, 10));
    } catch (err) {
      console.error(err);
      setError("Could not send the export.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border border-gray-200 rounded-lg p-4 mt-8 mb-8">
      <h2 className="text-sm font-medium text-gray-900 mb-1">Excel export</h2>
      <p className="text-sm text-gray-500 mb-4">
        Download the file on this device. Email still goes only to the address on your account.
        Maximum {MAX_EXPORT_RANGE_DAYS} days and {MAX_EXPORTS_PER_HOUR} exports per hour.
        {recipient ? ` This account: ${recipient}.` : ""}
      </p>
      {!isOnline && (
        <p className="text-sm text-amber-800 mb-4">
          Export needs the server, so it is unavailable while this device is offline.
        </p>
      )}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          setPinFor("download");
        }}
        className="grid gap-3 md:grid-cols-5 md:items-end"
      >
        <label className="text-sm text-gray-700">
          Start
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
            required
          />
        </label>
        <label className="text-sm text-gray-700">
          End
          <input
            type="date"
            value={endDate}
            onChange={(e) => setEndDate(e.target.value)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
            required
          />
        </label>
        <label className="text-sm text-gray-700">
          Report
          <select
            value={reportType}
            onChange={(e) => setReportType(e.target.value as ReportType)}
            className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2"
          >
            {REPORT_TYPES.map((type) => (
              <option key={type} value={type}>
                {REPORT_TYPE_LABELS[type]}
              </option>
            ))}
          </select>
        </label>
        <button
          type="submit"
          disabled={busy || !isOnline}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white hover:bg-gray-800 disabled:opacity-50"
        >
          {busy ? "Working…" : "Download"}
        </button>
        <button
          type="button"
          disabled={busy || !isOnline}
          onClick={() => setPinFor("email")}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50 disabled:opacity-50"
        >
          Email copy
        </button>
      </form>
      {pinFor && (
        <SensitivePinPrompt
          action="export"
          onClose={() => setPinFor(null)}
          onConfirmed={() => {
            const delivery = pinFor;
            setPinFor(null);
            void runExport(delivery);
          }}
        />
      )}
      {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      {confirmation && <p className="text-sm text-gray-900 mt-3">{confirmation}</p>}
      <h3 className="text-sm font-medium text-gray-900 mt-6 mb-2">Your recent exports</h3>
      {recent.length === 0 ? (
        <p className="text-sm text-gray-600">No exports from this account yet.</p>
      ) : (
        <ul className="text-sm text-gray-700 space-y-1">
          {recent.map((item) => (
            <li key={`${item.at}-${item.reportType}-${item.startDate}`}>
              {new Date(item.at).toLocaleString()} — {REPORT_TYPE_LABELS[item.reportType]}{" "}
              {item.startDate} to {item.endDate}, {item.rowCount} row
              {item.rowCount === 1 ? "" : "s"}
              {item.recipient ? `, emailed to ${item.recipient}` : ""}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function DashboardContent() {
  const { role, clinicId } = useAuth();

  const [windowKey, setWindowKey] = useState<TimeWindowKey>("today");

  const allowed = canViewDashboard(role);
  const ordersQuery = useClinicCollection("orders", role, clinicId, { enabled: allowed });
  const patientsQuery = useClinicCollection("patients", role, clinicId, { enabled: allowed });
  const catalogQuery = useClinicCollection("testCatalog", role, clinicId, { enabled: allowed });
  const rosterSessionsQuery = useClinicCollection("rosterSessions", role, clinicId, { enabled: allowed });

  const orders: OrderRecord[] = ordersQuery.docs
    .filter((d) => !isOrderForDeletedPatient(d.data()))
    .map((d) => {
      const parsed = orderCollectionFromData(d.id, d.data(), d.metadata.hasPendingWrites);
      return {
        id: parsed.id,
        status: parsed.status,
        createdAt: d.data().createdAt,
        tests: parsed.tests,
        sampleCollectedAt: parsed.sampleCollectedAt,
        sampleCollections: parsed.sampleCollections,
        reviewedAt: d.data().reviewedAt || null,
        resultVersions: d.data().resultVersions,
        lastAmendedAt: d.data().lastAmendedAt || null,
        notYetSynced: parsed.notYetSynced,
        selfReleased: d.data().selfReleased === true,
        rejectionReasonCode: typeof d.data().rejectionReasonCode === "string" ? d.data().rejectionReasonCode : null,
        rejectedAt: typeof d.data().rejectedAt === "string" ? d.data().rejectedAt : null,
        needsFinalReprint: d.data().needsFinalReprint === true,
        criticalNotification: d.data().criticalNotification,
        results: (d.data().results as Record<string, Record<string, string>>) || null,
      };
    });
  const catalog = catalogQuery.docs.map((d) => d.data() as LabTest);
  const patientDates = patientsQuery.docs
    .filter((d) => !isPatientDeleted(d.data()))
    .map((d) => d.data().createdAt)
    .filter(Boolean);
  const offRosterSessions = rosterSessionsQuery.docs
    .map((d) => parseRosterSession(d.id, d.data() as Record<string, unknown>))
    .filter((row): row is NonNullable<typeof row> => row !== null);
  const loading = ordersQuery.loading || patientsQuery.loading || catalogQuery.loading;
  const error = ordersQuery.error
    ? `Could not load dashboard data. ${ordersQuery.error}`
    : patientsQuery.error
      ? `Could not load dashboard data. ${patientsQuery.error}`
      : "";
  const hasUnsynced = orders.some((o) => o.notYetSynced) || patientsQuery.docs.some((d) => d.metadata.hasPendingWrites);

  const stats = useMemo(() => {
    const window = getTimeWindow(windowKey);

    const ordersInWindow = orders.filter((o) => isWithin(o.createdAt, window));
    const testsOrdered = ordersInWindow.reduce((sum, o) => sum + o.tests.length, 0);

    const byType = new Map<string, number>();
    for (const order of ordersInWindow) {
      for (const test of order.tests) {
        byType.set(test.name || test.code, (byType.get(test.name || test.code) || 0) + 1);
      }
    }

    const approvedInWindow = orders.filter(
      (o) => isReleasedResultStatus(o.status) && isWithin(o.reviewedAt, window)
    );

    const tat = summarizeTurnaround(approvedInWindow);

    return {
      window,
      patientsRegistered: patientDates.filter((d) => isWithin(d, window)).length,
      testsOrdered,
      byType: [...byType.entries()].sort((a, b) => b[1] - a[1]),
      approved: approvedInWindow.length,
      amendments: countAmendmentsInWindow(orders, (iso) => isWithin(iso, window)),
      turnaround: tat.median,
      turnaroundLegacy: tat.legacyCounted,
      turnaroundCopy: formatTurnaroundExclusionCopy(tat),
      awaitingSample: orders.filter(
        (o) => !isReleasedResultStatus(o.status) && !interpretCollection(o).allCollected
      ).length,
      pending: orders.filter((o) => o.status === "pending").length,
      awaitingReview: orders.filter((o) => o.status === "results_entered").length,
      returned: orders.filter((o) => o.status === "needs_correction").length,
      rejected: orders.filter(
        (o) => o.status === "rejected" && isWithin(o.rejectedAt || o.createdAt, window)
      ).length,
      rejectedByReason: SAMPLE_REJECTION_CODES.map((item) => ({
        code: item.code,
        label: item.label,
        count: orders.filter(
          (o) =>
            o.status === "rejected" &&
            o.rejectionReasonCode === item.code &&
            isWithin(o.rejectedAt || o.createdAt, window)
        ).length,
      })).filter((row) => row.count > 0),
      selfReleased: approvedInWindow.filter((o) => o.selfReleased).length,
      criticalAwaiting: orders.filter((o) =>
        criticalAwaitingCommunication({
          status: o.status,
          hasCritical: orderHasCriticalResults(o.tests, o.results, catalog, null),
          criticalNotification: o.criticalNotification,
        })
      ).length,
      pendingReprints: orders.filter((o) => o.needsFinalReprint).length,
      offRosterByStaff: (() => {
        const rows = offRosterSessions.filter((session) => isWithin(session.startsAt, window));
        const byUid = new Map<string, { name: string; count: number; codes: Record<string, number> }>();
        for (const session of rows) {
          const current = byUid.get(session.userUid) ?? {
            name: session.displayName,
            count: 0,
            codes: {},
          };
          current.count += 1;
          current.codes[session.reasonCode] = (current.codes[session.reasonCode] || 0) + 1;
          byUid.set(session.userUid, current);
        }
        return [...byUid.entries()]
          .map(([uid, row]) => ({ uid, ...row }))
          .sort((a, b) => b.count - a.count);
      })(),
    };
  }, [orders, patientDates, windowKey, catalog, offRosterSessions]);

  if (!allowed) return null;

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <CatalogReviewBanner />
      <div className="max-w-5xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1 inline-flex items-center gap-2">
          Laboratory dashboard
          <NotYetSynced show={hasUnsynced} />
        </h1>
        <p className="text-gray-600 mb-6">
          {role === "owner" ? "All clinics" : "Your clinic"}. {TURNAROUND_DEFINITION}
        </p>

        <div className="flex gap-2 mb-8">
          {WINDOWS.map((w) => (
            <button
              key={w.key}
              onClick={() => setWindowKey(w.key)}
              className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                windowKey === w.key
                  ? "bg-gray-900 text-white"
                  : "border border-gray-300 text-gray-700 hover:bg-gray-50"
              }`}
            >
              {w.label}
            </button>
          ))}
        </div>

        {loading && <p className="text-gray-600">Loading...</p>}
        {error && <p className="text-red-600">{error}</p>}

        {!loading && !error && (
          <>
            <h2 className="text-sm font-medium text-gray-900 mb-3">Current queue</h2>
            <p className="text-sm text-gray-500 mb-3">
              Live counts across all open work, not limited to the selected period.
            </p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
              <Metric
                label="Pending tests"
                value={String(stats.pending)}
                hint="Ordered, results not entered"
              />
              <Metric
                label="Awaiting review"
                value={String(stats.awaitingReview)}
                hint="Entered, not yet approved"
              />
              <Metric
                label="Returned for correction"
                value={String(stats.returned)}
                hint="Sent back by the lab manager"
              />
              <Metric
                label="Awaiting sample"
                value={String(stats.awaitingSample)}
                hint="A required specimen has no collection time"
              />
              <Metric
                label="Critical results awaiting communication"
                value={String(stats.criticalAwaiting)}
                hint="Released, named person not yet recorded as told"
              />
              <Metric
                label="Pending final reprints"
                value={String(stats.pendingReprints)}
                hint="Provisional reports waiting for a confirmed copy"
              />
            </div>

            <h2 className="text-sm font-medium text-gray-900 mb-3">{stats.window.label}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Metric label="Patients registered" value={String(stats.patientsRegistered)} />
              <Metric label="Tests ordered" value={String(stats.testsOrdered)} />
              <Metric label="Approved / released" value={String(stats.approved)} />
              <Metric
                label="Amendments"
                value={String(stats.amendments)}
                hint="Released results rewritten in this period"
              />
              <Metric
                label="Rejected samples"
                value={String(stats.rejected)}
                hint={
                  stats.rejectedByReason.length
                    ? stats.rejectedByReason.map((row) => `${row.label} ${row.count}`).join(" · ")
                    : "By reason code in this period"
                }
              />
              <Metric
                label="Self-released"
                value={String(stats.selfReleased)}
                hint="Approver released their own entry"
              />
              <Metric
                label="Off-roster sessions"
                value={String(stats.offRosterByStaff.reduce((sum, row) => sum + row.count, 0))}
                hint="Break-glass unlocks in this period"
              />
              <div className="border border-gray-200 rounded-lg p-4 md:col-span-2">
                <p className="text-sm text-gray-600">Median turnaround</p>
                <p className="text-2xl font-semibold text-gray-900 mt-1">
                  {stats.turnaround === null ? "—" : `${stats.turnaround.toFixed(1)} h`}
                </p>
                <p className="text-sm text-gray-500 mt-2">{stats.turnaroundCopy}</p>
                {stats.turnaroundLegacy > 0 && (
                  <p className="text-xs text-gray-400 mt-1">
                    Includes {stats.turnaroundLegacy} with a legacy single timestamp.
                  </p>
                )}
              </div>
            </div>

            <div className="border border-gray-200 rounded-lg p-4 mb-8">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Off-roster sessions by staff</h3>
              {stats.offRosterByStaff.length === 0 ? (
                <p className="text-sm text-gray-600">No break-glass sessions in this period.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <tbody>
                    {stats.offRosterByStaff.map((row) => (
                      <tr key={row.uid} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 text-gray-900">{row.name}</td>
                        <td className="py-2 text-gray-600">
                          {Object.entries(row.codes)
                            .map(([code, count]) => `${reasonCodeLabel(BREAK_GLASS_CODES, code)} ${count}`)
                            .join(" · ")}
                        </td>
                        <td className="py-2 text-right text-gray-600">{row.count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>

            <div className="border border-gray-200 rounded-lg p-4 mb-8">
              <h3 className="text-sm font-medium text-gray-900 mb-3">Tests by type</h3>
              {stats.byType.length === 0 ? (
                <p className="text-sm text-gray-600">No tests ordered in this period.</p>
              ) : (
                <table className="w-full text-left text-sm">
                  <tbody>
                    {stats.byType.map(([name, count]) => (
                      <tr key={name} className="border-b border-gray-100 last:border-0">
                        <td className="py-2 text-gray-900">{name}</td>
                        <td className="py-2 text-right text-gray-600">{count}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {canExportData(role) ? (
          <ExportReports />
        ) : (
          <p className="text-xs text-gray-400 mt-8">
            Excel export is not available for this role. Ask a clinic admin, lab manager, or the
            owner if a report is needed.
          </p>
        )}
      </div>
    </main>
  );
}

export default function Dashboard() {
  return (
    <ProtectedRoute require={canViewDashboard}>
      <DashboardContent />
    </ProtectedRoute>
  );
}
