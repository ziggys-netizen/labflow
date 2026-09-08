"use client";

import Link from "next/link";
import { Suspense, useMemo } from "react";
import { useParams } from "next/navigation";
import ProtectedRoute from "../../../lib/ProtectedRoute";
import AppNav from "../../../lib/AppNav";
import { useAuth } from "../../../lib/AuthContext";
import { useClinicCollection } from "../../../lib/clinicListen";
import {
  dashboardQueueTile,
  filterDashboardQueue,
  isDashboardQueueSlug,
  type DashboardQueueOrder,
} from "../../../lib/dashboardQueue";
import { canViewDashboard } from "../../../lib/permissions";
import { isOrderForDeletedPatient, isPatientDeleted } from "../../../lib/patientSoftDelete";
import { parseAgeYears } from "../../../lib/resultFlag";
import { orderCollectionFromData } from "../../../lib/sampleCollection";
import type { LabTest } from "../../../lib/testCatalog";
import { CurrentQueueList } from "../../CurrentQueue";

type QueuePatient = {
  id: string;
  labId: string;
  name: string;
  preferredName: string;
  sex: string;
  dob: string;
  ageYears: number | null;
  ageMonths: number | null;
};

function parseAgeMonths(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const months = Number(value.trim());
    return Number.isFinite(months) ? months : null;
  }
  return null;
}

function orderForQueue(
  id: string,
  data: Record<string, unknown>,
  notYetSynced?: boolean
): DashboardQueueOrder {
  const parsed = orderCollectionFromData(id, data, notYetSynced);
  return {
    ...parsed,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
    resultsEnteredAt: typeof data.resultsEnteredAt === "string" ? data.resultsEnteredAt : null,
    reviewedAt: typeof data.reviewedAt === "string" ? data.reviewedAt : null,
    lastAmendedAt: typeof data.lastAmendedAt === "string" ? data.lastAmendedAt : null,
    recollectionOfOrderId:
      typeof data.recollectionOfOrderId === "string" ? data.recollectionOfOrderId : null,
    needsFinalReprint: data.needsFinalReprint === true,
    provisionalPrintedAt:
      typeof data.provisionalPrintedAt === "string" ? data.provisionalPrintedAt : null,
    criticalNotification: data.criticalNotification,
    results: (data.results as Record<string, Record<string, string>>) || null,
    patientId: typeof data.patientId === "string" ? data.patientId : null,
    patientLabId: typeof data.patientLabId === "string" ? data.patientLabId : null,
    patientSex: typeof data.patientSex === "string" ? data.patientSex : null,
  };
}

function QueueAllContent() {
  const { role, clinicId } = useAuth();
  const params = useParams<{ slug: string }>();
  const slugParam = typeof params.slug === "string" ? params.slug : "";
  const slug = isDashboardQueueSlug(slugParam) ? slugParam : null;
  const nowMs = useMemo(() => Date.now(), []);

  const ordersQuery = useClinicCollection("orders", role, clinicId, { enabled: Boolean(slug) });
  const patientsQuery = useClinicCollection("patients", role, clinicId, { enabled: Boolean(slug) });
  const catalogQuery = useClinicCollection("testCatalog", role, clinicId, { enabled: Boolean(slug) });

  const catalog = useMemo(
    () => catalogQuery.docs.map((docSnap) => docSnap.data() as LabTest),
    [catalogQuery.docs]
  );

  const orders = useMemo(
    () =>
      ordersQuery.docs
        .filter((docSnap) => !isOrderForDeletedPatient(docSnap.data()))
        .map((docSnap) => orderForQueue(docSnap.id, docSnap.data(), docSnap.metadata.hasPendingWrites)),
    [ordersQuery.docs]
  );

  const patientsById = useMemo(() => {
    const map = new Map<string, QueuePatient>();
    for (const docSnap of patientsQuery.docs) {
      if (isPatientDeleted(docSnap.data())) continue;
      const data = docSnap.data();
      map.set(docSnap.id, {
        id: docSnap.id,
        labId: typeof data.labId === "string" && data.labId ? data.labId : "—",
        name: typeof data.name === "string" && data.name ? data.name : "—",
        preferredName: typeof data.preferredName === "string" ? data.preferredName : "",
        sex: typeof data.sex === "string" ? data.sex : "",
        dob: typeof data.dob === "string" ? data.dob : "",
        ageYears: parseAgeYears(data.ageYears),
        ageMonths: parseAgeMonths(data.ageMonths),
      });
    }
    return map;
  }, [patientsQuery.docs]);

  const rows = useMemo(() => {
    if (!slug) return [];
    return filterDashboardQueue(orders, slug, catalog, nowMs);
  }, [slug, orders, catalog, nowMs]);

  const loading = ordersQuery.loading || patientsQuery.loading || catalogQuery.loading;

  if (!slug) {
    return (
      <main className="min-h-screen bg-lf-ground">
        <AppNav />
        <div className="lf-shell py-8">
          <p className="text-sm text-lf-ink-2">Unknown queue.</p>
          <Link href="/dashboard" className="mt-4 inline-flex text-sm font-medium text-lf-accent">
            Back to dashboard
          </Link>
        </div>
      </main>
    );
  }

  const tile = dashboardQueueTile(slug);

  return (
    <main className="min-h-screen bg-lf-ground">
      <AppNav />
      <div className="lf-shell flex flex-col gap-6 py-8">
        <div>
          <Link href={`/dashboard?queue=${slug}`} className="text-sm font-medium text-lf-accent">
            ← Current queue
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-lf-ink">{tile.label}</h1>
          <p className="text-sm text-lf-ink-3">{tile.hint}</p>
        </div>
        {loading ? (
          <p className="text-sm text-lf-ink-2">Loading…</p>
        ) : (
          <CurrentQueueList rows={rows} patientsById={patientsById} />
        )}
      </div>
    </main>
  );
}

export default function DashboardQueueAllPage() {
  return (
    <ProtectedRoute require={canViewDashboard}>
      <Suspense fallback={<main className="min-h-screen bg-lf-ground" />}>
        <QueueAllContent />
      </Suspense>
    </ProtectedRoute>
  );
}
