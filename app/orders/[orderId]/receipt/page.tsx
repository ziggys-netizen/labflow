"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuth } from "../../../lib/AuthContext";
import ProtectedRoute from "../../../lib/ProtectedRoute";
import AppNav from "../../../lib/AppNav";
import { isOwner } from "../../../lib/clinicScope";
import { canViewOwnRegisteredPatients, canViewPatients, roleLabel } from "../../../lib/permissions";
import { useWriteIdentity } from "../../../lib/pinSession";
import { isOrderForDeletedPatient, isPatientDeleted } from "../../../lib/patientSoftDelete";
import { parseOrderPayment } from "../../../lib/orderPayment";
import ReceiptPaper, { RECEIPT_PAGE_CSS, type ReceiptData } from "../../../lib/ReceiptPaper";

interface OrderTestRef {
  name?: string;
  code?: string;
}

function OrderReceiptContent() {
  const params = useParams<{ orderId: string }>();
  const orderId = params.orderId;
  const { role, clinicId } = useAuth();
  const writer = useWriteIdentity();

  const [receipt, setReceipt] = useState<ReceiptData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [noPayment, setNoPayment] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      setNotFound(false);
      setNoPayment(false);
      setLoadError(null);
      try {
        const orderSnap = await getDoc(doc(db, "orders", orderId));
        if (!orderSnap.exists() || isOrderForDeletedPatient(orderSnap.data())) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const order = orderSnap.data();
        if (!isOwner(role) && clinicId && order.clinicId && order.clinicId !== clinicId) {
          if (!cancelled) setNotFound(true);
          return;
        }
        const payment = parseOrderPayment(order.payment);
        if (!payment) {
          if (!cancelled) setNoPayment(true);
          return;
        }

        const patientId = typeof order.patientId === "string" ? order.patientId : "";
        const patientSnap = patientId ? await getDoc(doc(db, "patients", patientId)) : null;
        const patient = patientSnap?.exists() ? patientSnap.data() : null;
        if (patient && isPatientDeleted(patient)) {
          if (!cancelled) setNotFound(true);
          return;
        }
        if (
          canViewOwnRegisteredPatients(role) &&
          !canViewPatients(role) &&
          patient?.createdByUid &&
          patient.createdByUid !== writer.uid
        ) {
          if (!cancelled) setNotFound(true);
          return;
        }

        const patientClinicId = (patient?.clinicId as string) || order.clinicId || null;
        const clinicSnap = patientClinicId ? await getDoc(doc(db, "clinics", patientClinicId)) : null;
        const clinicName =
          clinicSnap?.exists() && typeof clinicSnap.data()?.name === "string"
            ? (clinicSnap.data()!.name as string)
            : "";

        const tests = Array.isArray(order.tests) ? (order.tests as OrderTestRef[]) : [];
        const lineItems = tests.map((t) => t.name || t.code || "Test").filter(Boolean);

        if (cancelled) return;
        setReceipt({
          clinicName,
          patientLabId:
            typeof order.patientLabId === "string" && order.patientLabId
              ? order.patientLabId
              : (patient?.labId as string) || "",
          patientName: (patient?.name as string) || "",
          issuedAt: payment.recordedAt || (order.createdAt as string) || new Date().toISOString(),
          lineItems: lineItems.length > 0 ? lineItems : ["Laboratory tests"],
          payment,
          issuedByRole: roleLabel(payment.recordedByRole),
        });
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
  }, [orderId, role, clinicId, writer.uid]);

  if (loading) {
    return (
      <main className="min-h-screen">
        <div className="no-print">
          <AppNav />
        </div>
        <p className="px-6 py-16 text-center text-gray-600">Loading receipt...</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="min-h-screen">
        <div className="no-print">
          <AppNav />
        </div>
        <div className="px-6 py-16 text-center text-gray-600">
          <p>Could not load the receipt. {loadError}</p>
          <Link href="/register" className="mt-3 inline-block text-sm text-gray-900 underline">
            Back
          </Link>
        </div>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="min-h-screen">
        <div className="no-print">
          <AppNav />
        </div>
        <div className="px-6 py-16 text-center text-gray-600">
          <p>Order not found.</p>
          <Link href="/register" className="mt-3 inline-block text-sm text-gray-900 underline">
            Back
          </Link>
        </div>
      </main>
    );
  }

  if (noPayment || !receipt) {
    return (
      <main className="min-h-screen">
        <div className="no-print">
          <AppNav />
        </div>
        <div className="px-6 py-16 text-center text-gray-600">
          <p>No payment was recorded on this order, so there is no receipt to print.</p>
          <Link href={`/orders/${orderId}`} className="mt-3 inline-block text-sm text-gray-900 underline">
            Back to order
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen print:bg-white">
      <style>{RECEIPT_PAGE_CSS}</style>
      <div className="no-print">
        <AppNav />
        <div className="max-w-lg mx-auto px-6 py-8 flex flex-col gap-4">
          <button
            type="button"
            onClick={() => window.print()}
            className="lf-touch inline-flex w-fit items-center justify-center rounded-lg bg-gray-900 px-4 text-sm font-medium text-white hover:bg-gray-800"
          >
            Print receipt
          </button>
          <Link href="/register" className="text-sm text-gray-900 underline w-fit">
            Back to board
          </Link>
        </div>
      </div>
      <div className="py-8 print:py-0">
        <ReceiptPaper data={receipt} />
      </div>
    </main>
  );
}

export default function OrderReceipt() {
  return (
    <ProtectedRoute require={(role) => canViewPatients(role) || canViewOwnRegisteredPatients(role)}>
      <OrderReceiptContent />
    </ProtectedRoute>
  );
}
