"use client";

import { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { collection, getDocs, orderBy, query } from "firebase/firestore";
import ProtectedRoute from "../lib/ProtectedRoute";

interface Order {
  id: string;
  patientName: string;
  patientLabId: string;
  tests: { code: string; name: string }[];
  status: string;
  createdAt: string;
}

export default function Orders() {
  const [orders, setOrders] = useState<Order[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchOrders() {
      try {
        const q = query(collection(db, "orders"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        setOrders(
          snapshot.docs.map((docSnap) => {
            const data = docSnap.data();
            return {
              id: docSnap.id,
              patientName: data.patientName,
              patientLabId: data.patientLabId,
              tests: data.tests || [],
              status: data.status,
              createdAt: data.createdAt,
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
  }, []);

  return (
    <ProtectedRoute>
      <main className="min-h-screen bg-white px-6 py-16">
        <div className="max-w-3xl mx-auto">
          <h1 className="text-2xl font-semibold text-gray-900 mb-6">Test orders</h1>

          {loading && <p className="text-gray-600">Loading...</p>}
          {!loading && orders.length === 0 && <p className="text-gray-600">No orders yet.</p>}

          <div className="space-y-3">
            {orders.map((o) => (
              <a
                key={o.id}
                href={`/orders/${o.id}`}
                className="block border border-gray-200 rounded-lg p-4 hover:bg-gray-50 transition"
              >
                <div className="flex items-center justify-between mb-2">
                  <span className="font-medium text-gray-900">{o.patientName}</span>
                  <span className="text-xs uppercase tracking-wide text-gray-500">{o.status}</span>
                </div>
                <p className="text-sm text-gray-500 mb-2">Lab ID: {o.patientLabId}</p>
                <p className="text-sm text-gray-700">
                  Tests: {o.tests.map((t) => t.name).join(", ")}
                </p>
              </a>
            ))}
          </div>
        </div>
      </main>
    </ProtectedRoute>
  );
}
