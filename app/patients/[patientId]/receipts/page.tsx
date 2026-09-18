"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc, getDocs, where } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuth } from "../../../lib/AuthContext";
import ProtectedRoute from "../../../lib/ProtectedRoute";
import AppNav from "../../../lib/AppNav";
import { clinicCollectionQuery, isOwner } from "../../../lib/clinicScope";
import { canViewOwnRegisteredPatients, canViewPatients } from "../../../lib/permissions";
import { useWriteIdentity } from "../../../lib/pinSession";
import { isOrderForDeletedPatient, isPatientDeleted } from "../../../lib/patientSoftDelete";
import { formatPaymentAmount, parseOrderPayment, PAYMENT_METHOD_LABELS } from "../../../lib/orderPayment";

interface ReceiptRow {
  id: string;
  href: string;
  at: string;
  description: string;
  amount: string;
  method: string;
}

interface OrderTestRef {
  name?: string;
  code?: string;
}

function ReceiptsContent() {
  const params = useParams<{ patientId: string }>();
  const patientId = params.patientId;
  const { role, clinicId } = useAuth();
  const writer = useWriteIdentity();

  const [patientLabId, setPatientLabId] = useState("");
  const [rows, setRows] = useState<ReceiptRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [unavailable, setUnavailable] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setUnavailable(false);
      setLoadError(null);
      try {
        const patientSnap = await getDoc(doc(db, "patients", patientId));
        if (!patientSnap.exists()) {
          if (!cancelled) setUnavailable(true);
          return;
        }
        const patient = patientSnap.data();
        if (
          isPatientDeleted(patient) ||
          (!isOwner(role) && clinicId && patient.clinicId && patient.clinicId !== clinicId)
        ) {
          if (!cancelled) setUnavailable(true);
          return;
        }
        if (
          canViewOwnRegisteredPatients(role) &&
          !canViewPatients(role) &&
          patient.createdByUid &&
          patient.createdByUid !== writer.uid
        ) {
          if (!cancelled) setUnavailable(true);
          return;
        }
        if (!cancelled) setPatientLabId(typeof patient.labId === "string" ? patient.labId : "");

        const [orderSnap, chargeSnap] = await Promise.all([
          getDocs(clinicCollectionQuery("orders", role, clinicId, [where("patientId", "==", patientId)])),
          getDocs(
            clinicCollectionQuery("serviceCharges", role, clinicId, [where("patientId", "==", patientId)])
          ),
        ]);

        const found: ReceiptRow[] = [];
        for (const d of orderSnap.docs) {
          const data = d.data();
          if (isOrderForDeletedPatient(data)) continue;
          const payment = parseOrderPayment(data.payment);
          if (!payment) continue;
          const tests = Array.isArray(data.tests) ? (data.tests as OrderTestRef[]) : [];
          const description = tests.map((t) => t.name || t.code).filter(Boolean).join(", ") || "Laboratory tests";
          found.push({
            id: d.id,
            href: `/orders/${d.id}/receipt`,
            at: payment.recordedAt || (typeof data.createdAt === "string" ? data.createdAt : ""),
            description,
            amount: formatPaymentAmount(payment),
            method: PAYMENT_METHOD_LABELS[payment.method],
          });
        }
        for (const d of chargeSnap.docs) {
          const data = d.data();
          const payment = parseOrderPayment(data.payment);
          if (!payment) continue;
          found.push({
            id: d.id,
            href: `/services/${d.id}/receipt`,
            at: payment.recordedAt || (typeof data.createdAt === "string" ? data.createdAt : ""),
            description: typeof data.serviceName === "string" ? data.serviceName : "Service",
            amount: formatPaymentAmount(payment),
            method: PAYMENT_METHOD_LABELS[payment.method],
          });
        }
        found.sort((a, b) => b.at.localeCompare(a.at));
        if (!cancelled) setRows(found);
      } catch (err) {
        console.error(err);
        if (!cancelled) setLoadError(err instanceof Error ? err.message : "Unknown error.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [patientId, role, clinicId, writer.uid, reloadToken]);

  if (loading) {
    return (
      <main className="min-h-screen">
        <AppNav />
        <p className="px-6 py-16 text-center text-gray-600">Loading receipts...</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="min-h-screen">
        <AppNav />
        <div className="px-6 py-16 text-center text-gray-600">
          <p>Could not load receipts. {loadError}</p>
          <button
            type="button"
            onClick={() => setReloadToken((n) => n + 1)}
            className="mt-3 inline-block text-sm text-gray-900 underline"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (unavailable) {
    return (
      <main className="min-h-screen">
        <AppNav />
        <div className="px-6 py-16 text-center text-gray-600">
          <p>Patient not found.</p>
          <Link href="/patients" className="mt-3 inline-block text-sm text-gray-900 underline">
            Back to patients
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <AppNav />
      <div className="max-w-lg mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Receipts</h1>
        <p className="text-gray-600 mb-6">Lab ID: {patientLabId}</p>

        {rows && rows.length === 0 && (
          <p className="text-sm text-gray-500">No receipts for this patient yet.</p>
        )}

        <ul className="space-y-2">
          {(rows || []).map((row) => (
            <li key={row.id}>
              <Link
                href={row.href}
                className="block border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50"
              >
                <p className="text-sm font-medium text-gray-900">{row.description}</p>
                <p className="text-xs text-gray-500">
                  {row.at ? new Date(row.at).toLocaleString() : ""} · {row.amount} · {row.method}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </div>
    </main>
  );
}

export default function PatientReceipts() {
  return (
    <ProtectedRoute require={(role) => canViewPatients(role) || canViewOwnRegisteredPatients(role)}>
      <ReceiptsContent />
    </ProtectedRoute>
  );
}
