"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "../../lib/firebase";
import { doc, getDoc, setDoc, collection, getDocs, query as fsQuery } from "firebase/firestore";
import { TEST_CATALOG, LabTest } from "../../lib/testCatalog";

interface OrderTest {
  code: string;
  name: string;
}

interface OrderData {
  patientId: string;
  patientName: string;
  patientLabId: string;
  tests: OrderTest[];
  status: string;
  createdAt: string;
  results?: Record<string, Record<string, string>>;
}

export default function OrderDetail() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.orderId as string;

  const [order, setOrder] = useState<OrderData | null>(null);
  const [catalog, setCatalog] = useState<LabTest[]>(TEST_CATALOG);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<Record<string, Record<string, string>>>({});
  const [status, setStatus] = useState("");
  const [expandedTest, setExpandedTest] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const orderSnap = await getDoc(doc(db, "orders", orderId));
        if (orderSnap.exists()) {
          const data = orderSnap.data() as OrderData;
          setOrder(data);
          setResults(data.results || {});
        }

        const catalogSnap = await getDocs(fsQuery(collection(db, "testCatalog")));
        if (!catalogSnap.empty) {
          setCatalog(catalogSnap.docs.map((d) => d.data() as LabTest));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [orderId]);

  function getTestDefinition(code: string): LabTest | undefined {
    return catalog.find((t) => t.code === code);
  }

  function updateResultValue(testCode: string, paramName: string, value: string) {
    setResults((prev) => ({
      ...prev,
      [testCode]: {
        ...(prev[testCode] || {}),
        [paramName]: value,
      },
    }));
  }

  async function saveResults() {
    setStatus("Saving results...");
    try {
      await setDoc(doc(db, "orders", orderId), { results }, { merge: true });
      setStatus("Results saved.");
      setTimeout(() => setStatus(""), 2500);
    } catch (err) {
      console.error(err);
      setStatus("Failed to save results.");
    }
  }

  async function markCompleted() {
    setStatus("Updating status...");
    try {
      await setDoc(doc(db, "orders", orderId), { status: "completed", results }, { merge: true });
      setOrder((prev) => (prev ? { ...prev, status: "completed" } : prev));
      setStatus("Order marked as completed.");
      setTimeout(() => setStatus(""), 2500);
    } catch (err) {
      console.error(err);
      setStatus("Failed to update status.");
    }
  }

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center text-gray-600">Loading order...</main>;
  }

  if (!order) {
    return <main className="min-h-screen flex items-center justify-center text-gray-600">Order not found.</main>;
  }

  return (
    <main className="min-h-screen bg-white px-6 py-16">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-semibold text-gray-900">Order details</h1>
          <span className="text-xs uppercase tracking-wide text-gray-500 border border-gray-300 rounded px-2 py-1">
            {order.status}
          </span>
        </div>
        <p className="text-gray-600 mb-1">
          {order.patientName} — Lab ID: {order.patientLabId}
        </p>
        <p className="text-sm text-gray-400 mb-6">
          Ordered {new Date(order.createdAt).toLocaleString()}
        </p>

        <a href={`/orders/new/${order.patientId}`} className="text-sm text-gray-900 underline mb-6 inline-block">
          + Add another order for this patient
        </a>

        <div className="space-y-3">
          {order.tests.map((t) => {
            const definition = getTestDefinition(t.code);
            const isExpanded = expandedTest === t.code;
            return (
              <div key={t.code} className="border border-gray-200 rounded-lg p-4">
                <button
                  onClick={() => setExpandedTest(isExpanded ? null : t.code)}
                  className="w-full flex items-center justify-between text-left"
                >
                  <span className="font-medium text-gray-900">{t.name}</span>
                  <span className="text-sm text-gray-500">{isExpanded ? "Hide" : "Enter results"}</span>
                </button>

                {isExpanded && definition && (
                  <div className="mt-4 space-y-3 border-t border-gray-100 pt-4">
                    {definition.parameters.map((p, i) => (
                      <div key={i} className="grid grid-cols-3 gap-2 items-center">
                        <div>
                          <p className="text-sm text-gray-900">{p.name}</p>
                          <p className="text-xs text-gray-400">
                            Ref: {p.referenceRange} {p.unit !== "—" ? `(${p.unit})` : ""}
                          </p>
                        </div>
                        <input
                          type="text"
                          value={results[t.code]?.[p.name] || ""}
                          onChange={(e) => updateResultValue(t.code, p.name, e.target.value)}
                          placeholder="Result"
                          className="border border-gray-300 rounded px-2 py-1 text-sm col-span-2"
                        />
                      </div>
                    ))}
                  </div>
                )}

                {isExpanded && !definition && (
                  <p className="text-sm text-gray-500 mt-3">
                    Test definition not found in catalog — parameters unavailable.
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={saveResults}
            className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition"
          >
            Save results
          </button>
          {order.status !== "completed" && (
            <button
              onClick={markCompleted}
              className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition"
            >
              Mark order as completed
            </button>
          )}
        </div>

        {status && <p className="text-sm text-gray-600 mt-3">{status}</p>}
      </div>
    </main>
  );
}