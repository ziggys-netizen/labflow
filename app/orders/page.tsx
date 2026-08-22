"use client";

import Link from "next/link";
import ProtectedRoute from "../lib/ProtectedRoute";
import AppNav from "../lib/AppNav";
import NotYetSynced from "../lib/NotYetSynced";
import { useAuth } from "../lib/AuthContext";
import { useClinicCollection } from "../lib/clinicListen";
import { canEnterResults, canOrderTests } from "../lib/permissions";
import { isOrderForDeletedPatient } from "../lib/patientSoftDelete";
import { orderCollectionFromData, type OrderTestRef, type SampleCollections } from "../lib/sampleCollection";
import { orderDisplayLabel, orderDisplayToneClass } from "../lib/orderLifecycle";

interface Order {
  id: string;
  patientName: string;
  patientLabId: string;
  tests: OrderTestRef[];
  status: string;
  createdAt: string;
  sampleCollectedAt?: string | null;
  sampleCollections?: SampleCollections | null;
  awaitingLabel: string;
  awaitingTone: ReturnType<typeof orderDisplayLabel>["tone"];
  notYetSynced?: boolean;
}

function OrdersContent() {
  const { role, clinicId } = useAuth();
  const allowed = canOrderTests(role) || canEnterResults(role);
  const query = useClinicCollection("orders", role, clinicId, {
    sortBy: "createdAt",
    direction: "desc",
    enabled: allowed,
  });

  const orders: Order[] = query.docs
    .filter((docSnap) => !isOrderForDeletedPatient(docSnap.data()))
    .map((docSnap) => {
      const data = docSnap.data();
      const parsed = orderCollectionFromData(docSnap.id, data, docSnap.metadata.hasPendingWrites);
      return {
        id: parsed.id,
        patientName: data.patientName,
        patientLabId: data.patientLabId,
        tests: parsed.tests,
        status: parsed.status,
        createdAt: data.createdAt,
        sampleCollectedAt: parsed.sampleCollectedAt,
        sampleCollections: parsed.sampleCollections,
        awaitingLabel: orderDisplayLabel(parsed).label,
        awaitingTone: orderDisplayLabel(parsed).tone,
        notYetSynced: parsed.notYetSynced,
      };
    });

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Test orders</h1>

        {query.loading && <p className="text-gray-600">Loading...</p>}
        {!query.loading && orders.length === 0 && <p className="text-gray-600">No orders yet.</p>}

        <div className="space-y-3">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/orders/${o.id}`}
              className="block border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900 inline-flex items-center gap-2">
                  {o.patientName}
                  <NotYetSynced show={o.notYetSynced} />
                </span>
                <span
                  className={`text-xs font-medium tracking-wide border rounded px-2 py-0.5 ${orderDisplayToneClass(o.awaitingTone)}`}
                >
                  {o.awaitingLabel}
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-2">Lab ID: {o.patientLabId}</p>
              <p className="text-sm text-gray-700">
                Tests: {o.tests.map((t) => t.name || t.code).join(", ")}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}

export default function Orders() {
  return (
    <ProtectedRoute require={(role) => canOrderTests(role) || canEnterResults(role)}>
      <OrdersContent />
    </ProtectedRoute>
  );
}
