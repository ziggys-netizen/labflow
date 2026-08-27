"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import ProtectedRoute from "../lib/ProtectedRoute";
import AppNav from "../lib/AppNav";
import NotYetSynced from "../lib/NotYetSynced";
import ActingClinicPrompt from "../lib/ActingClinicPrompt";
import { useAuth } from "../lib/AuthContext";
import { useClinicCollection } from "../lib/clinicListen";
import { canApproveResults } from "../lib/permissions";
import { LabTest } from "../lib/testCatalog";
import { orderCollectionFromData, type OrderTestRef } from "../lib/sampleCollection";
import { orderHasAbnormalResults } from "../lib/resultFlag";
import { patientsByIdFromDocs, resolvePatientNameById } from "../lib/patientDisplay";
import {
  compareQueueOldestFirst,
  formatHours,
  hoursSinceCollection,
  inActingClinic,
  isWaitingOver24Hours,
  queueWaitStartedAt,
} from "../lib/reviewQueue";

type QueueTab = "results_entered" | "needs_correction";

interface QueueOrder {
  id: string;
  patientName: string;
  patientLabId: string;
  tests: OrderTestRef[];
  status: string;
  resultsEnteredBy?: string | null;
  resultsEnteredAt?: string | null;
  waitStartedAt: string | null;
  hoursSinceCollection: number | null;
  stale: boolean;
  abnormal: boolean;
  notYetSynced?: boolean;
}

function ReviewContent() {
  const { role, clinicId, writeClinicId } = useAuth();
  const allowed = canApproveResults(role);
  const scopeId = writeClinicId;
  const [tab, setTab] = useState<QueueTab>("results_entered");
  const [nowMs] = useState(() => Date.now());

  const ordersQuery = useClinicCollection("orders", role, clinicId, { enabled: allowed });
  const catalogQuery = useClinicCollection("testCatalog", role, clinicId, {
    enabled: allowed && Boolean(scopeId),
  });
  const patientsQuery = useClinicCollection("patients", role, clinicId, {
    enabled: allowed && Boolean(scopeId),
  });

  const catalog = useMemo(() => {
    if (!scopeId) return [] as LabTest[];
    return catalogQuery.docs
      .map((docSnap) => docSnap.data() as LabTest)
      .filter((test) => !test.clinicId || test.clinicId === scopeId);
  }, [catalogQuery.docs, scopeId]);

  const sexByPatient = useMemo(() => {
    const map = new Map<string, string | null>();
    if (!scopeId) return map;
    for (const docSnap of patientsQuery.docs) {
      const data = docSnap.data();
      if (data.clinicId && data.clinicId !== scopeId) continue;
      map.set(docSnap.id, typeof data.sex === "string" ? data.sex : null);
    }
    return map;
  }, [patientsQuery.docs, scopeId]);

  const patientsById = useMemo(
    () => patientsByIdFromDocs(patientsQuery.docs),
    [patientsQuery.docs]
  );

  const queued = useMemo(() => {
    if (!scopeId) return [] as QueueOrder[];
    const rows: QueueOrder[] = [];
    for (const docSnap of ordersQuery.docs) {
      const data = docSnap.data();
      if (!inActingClinic(data.clinicId, scopeId)) continue;
      if (data.status !== "results_entered" && data.status !== "needs_correction") continue;
      const parsed = orderCollectionFromData(docSnap.id, data, docSnap.metadata.hasPendingWrites);
      const waitStartedAt = queueWaitStartedAt({
        status: parsed.status,
        resultsEnteredAt: typeof data.resultsEnteredAt === "string" ? data.resultsEnteredAt : null,
        reviewedAt: typeof data.reviewedAt === "string" ? data.reviewedAt : null,
        createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
      });
      const patientId = typeof data.patientId === "string" ? data.patientId : "";
      rows.push({
        id: parsed.id,
        patientName: resolvePatientNameById(patientId, patientsById) || "Unknown patient",
        patientLabId: typeof data.patientLabId === "string" ? data.patientLabId : "—",
        tests: parsed.tests,
        status: parsed.status,
        resultsEnteredBy: typeof data.resultsEnteredBy === "string" ? data.resultsEnteredBy : null,
        resultsEnteredAt: typeof data.resultsEnteredAt === "string" ? data.resultsEnteredAt : null,
        waitStartedAt,
        hoursSinceCollection: hoursSinceCollection(parsed, nowMs),
        stale: isWaitingOver24Hours(waitStartedAt, nowMs),
        abnormal: orderHasAbnormalResults(
          parsed.tests,
          data.results || {},
          catalog,
          sexByPatient.get(patientId) ?? null
        ),
        notYetSynced: parsed.notYetSynced,
      });
    }
    return rows.sort(compareQueueOldestFirst);
  }, [ordersQuery.docs, catalog, sexByPatient, patientsById, scopeId, nowMs]);

  const awaiting = queued.filter((row) => row.status === "results_entered");
  const returned = queued.filter((row) => row.status === "needs_correction");
  const visible = tab === "results_entered" ? awaiting : returned;

  if (!allowed) return null;

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-5xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Review queue</h1>
        <p className="text-gray-600 mb-6">
          Oldest first. Open an order to approve results or send them back for correction.
        </p>

        {!scopeId && <ActingClinicPrompt />}

        {scopeId && (
          <>
            <div className="flex gap-2 mb-6">
              <button
                type="button"
                onClick={() => setTab("results_entered")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  tab === "results_entered"
                    ? "bg-gray-900 text-white"
                    : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                Awaiting release ({awaiting.length})
              </button>
              <button
                type="button"
                onClick={() => setTab("needs_correction")}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                  tab === "needs_correction"
                    ? "bg-gray-900 text-white"
                    : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                }`}
              >
                Needs correction ({returned.length})
              </button>
            </div>

            {ordersQuery.loading && <p className="text-gray-600">Loading...</p>}
            {ordersQuery.error && (
              <p className="text-red-600">Could not load the review queue. {ordersQuery.error}</p>
            )}

            {!ordersQuery.loading && !ordersQuery.error && visible.length === 0 && (
              <p className="text-gray-600">
                {tab === "results_entered"
                  ? "No results waiting for release."
                  : "No orders sent back for correction."}
              </p>
            )}

            <div className="space-y-3">
              {visible.map((order) => (
                <Link
                  key={order.id}
                  href={`/orders/${order.id}`}
                  className={`block rounded-lg p-4 transition ${
                    order.stale
                      ? "border border-amber-300 bg-amber-50 hover:bg-amber-100"
                      : "border border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <div className="flex items-start justify-between gap-4 mb-2">
                    <span className="font-medium text-gray-900 inline-flex items-center gap-2">
                      {order.patientName}
                      <NotYetSynced show={order.notYetSynced} />
                    </span>
                    <span className="flex items-center gap-2 shrink-0">
                      {order.abnormal && (
                        <span className="text-xs font-semibold text-amber-700">Abnormal</span>
                      )}
                      {order.stale && (
                        <span className="text-xs font-medium text-amber-900">Waiting over 24 h</span>
                      )}
                    </span>
                  </div>
                  <p className="text-sm text-gray-500 mb-1">Lab ID: {order.patientLabId}</p>
                  <p className="text-sm text-gray-700 mb-1">
                    Tests: {order.tests.map((test) => test.name || test.code).join(", ") || "—"}
                  </p>
                  <p className="text-sm text-gray-600">
                    {order.resultsEnteredBy
                      ? `Entered by ${order.resultsEnteredBy}${
                          order.resultsEnteredAt
                            ? ` at ${new Date(order.resultsEnteredAt).toLocaleString()}`
                            : ""
                        }`
                      : "Entered by unknown"}
                    {" · "}
                    {formatHours(order.hoursSinceCollection)} since collection
                  </p>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}

export default function Review() {
  return (
    <ProtectedRoute require={canApproveResults}>
      <ReviewContent />
    </ProtectedRoute>
  );
}
