"use client";

import { useEffect, useMemo, useState } from "react";
import ProtectedRoute from "../lib/ProtectedRoute";
import AppNav from "../lib/AppNav";
import { useAuth } from "../lib/AuthContext";
import { getClinicDocs } from "../lib/clinicScope";
import { canExportData, canViewDashboard } from "../lib/permissions";
import { isOrderForDeletedPatient, isPatientDeleted } from "../lib/patientSoftDelete";
import { getTimeWindow, isWithin, median, TimeWindowKey } from "../lib/datetime";

interface OrderRecord {
  id: string;
  status: string;
  createdAt: string;
  tests: { code: string; name: string }[];
  sampleCollectedAt?: string | null;
  reviewedAt?: string | null;
}

const WINDOWS: { key: TimeWindowKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "yesterday", label: "Yesterday" },
  { key: "week", label: "This week" },
];

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

  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [patientDates, setPatientDates] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [windowKey, setWindowKey] = useState<TimeWindowKey>("today");

  const allowed = canViewDashboard(role);

  useEffect(() => {
    if (!allowed) return;
    async function load() {
      try {
        const [orderDocs, patientDocs] = await Promise.all([
          getClinicDocs("orders", role, clinicId),
          getClinicDocs("patients", role, clinicId),
        ]);
        setOrders(
          orderDocs
            .filter((d) => !isOrderForDeletedPatient(d.data()))
            .map((d) => {
              const data = d.data();
              return {
                id: d.id,
                status: data.status || "pending",
                createdAt: data.createdAt,
                tests: data.tests || [],
                sampleCollectedAt: data.sampleCollectedAt || null,
                reviewedAt: data.reviewedAt || null,
              };
            })
        );
        setPatientDates(
          patientDocs
            .filter((d) => !isPatientDeleted(d.data()))
            .map((d) => d.data().createdAt)
            .filter(Boolean)
        );
      } catch (err) {
        console.error(err);
        const detail = err instanceof Error ? ` ${err.message}` : "";
        setError(`Could not load dashboard data.${detail}`);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [allowed, role, clinicId]);

  const stats = useMemo(() => {
    const window = getTimeWindow(windowKey);

    const ordersInWindow = orders.filter((o) => isWithin(o.createdAt, window));
    const testsOrdered = ordersInWindow.reduce((sum, o) => sum + o.tests.length, 0);

    const byType = new Map<string, number>();
    for (const order of ordersInWindow) {
      for (const test of order.tests) {
        byType.set(test.name, (byType.get(test.name) || 0) + 1);
      }
    }

    const approvedInWindow = orders.filter(
      (o) => o.status === "approved" && isWithin(o.reviewedAt, window)
    );

    const turnaroundHours: number[] = [];
    let excluded = 0;
    for (const order of approvedInWindow) {
      if (!order.sampleCollectedAt || !order.reviewedAt) {
        excluded += 1;
        continue;
      }
      const collected = new Date(order.sampleCollectedAt).getTime();
      const approved = new Date(order.reviewedAt).getTime();
      if (Number.isNaN(collected) || Number.isNaN(approved) || approved < collected) {
        excluded += 1;
        continue;
      }
      turnaroundHours.push((approved - collected) / 3600000);
    }

    return {
      window,
      patientsRegistered: patientDates.filter((d) => isWithin(d, window)).length,
      testsOrdered,
      byType: [...byType.entries()].sort((a, b) => b[1] - a[1]),
      approved: approvedInWindow.length,
      turnaround: median(turnaroundHours),
      turnaroundCounted: turnaroundHours.length,
      turnaroundExcluded: excluded,
      awaitingSample: orders.filter((o) => !o.sampleCollectedAt && o.status !== "approved").length,
      pending: orders.filter((o) => o.status === "pending").length,
      awaitingReview: orders.filter((o) => o.status === "results_entered").length,
      returned: orders.filter((o) => o.status === "needs_correction").length,
    };
  }, [orders, patientDates, windowKey]);

  if (!allowed) return null;

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-5xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Laboratory dashboard</h1>
        <p className="text-gray-600 mb-6">
          {role === "owner" ? "All clinics" : "Your clinic"} — turnaround measured from sample
          collection to result approval.
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
                hint="No collection time recorded"
              />
            </div>

            <h2 className="text-sm font-medium text-gray-900 mb-3">{stats.window.label}</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
              <Metric label="Patients registered" value={String(stats.patientsRegistered)} />
              <Metric label="Tests ordered" value={String(stats.testsOrdered)} />
              <Metric label="Approved / released" value={String(stats.approved)} />
              <Metric
                label="Median turnaround"
                value={stats.turnaround === null ? "—" : `${stats.turnaround.toFixed(1)} h`}
                hint={
                  stats.turnaroundExcluded > 0
                    ? `${stats.turnaroundCounted} counted, ${stats.turnaroundExcluded} excluded (no collection time)`
                    : `${stats.turnaroundCounted} counted`
                }
              />
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

            <p className="text-xs text-gray-400">
              {canExportData(role)
                ? "Reporting beyond the current week is by Excel export, which is not built yet — it depends on an email delivery provider being chosen."
                : "Excel export is not available for this role. Ask a clinic admin, lab manager, or the owner if a report is needed."}
            </p>
          </>
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
