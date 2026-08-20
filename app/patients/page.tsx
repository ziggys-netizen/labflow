"use client";

import { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { deleteDoc, doc, setDoc } from "firebase/firestore";
import ProtectedRoute from "../lib/ProtectedRoute";
import AppNav from "../lib/AppNav";
import PrintIcon from "../lib/PrintIcon";
import { useAuth } from "../lib/AuthContext";
import { getClinicDocs } from "../lib/clinicScope";
import { canRecordSampleCollection } from "../lib/permissions";

interface Patient {
  id: string;
  clinicId: string;
  labId: string;
  name: string;
  preferredName: string;
  sex: string;
  dob: string;
  phone: string;
  address: string;
  nationalId: string;
  nextOfKin: string;
  referringClinician: string;
  createdAt: string;
  sampleCollectedAt: string | null;
}

interface OrderSample {
  id: string;
  sampleCollectedAt: string | null;
}

function PatientsContent() {
  const { user, role, clinicId } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [ordersByPatient, setOrdersByPatient] = useState<Record<string, OrderSample[]>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingSampleId, setSavingSampleId] = useState<string | null>(null);

  const canCollect = canRecordSampleCollection(role);

  async function fetchPatients() {
    try {
      const [docs, orderDocs] = await Promise.all([
        getClinicDocs("patients", role, clinicId, { sortBy: "createdAt", direction: "desc" }),
        getClinicDocs("orders", role, clinicId),
      ]);
      const results: Patient[] = docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
          clinicId: data.clinicId || "",
          labId: data.labId || "—",
          name: data.name,
          preferredName: data.preferredName || "—",
          sex: data.sex || "—",
          dob: data.dob,
          phone: data.phone,
          address: data.address || "—",
          nationalId: data.nationalId || "—",
          nextOfKin: data.nextOfKin || "—",
          referringClinician: data.referringClinician || "—",
          createdAt: data.createdAt,
          sampleCollectedAt: data.sampleCollectedAt || null,
        };
      });

      const grouped: Record<string, OrderSample[]> = {};
      for (const orderDoc of orderDocs) {
        const data = orderDoc.data();
        if (!data.patientId) continue;
        (grouped[data.patientId] ||= []).push({
          id: orderDoc.id,
          sampleCollectedAt: data.sampleCollectedAt || null,
        });
      }

      setPatients(results);
      setOrdersByPatient(grouped);
    } catch (err) {
      console.error(err);
      const detail = err instanceof Error ? ` ${err.message}` : "";
      setError(`Could not load patients.${detail}`);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPatients();
  }, [role, clinicId]);

  function isSampleCollected(patient: Patient) {
    if (patient.sampleCollectedAt) return true;
    return (ordersByPatient[patient.id] || []).some((o) => o.sampleCollectedAt);
  }

  /**
   * The patient record holds the collection time so the checkbox survives a refresh even
   * before any test is ordered. It is also stamped onto that patient's orders still
   * awaiting a sample, because turnaround time is measured per order (PRD 5.4).
   * Unchecking only clears order stamps that match the time written here, so a collection
   * time entered by hand on the order page is never overwritten.
   */
  async function toggleSampleCollected(patient: Patient, collected: boolean) {
    if (!user || !canCollect) return;
    setSavingSampleId(patient.id);
    const previous = patient.sampleCollectedAt;
    const timestamp = collected ? new Date().toISOString() : null;
    try {
      await setDoc(
        doc(db, "patients", patient.id),
        { sampleCollectedAt: timestamp, sampleCollectedBy: collected ? user.email : null },
        { merge: true }
      );

      const orders = ordersByPatient[patient.id] || [];
      const affected = collected
        ? orders.filter((o) => !o.sampleCollectedAt)
        : orders.filter((o) => o.sampleCollectedAt && o.sampleCollectedAt === previous);

      await Promise.all(
        affected.map((o) =>
          setDoc(
            doc(db, "orders", o.id),
            { sampleCollectedAt: timestamp, sampleCollectedBy: collected ? user.email : null },
            { merge: true }
          )
        )
      );

      const affectedIds = new Set(affected.map((o) => o.id));
      setPatients((prev) =>
        prev.map((p) => (p.id === patient.id ? { ...p, sampleCollectedAt: timestamp } : p))
      );
      setOrdersByPatient((prev) => ({
        ...prev,
        [patient.id]: orders.map((o) =>
          affectedIds.has(o.id) ? { ...o, sampleCollectedAt: timestamp } : o
        ),
      }));
    } catch (err) {
      console.error(err);
      alert("Could not update sample collection status. Please try again.");
    } finally {
      setSavingSampleId(null);
    }
  }

  async function handleDelete(id: string, name: string) {
    const confirmed = window.confirm(`Delete ${name}? This cannot be undone.`);
    if (!confirmed) return;

    setDeletingId(id);
    try {
      await deleteDoc(doc(db, "patients", id));
      setPatients((prev) => prev.filter((p) => p.id !== id));
    } catch (err) {
      console.error(err);
      alert("Could not delete patient. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Patients</h1>
          <a href="/register" className="text-sm font-medium text-gray-900 underline">
            Register a patient
          </a>
        </div>

        {loading && <p className="text-gray-600">Loading...</p>}
        {error && <p className="text-red-600">{error}</p>}

        {!loading && !error && patients.length === 0 && (
          <p className="text-gray-600">No patients registered yet.</p>
        )}

        {!loading && patients.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="py-2 pr-2 w-8" aria-label="Print" />
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Clinic ID</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Lab ID</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Name</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Preferred name</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Sex</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">DOB</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Phone</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Address</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">National ID</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Next of kin</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Referring clinician</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => (
                  <tr key={p.id} className="border-b border-gray-100">
                    <td className="py-2 pr-2 align-middle">
                      <a
                        href={`/patients/${p.id}/print`}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Print record for ${p.name}`}
                        aria-label={`Print record for ${p.name}`}
                        className="inline-flex text-gray-500 hover:text-gray-900"
                      >
                        <PrintIcon />
                      </a>
                    </td>
                    <td
                      className="py-2 pr-4 text-gray-600 whitespace-nowrap font-mono text-xs"
                      title={p.clinicId}
                    >
                      {p.clinicId || "—"}
                    </td>
                    <td className="py-2 pr-4 text-gray-900 whitespace-nowrap">{p.labId}</td>
                    <td className="py-2 pr-4 text-gray-900 whitespace-nowrap">{p.name}</td>
                    <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{p.preferredName}</td>
                    <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{p.sex}</td>
                    <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{p.dob}</td>
                    <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{p.phone}</td>
                    <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{p.address}</td>
                    <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{p.nationalId}</td>
                    <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{p.nextOfKin}</td>
                    <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{p.referringClinician}</td>
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <a href={`/orders/new/${p.id}`} className="text-gray-900 underline mr-3">
                        Order tests
                      </a>
                      <button
                        onClick={() => handleDelete(p.id, p.name)}
                        disabled={deletingId === p.id}
                        className="text-red-600 hover:text-red-800 disabled:opacity-50"
                      >
                        {deletingId === p.id ? "Deleting..." : "Delete"}
                      </button>
                      <label
                        className={`inline-flex items-center gap-1.5 ml-3 ${
                          canCollect ? "cursor-pointer" : "cursor-not-allowed opacity-60"
                        }`}
                        title={
                          canCollect
                            ? "Mark that this patient's sample has been collected"
                            : "Only a technician, lab manager or owner can record sample collection"
                        }
                      >
                        <input
                          type="checkbox"
                          checked={isSampleCollected(p)}
                          disabled={!canCollect || savingSampleId === p.id}
                          onChange={(e) => toggleSampleCollected(p, e.target.checked)}
                          className="h-4 w-4 accent-gray-900 disabled:opacity-50"
                        />
                        <span className="text-gray-700">Sample collected</span>
                      </label>
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

export default function Patients() {
  return (
    <ProtectedRoute>
      <PatientsContent />
    </ProtectedRoute>
  );
}
