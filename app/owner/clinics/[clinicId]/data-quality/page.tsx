"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import {
  addDoc,
  collection,
  deleteField,
  doc,
  getDocs,
  query,
  where,
  type DocumentData,
  type UpdateData,
} from "firebase/firestore";
import ProtectedRoute from "../../../../lib/ProtectedRoute";
import AppNav from "../../../../lib/AppNav";
import { useAuth } from "../../../../lib/AuthContext";
import { actorFromAuth, logAudit } from "../../../../lib/audit";
import { db } from "../../../../lib/firebase";
import { isOwner } from "../../../../lib/clinicScope";
import { landingPathForRole } from "../../../../lib/permissions";
import { loadClinic } from "../../../../lib/clinics";
import { isOrderForDeletedPatient } from "../../../../lib/patientSoftDelete";
import { orderCollectionFromData } from "../../../../lib/sampleCollection";
import { trackedUpdateDoc, writeActorFromUser } from "../../../../lib/trackedWrites";
import {
  AUDIT_CLEAR_COLLECTION_TIME,
  COLLECTION_SUSPICION_LABELS,
  COLLECTION_TIME_FIELDS_TO_DELETE,
  collectionClearExpected,
  findSuspiciousCollectionOrders,
  migrationHistoryClearCollectionEntry,
  type CollectionQualityOrder,
  type CollectionSuspicionReason,
  type SuspiciousCollectionOrder,
} from "../../../../lib/dataQuality";

function formatWhen(iso: string | null | undefined) {
  if (!iso) return "—";
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? iso : new Date(iso).toLocaleString();
}

function DataQualityContent() {
  const params = useParams();
  const clinicId = String(params.clinicId || "");
  const { user, role, username, shift, clinicId: actorClinicId, setActingClinic } = useAuth();
  const owner = isOwner(role);

  const [clinicName, setClinicName] = useState("");
  const [clinicMissing, setClinicMissing] = useState(false);
  const [orders, setOrders] = useState<CollectionQualityOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [keptIds, setKeptIds] = useState<Set<string>>(new Set());
  const [clearedIds, setClearedIds] = useState<Set<string>>(new Set());
  const [busyId, setBusyId] = useState<string | null>(null);

  useEffect(() => {
    if (owner && clinicId) setActingClinic(clinicId);
  }, [owner, clinicId, setActingClinic]);

  useEffect(() => {
    if (!owner || !clinicId) return;
    let cancelled = false;
    async function load() {
      setLoading(true);
      setStatus("");
      try {
        const [clinic, snapshot] = await Promise.all([
          loadClinic(clinicId),
          getDocs(query(collection(db, "orders"), where("clinicId", "==", clinicId))),
        ]);
        if (cancelled) return;
        if (!clinic) {
          setClinicMissing(true);
          setOrders([]);
          return;
        }
        setClinicMissing(false);
        setClinicName(clinic.name || clinicId);
        const rows: CollectionQualityOrder[] = [];
        for (const d of snapshot.docs) {
          const data = d.data();
          if (isOrderForDeletedPatient(data)) continue;
          const parsed = orderCollectionFromData(d.id, data);
          rows.push({
            id: parsed.id,
            patientName: typeof data.patientName === "string" ? data.patientName : "",
            patientLabId: typeof data.patientLabId === "string" ? data.patientLabId : "",
            createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
            reviewedAt: typeof data.reviewedAt === "string" ? data.reviewedAt : null,
            tests: parsed.tests,
            sampleCollectedAt: parsed.sampleCollectedAt,
            sampleCollections: parsed.sampleCollections,
          });
        }
        setOrders(rows);
      } catch (err) {
        console.error(err);
        if (!cancelled) setStatus("Could not load orders for this clinic.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [owner, clinicId]);

  const suspicious = useMemo(() => findSuspiciousCollectionOrders(orders), [orders]);
  const visible = suspicious.filter((row) => !keptIds.has(row.id) && !clearedIds.has(row.id));

  if (!owner) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="max-w-sm mx-auto px-6 py-16 text-center">
          <p className="text-gray-600 mb-4">Only the platform owner can repair collection times.</p>
          <Link href={landingPathForRole(role, actorClinicId)} className="text-gray-900 underline font-medium">
            Go to your workspace
          </Link>
        </div>
      </main>
    );
  }

  if (!clinicId) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="max-w-sm mx-auto px-6 py-16 text-center">
          <p className="text-gray-600 mb-4">Clinic not found.</p>
          <Link href="/owner" className="text-gray-900 underline font-medium">
            Owner console
          </Link>
        </div>
      </main>
    );
  }

  async function clearOrder(row: SuspiciousCollectionOrder) {
    if (!user || busyId) return;
    const confirmed = window.confirm(
      `Clear the collection time for ${row.patientName} (${row.patientLabId})?\n\nThe order returns to awaiting sample and drops out of turnaround until a real collection is recorded.`
    );
    if (!confirmed) return;

    setBusyId(row.id);
    setStatus("Clearing collection time...");
    try {
      const update: UpdateData<DocumentData> = {
        sampleCollections: {},
      };
      for (const field of COLLECTION_TIME_FIELDS_TO_DELETE) {
        update[field] = deleteField();
      }
      await trackedUpdateDoc(doc(db, "orders", row.id), update, {
        ...writeActorFromUser(user, username),
        operation: "update",
        summary: `Cleared collection time for ${row.patientName} (${row.patientLabId})`,
        clinicId,
        patientName: row.patientName,
        patientLabId: row.patientLabId,
        orderId: row.id,
        expected: collectionClearExpected(),
      });

      const actor = actorFromAuth(user, role, shift);
      const history = migrationHistoryClearCollectionEntry({
        clinicId,
        clinicName: clinicName || clinicId,
        orderId: row.id,
        patientName: row.patientName,
        patientLabId: row.patientLabId,
        createdAt: row.createdAt,
        clearedTimes: row.stampedTimes,
        reasons: row.reasons,
        actorEmail: user.email,
        actorUid: user.uid,
      });
      try {
        await addDoc(collection(db, "migrationHistory"), history);
      } catch (err) {
        console.error(err);
      }
      if (actor) {
        try {
          await logAudit({
            clinicId,
            actor,
            action: AUDIT_CLEAR_COLLECTION_TIME,
            targetCollection: "orders",
            targetId: row.id,
            targetLabel: [row.patientName, row.patientLabId].filter(Boolean).join(" — ") || row.id,
            detail: {
              reasons: row.reasons,
              clearedTimes: row.stampedTimes,
              createdAt: row.createdAt,
              reviewedAt: row.reviewedAt,
            },
          });
        } catch (err) {
          console.error(err);
        }
      }

      setClearedIds((prev) => new Set(prev).add(row.id));
      setStatus(`Cleared collection time for ${row.patientName} (${row.patientLabId}).`);
    } catch (err) {
      console.error(err);
      setStatus("Could not clear that collection time. Try again.");
    } finally {
      setBusyId(null);
    }
  }

  function keepOrder(row: SuspiciousCollectionOrder) {
    setKeptIds((prev) => new Set(prev).add(row.id));
    setStatus(`Kept collection time for ${row.patientName} (${row.patientLabId}) this visit.`);
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="min-h-[50vh] flex items-center justify-center text-gray-600">Loading...</div>
      </main>
    );
  }

  if (clinicMissing) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="max-w-sm mx-auto px-6 py-16 text-center">
          <p className="text-gray-600 mb-4">Clinic not found.</p>
          <Link href="/owner" className="text-gray-900 underline font-medium">
            Owner console
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-5xl mx-auto px-6 py-16">
        <p className="text-sm text-gray-500 mb-2">
          <Link href="/owner" className="underline text-gray-900">
            Owner console
          </Link>
          {" · "}
          <Link href={`/owner/clinics/${clinicId}`} className="underline text-gray-900">
            {clinicName || "Clinic"}
          </Link>
        </p>
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Collection time data quality</h1>
        <p className="text-gray-600 mb-6">
          Flags orders whose collection time is shared to the second with other orders, earlier
          than the order was created, or after result approval. Clearing returns the order to
          awaiting sample. It does not invent a replacement time. Confirm each row — there is no
          bulk clear.
        </p>
        {status && <p className="text-sm text-gray-600 mb-4">{status}</p>}

        {visible.length === 0 ? (
          <p className="text-sm text-gray-600">
            {suspicious.length === 0
              ? "No suspicious collection times in this clinic."
              : "No remaining suspicious rows this visit. Kept timestamps were not changed."}
          </p>
        ) : (
          <div className="overflow-x-auto border border-gray-200 rounded-lg">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-3 py-2 font-medium text-gray-700">Patient</th>
                  <th className="px-3 py-2 font-medium text-gray-700">Lab ID</th>
                  <th className="px-3 py-2 font-medium text-gray-700">Created</th>
                  <th className="px-3 py-2 font-medium text-gray-700">Stamped collection</th>
                  <th className="px-3 py-2 font-medium text-gray-700">Why flagged</th>
                  <th className="px-3 py-2 font-medium text-gray-700">Action</th>
                </tr>
              </thead>
              <tbody>
                {visible.map((row) => (
                  <tr key={row.id} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-3 text-gray-900">{row.patientName}</td>
                    <td className="px-3 py-3 font-mono text-xs text-gray-900">{row.patientLabId}</td>
                    <td className="px-3 py-3 text-gray-600 whitespace-nowrap">
                      {formatWhen(row.createdAt)}
                    </td>
                    <td className="px-3 py-3 text-gray-600">
                      {row.stampedTimes.map((iso) => formatWhen(iso)).join(" · ")}
                    </td>
                    <td className="px-3 py-3 text-gray-600">
                      {row.reasons
                        .map((reason: CollectionSuspicionReason) => COLLECTION_SUSPICION_LABELS[reason])
                        .join("; ")}
                    </td>
                    <td className="px-3 py-3 whitespace-nowrap">
                      <button
                        type="button"
                        onClick={() => void clearOrder(row)}
                        disabled={busyId !== null}
                        className="text-sm text-gray-900 underline disabled:opacity-50 mr-3"
                      >
                        {busyId === row.id ? "Clearing..." : "Clear collection time"}
                      </button>
                      <button
                        type="button"
                        onClick={() => keepOrder(row)}
                        disabled={busyId !== null}
                        className="text-sm text-gray-600 underline disabled:opacity-50"
                      >
                        Keep
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}

export default function DataQualityPage() {
  return (
    <ProtectedRoute require={(role) => role === "owner"}>
      <DataQualityContent />
    </ProtectedRoute>
  );
}
