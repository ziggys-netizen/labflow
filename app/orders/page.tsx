"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import ProtectedRoute from "../lib/ProtectedRoute";
import AppNav from "../lib/AppNav";
import { useAuth } from "../lib/AuthContext";
import { getClinicDocs } from "../lib/clinicScope";
import { canEnterResults, canOrderTests } from "../lib/permissions";
import { isOrderForDeletedPatient } from "../lib/patientSoftDelete";

interface Order {
  id: string;
  patientName: string;
  patientLabId: string;
  tests: { code: string; name: string }[];
  status: string;
  createdAt: string;
  sampleCollectedAt?: string | null;
}

function OrdersContent() {
  const { role, clinicId } = useAuth();
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);
  const allowed = canOrderTests(role) || canEnterResults(role);

  useEffect(() => {
    if (!allowed) return;
    async function fetchOrders() {
      try {
        const docs = await getClinicDocs("orders", role, clinicId, {
          sortBy: "createdAt",
          direction: "desc",
        });
        setOrders(
          docs
            .filter((docSnap) => !isOrderForDeletedPatient(docSnap.data()))
            .map((docSnap) => {
              const data = docSnap.data();
              return {
                id: docSnap.id,
                patientName: data.patientName,
                patientLabId: data.patientLabId,
                tests: data.tests || [],
                status: data.status,
                createdAt: data.createdAt,
                sampleCollectedAt: data.sampleCollectedAt || null,
              };
            })
        );
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchOrders();
  }, [allowed, role, clinicId]);

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Test orders</h1>

        {loading && <p className="text-gray-600">Loading...</p>}
        {!loading && orders.length === 0 && <p className="text-gray-600">No orders yet.</p>}

        <div className="space-y-3">
          {orders.map((o) => (
            <Link
              key={o.id}
              href={`/orders/${o.id}`}
              className="block border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition"
            >
              <div className="flex items-center justify-between mb-2">
                <span className="font-medium text-gray-900">{o.patientName}</span>
                <span className="text-xs uppercase tracking-wide text-gray-500">
                  {o.sampleCollectedAt ? o.status : "Awaiting sample"}
                </span>
              </div>
              <p className="text-sm text-gray-500 mb-2">Lab ID: {o.patientLabId}</p>
              <p className="text-sm text-gray-700">
                Tests: {o.tests.map((t) => t.name).join(", ")}
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
