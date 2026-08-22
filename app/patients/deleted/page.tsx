"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useState } from "react";
import ProtectedRoute from "../../lib/ProtectedRoute";
import AppNav from "../../lib/AppNav";
import { useAuth } from "../../lib/AuthContext";
import { getClinicDocs } from "../../lib/clinicScope";
import { canDeletePatient } from "../../lib/permissions";
import { isPatientDeleted, restorePatient } from "../../lib/patientSoftDelete";
import { auditTargetLabel } from "../../lib/audit";

interface DeletedPatient {
  id: string;
  clinicId: string;
  labId: string;
  name: string;
  deletedAt: string;
  deletedBy: string;
  deletedByRole: string;
  deletionReason: string;
}

function formatWhen(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function DeletedPatientsContent() {
  const { user, role, clinicId, shift } = useAuth();
  const [patients, setPatients] = useState<DeletedPatient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);

  const fetchDeleted = useCallback(async () => {
    try {
      const docs = await getClinicDocs("patients", role, clinicId, {
        sortBy: "deletedAt",
        direction: "desc",
      });
      startTransition(() => {
        setPatients(
          docs
            .filter((docSnap) => isPatientDeleted(docSnap.data()))
            .map((docSnap) => {
              const data = docSnap.data();
              return {
                id: docSnap.id,
                clinicId: data.clinicId || "",
                labId: data.labId || "—",
                name: data.name || "—",
                deletedAt: data.deletedAt || "",
                deletedBy: data.deletedBy || "—",
                deletedByRole: data.deletedByRole || "—",
                deletionReason: data.deletionReason || "—",
              };
            })
        );
      });
    } catch (err) {
      console.error(err);
      const detail = err instanceof Error ? ` ${err.message}` : "";
      startTransition(() => {
        setError(`Could not load deleted patients.${detail}`);
      });
    } finally {
      startTransition(() => {
        setLoading(false);
      });
    }
  }, [role, clinicId]);

  useEffect(() => {
    startTransition(() => {
      void fetchDeleted();
    });
  }, [fetchDeleted]);

  async function handleRestore(patient: DeletedPatient) {
    if (!user) return;
    const confirmed = window.confirm(
      `Restore ${patient.name}? The record will return to active lists and this action is logged.`
    );
    if (!confirmed) return;

    setRestoringId(patient.id);
    try {
      await restorePatient({
        patientId: patient.id,
        actor: { uid: user.uid, email: user.email, role, shift },
        role,
        clinicId,
        targetLabel: auditTargetLabel(patient.name, patient.labId),
        patientClinicId: patient.clinicId,
      });
      setPatients((prev) => prev.filter((p) => p.id !== patient.id));
    } catch (err) {
      console.error(err);
      alert("Could not restore patient. Please try again.");
    } finally {
      setRestoringId(null);
    }
  }

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Deleted patients</h1>
          <Link href="/patients" className="text-sm font-medium text-gray-900 underline">
            Back to patients
          </Link>
        </div>
        <p className="text-sm text-gray-600 mb-6">
          Removed records are retained and recoverable. There is no permanent delete.
        </p>

        {loading && <p className="text-gray-600">Loading...</p>}
        {error && <p className="text-red-600">{error}</p>}

        {!loading && !error && patients.length === 0 && (
          <p className="text-gray-600">No deleted patients.</p>
        )}

        {!loading && patients.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Clinic ID</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Lab ID</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Name</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Deleted by</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Role</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">When</th>
                  <th className="py-2 pr-4 font-medium text-gray-700">Why</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100 align-top">
                    <td
                      className="py-2 pr-4 text-gray-600 whitespace-nowrap font-mono text-xs"
                      title={p.clinicId}
                    >
                      {p.clinicId || "—"}
                    </td>
                    <td className="py-2 pr-4 text-gray-900 whitespace-nowrap">{p.labId}</td>
                    <td className="py-2 pr-4 text-gray-900 whitespace-nowrap">{p.name}</td>
                    <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{p.deletedBy}</td>
                    <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{p.deletedByRole}</td>
                    <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{formatWhen(p.deletedAt)}</td>
                    <td className="py-2 pr-4 text-gray-600">{p.deletionReason}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <button
                        onClick={() => handleRestore(p)}
                        disabled={restoringId === p.id}
                        className="text-gray-900 underline disabled:opacity-50"
                      >
                        {restoringId === p.id ? "Restoring..." : "Restore"}
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

export default function DeletedPatients() {
  return (
    <ProtectedRoute require={canDeletePatient}>
      <DeletedPatientsContent />
    </ProtectedRoute>
  );
}
