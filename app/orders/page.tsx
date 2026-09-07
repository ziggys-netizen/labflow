"use client";

import Link from "next/link";
import ProtectedRoute from "../lib/ProtectedRoute";
import AppNav from "../lib/AppNav";
import NotYetSynced from "../lib/NotYetSynced";
import { useAuth } from "../lib/AuthContext";
import { useClinicCollection } from "../lib/clinicListen";
import { canEnterResults, canOrderTests } from "../lib/permissions";
import { isOrderForDeletedPatient } from "../lib/patientSoftDelete";
import { patientsByIdFromDocs, resolvePatientNameById } from "../lib/patientDisplay";
import { orderCollectionFromData, type OrderTestRef, type SampleCollections } from "../lib/sampleCollection";
import { orderDisplayLabel } from "../lib/orderLifecycle";
import OperationalRow from "../lib/OperationalRow";
import { operationalFromOrderStage } from "../lib/operationalFlag";

interface Order {
  id: string;
  patientName: string;
  patientLabId: string;
  tests: OrderTestRef[];
  status: string;
  createdAt: string;
  sampleCollectedAt?: string | null;
  sampleCollections?: SampleCollections | null;
  recollectionOfOrderId: string | null;
  awaitingLabel: string;
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
  const patientsQuery = useClinicCollection("patients", role, clinicId, { enabled: allowed });
  const patientsById = patientsByIdFromDocs(patientsQuery.docs);

  const orders: Order[] = query.docs
    .filter((docSnap) => !isOrderForDeletedPatient(docSnap.data()))
    .map((docSnap) => {
      const data = docSnap.data();
      const parsed = orderCollectionFromData(docSnap.id, data, docSnap.metadata.hasPendingWrites);
      const patientId = typeof data.patientId === "string" ? data.patientId : "";
      return {
        id: parsed.id,
        patientName: resolvePatientNameById(patientId, patientsById) || "Unknown patient",
        patientLabId: data.patientLabId,
        tests: parsed.tests,
        status: parsed.status,
        createdAt: data.createdAt,
        sampleCollectedAt: parsed.sampleCollectedAt,
        sampleCollections: parsed.sampleCollections,
        recollectionOfOrderId:
          typeof data.recollectionOfOrderId === "string" ? data.recollectionOfOrderId : null,
        awaitingLabel: orderDisplayLabel(parsed).label,
        notYetSynced: parsed.notYetSynced,
      };
    });

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="lf-shell py-16">
        <h1 className="text-2xl font-semibold text-gray-900 mb-6">Test orders</h1>

        {query.loading && <p className="text-gray-600">Loading...</p>}
        {!query.loading && orders.length === 0 && <p className="text-gray-600">No orders yet.</p>}

        <div className="flex flex-col gap-3">
          {orders.map((o) => {
            const operational = operationalFromOrderStage(o);
            return (
              <Link
                key={o.id}
                href={`/orders/${o.id}`}
                className="block min-h-11"
              >
                <OperationalRow
                  state={operational.state}
                  label={operational.label}
                  className="p-4 hover:bg-lf-surface-2"
                >
                  <div className="flex flex-col gap-2">
                    <span className="inline-flex min-w-0 items-center gap-2 font-medium text-lf-ink">
                      <span className="truncate">{o.patientName}</span>
                      <NotYetSynced show={o.notYetSynced} />
                    </span>
                    <p className="lf-num truncate text-sm text-lf-ink-2" title={o.patientLabId}>
                      Lab ID: {o.patientLabId}
                    </p>
                    <p className="text-sm text-lf-ink">
                      Tests: {o.tests.map((t) => t.name || t.code).join(", ")}
                    </p>
                    <p className="text-sm text-lf-ink-3">{o.awaitingLabel}</p>
                  </div>
                </OperationalRow>
              </Link>
            );
          })}
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
