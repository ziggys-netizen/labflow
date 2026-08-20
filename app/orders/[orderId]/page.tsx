"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { useAuth } from "../../lib/AuthContext";
import { db } from "../../lib/firebase";
import { doc, getDoc, setDoc, getDocs } from "firebase/firestore";
import { TEST_CATALOG, LabTest } from "../../lib/testCatalog";
import ProtectedRoute from "../../lib/ProtectedRoute";
import AppNav from "../../lib/AppNav";
import { clinicCollectionQuery, isOwner } from "../../lib/clinicScope";

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
  clinicId?: string;
  results?: Record<string, Record<string, string>>;
  resultsEnteredBy?: string | null;
  resultsEnteredAt?: string;
  reviewedBy?: string | null;
  reviewedAt?: string;
  reviewNotes?: string;
}

function OrderDetailContent() {
  const params = useParams();
  const { user, role, clinicId } = useAuth();
  const orderId = params.orderId as string;

  const [order, setOrder] = useState<OrderData | null>(null);
  const [catalog, setCatalog] = useState<LabTest[]>(TEST_CATALOG);
  const [loading, setLoading] = useState(true);
  const [results, setResults] = useState<Record<string, Record<string, string>>>({});
  const [reviewNotes, setReviewNotes] = useState("");
  const [status, setStatus] = useState("");
  const [expandedTest, setExpandedTest] = useState<string | null>(null);

  useEffect(() => {
    async function load() {
      try {
        const orderSnap = await getDoc(doc(db, "orders", orderId));
        if (orderSnap.exists()) {
          const data = orderSnap.data() as OrderData;
          if (!isOwner(role) && clinicId && data.clinicId && data.clinicId !== clinicId) {
            setOrder(null);
          } else {
            setOrder(data);
            setResults(data.results || {});
          }
        }

        const catalogSnap = await getDocs(clinicCollectionQuery("testCatalog", role, clinicId));
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
  }, [orderId, role, clinicId]);

  function getTestDefinition(code: string): LabTest | undefined {
    return catalog.find((t) => t.code === code);
  }

  const resultsEditable = order && (order.status === "pending" || order.status === "results_entered" || order.status === "needs_correction");

  function updateResultValue(testCode: string, paramName: string, value: string) {
    if (!resultsEditable) return;
    setResults((prev) => ({
      ...prev,
      [testCode]: {
        ...(prev[testCode] || {}),
        [paramName]: value,
      },
    }));
  }

  async function submitForReview() {
    if (!user) return;
    setStatus("Submitting results for review...");
    try {
      const updates = {
        results,
        status: "results_entered",
        resultsEnteredBy: user.email,
        resultsEnteredAt: new Date().toISOString(),
        clinicId: order?.clinicId || clinicId || undefined,
      };
      await setDoc(doc(db, "orders", orderId), updates, { merge: true });
      setOrder((prev) => (prev ? { ...prev, ...updates } : prev));
      setStatus("Results submitted for review.");
      setTimeout(() => setStatus(""), 2500);
    } catch (err) {
      console.error(err);
      setStatus("Failed to submit results.");
    }
  }

  async function approveAndRelease() {
    if (!user) return;
    setStatus("Approving...");
    try {
      const updates = {
        status: "approved",
        reviewedBy: user.email,
        reviewedAt: new Date().toISOString(),
        reviewNotes: "",
      };
      await setDoc(doc(db, "orders", orderId), updates, { merge: true });
      setOrder((prev) => (prev ? { ...prev, ...updates } : prev));
      setStatus("Results approved and released.");
      setTimeout(() => setStatus(""), 2500);
    } catch (err) {
      console.error(err);
      setStatus("Failed to approve.");
    }
  }

  async function sendBackForCorrection() {
    if (!user) return;
    setStatus("Sending back...");
    try {
      const updates = {
        status: "needs_correction",
        reviewedBy: user.email,
        reviewedAt: new Date().toISOString(),
        reviewNotes: reviewNotes.trim(),
      };
      await setDoc(doc(db, "orders", orderId), updates, { merge: true });
      setOrder((prev) => (prev ? { ...prev, ...updates } : prev));
      setReviewNotes("");
      setStatus("Sent back for correction.");
      setTimeout(() => setStatus(""), 2500);
    } catch (err) {
      console.error(err);
      setStatus("Failed to send back.");
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="min-h-[50vh] flex items-center justify-center text-gray-600">Loading order...</div>
      </main>
    );
  }
  if (!order) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="min-h-[50vh] flex items-center justify-center text-gray-600">Order not found.</div>
      </main>
    );
  }

  const canReview = role === "admin";

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="flex items-center justify-between mb-1">
          <h1 className="text-2xl font-semibold text-gray-900">Order details</h1>
          <span className="text-xs uppercase tracking-wide text-gray-500 border border-gray-300 rounded px-2 py-1">
            {order.status.replace("_", " ")}
          </span>
        </div>
        <p className="text-gray-600 mb-1">
          {order.patientName} — Lab ID: {order.patientLabId}
        </p>
        <p className="text-sm text-gray-400 mb-2">
          Ordered {new Date(order.createdAt).toLocaleString()}
        </p>
        {order.resultsEnteredBy && (
          <p className="text-xs text-gray-400 mb-1">
            Results entered by {order.resultsEnteredBy} at {new Date(order.resultsEnteredAt!).toLocaleString()}
          </p>
        )}
        {order.reviewedBy && (
          <p className="text-xs text-gray-400 mb-6">
            Reviewed by {order.reviewedBy} at {new Date(order.reviewedAt!).toLocaleString()}
            {order.reviewNotes ? ` — Note: ${order.reviewNotes}` : ""}
          </p>
        )}

        <div className="space-y-3 mt-4">
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
                  <span className="text-sm text-gray-500">{isExpanded ? "Hide" : "View / enter results"}</span>
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
                          disabled={!resultsEditable}
                          placeholder="Result"
                          className="border border-gray-300 rounded px-2 py-1 text-sm col-span-2 disabled:bg-gray-50 disabled:text-gray-500"
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

        {resultsEditable && (
          <button
            onClick={submitForReview}
            className="w-full bg-gray-900 text-white rounded-lg py-2 font-medium hover:bg-gray-800 transition mt-6"
          >
            Submit results for review
          </button>
        )}

        {canReview && order.status === "results_entered" && (
          <div className="border border-gray-200 rounded-lg p-4 mt-6">
            <h2 className="text-sm font-medium text-gray-900 mb-2">Supervisor review</h2>
            <p className="text-sm text-gray-600 mb-3">
              Review the results above, then approve to release them or send back for correction.
            </p>
            <textarea
              value={reviewNotes}
              onChange={(e) => setReviewNotes(e.target.value)}
              placeholder="Notes (required if sending back for correction)"
              rows={2}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
            />
            <div className="flex gap-3">
              <button
                onClick={approveAndRelease}
                className="bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition"
              >
                Approve & release
              </button>
              <button
                onClick={sendBackForCorrection}
                className="border border-gray-300 rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-50 transition"
              >
                Send back for correction
              </button>
            </div>
          </div>
        )}

        {order.status === "approved" && (
          <p className="text-sm text-green-700 mt-6 font-medium">
            ✓ Results approved and released — locked from further edits.
          </p>
        )}

        {status && <p className="text-sm text-gray-600 mt-3">{status}</p>}
      </div>
    </main>
  );
}

export default function OrderDetail() {
  return (
    <ProtectedRoute>
      <OrderDetailContent />
    </ProtectedRoute>
  );
}
