"use client";

import { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { deleteDoc, doc, getDoc, setDoc } from "firebase/firestore";
import ProtectedRoute from "../lib/ProtectedRoute";
import AppNav from "../lib/AppNav";
import PrintIcon from "../lib/PrintIcon";
import { useAuth } from "../lib/AuthContext";
import { getClinicDocs } from "../lib/clinicScope";
import { canRecordSampleCollection } from "../lib/permissions";
import {
  SAMPLE_COLLECTED_SOURCE,
  getPatientCollectionCheckboxState,
  sampleCollectedSourceFromData,
  type OrderCollectionFields,
} from "../lib/sampleCollection";

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
}

function sampleActionTitle(
  canCollect: boolean,
  state: ReturnType<typeof getPatientCollectionCheckboxState>
) {
  if (!canCollect) {
    return "Only a technician, lab manager or owner can record sample collection";
  }
  if (state.currentOrders.length === 0) {
    return "No current order is available; create or open an order to record collection";
  }
  if (state.uncollectedOrders.length === 1) {
    return "Record collection on the one current order still awaiting a sample";
  }
  if (state.uncollectedOrders.length > 1) {
    return "Multiple current orders await samples; open the intended order to record collection";
  }
  if (state.reversibleOrders.length === 1) {
    return "Undo the collection recorded from this patient-list checkbox";
  }
  return "Collection is recorded on the orders; open the intended order to change it";
}

function PatientsContent() {
  const { user, role, clinicId } = useAuth();
  const [patients, setPatients] = useState<Patient[]>([]);
  const [ordersByPatient, setOrdersByPatient] = useState<Record<string, OrderCollectionFields[]>>(
    {}
  );
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
        };
      });

      const grouped: Record<string, OrderCollectionFields[]> = {};
      for (const orderDoc of orderDocs) {
        const data = orderDoc.data();
        if (!data.patientId) continue;
        (grouped[data.patientId] ||= []).push({
          id: orderDoc.id,
          sampleCollectedAt: data.sampleCollectedAt || null,
          status: data.status || "pending",
          sampleCollectedSource: sampleCollectedSourceFromData(data),
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

  async function toggleSampleCollected(patient: Patient, collected: boolean) {
    if (!user || !canCollect) return;
    const state = getPatientCollectionCheckboxState(ordersByPatient[patient.id] || []);
    const target = collected
      ? state.uncollectedOrders.length === 1
        ? state.uncollectedOrders[0]
        : undefined
      : state.checked && state.reversibleOrders.length === 1
        ? state.reversibleOrders[0]
        : undefined;

    if (!target) return;

    setSavingSampleId(patient.id);
    const timestamp = collected ? new Date().toISOString() : null;
    const source = collected ? SAMPLE_COLLECTED_SOURCE.patientCheckbox : null;

    try {
      const orderRef = doc(db, "orders", target.id);
      const snapshot = await getDoc(orderRef);
      const current = snapshot.exists() ? snapshot.data() : null;
      const stillCurrent = current && (current.status || "pending") !== "approved";
      const canApply = collected
        ? Boolean(stillCurrent && current && !current.sampleCollectedAt)
        : Boolean(
            stillCurrent &&
              current?.sampleCollectedAt &&
              sampleCollectedSourceFromData(current) === SAMPLE_COLLECTED_SOURCE.patientCheckbox
          );

      if (!canApply) {
        await fetchPatients();
        return;
      }

      await setDoc(
        orderRef,
        {
          sampleCollectedAt: timestamp,
          sampleCollectedBy: collected ? user.email : null,
          sampleCollectedSource: source,
          sampleCollectionQuickAction: null,
        },
        { merge: true }
      );

      setOrdersByPatient((prev) => ({
        ...prev,
        [patient.id]: (prev[patient.id] || []).map((order) =>
          order.id === target.id
            ? {
                ...order,
                sampleCollectedAt: timestamp,
                sampleCollectedSource: source,
              }
            : order
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
                {patients.map((p) => {
                  const sampleState = getPatientCollectionCheckboxState(
                    ordersByPatient[p.id] || []
                  );
                  const sampleDisabled =
                    !canCollect || !sampleState.canToggle || savingSampleId === p.id;
                  return (
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
                            canCollect && sampleState.canToggle
                              ? "cursor-pointer"
                              : "cursor-not-allowed"
                          } ${canCollect ? "" : "opacity-60"}`}
                          title={sampleActionTitle(canCollect, sampleState)}
                        >
                          <input
                            type="checkbox"
                            checked={sampleState.checked}
                            ref={(el) => {
                              if (el) el.indeterminate = sampleState.indeterminate;
                            }}
                            disabled={sampleDisabled}
                            onChange={(e) => toggleSampleCollected(p, e.target.checked)}
                            className="h-4 w-4 accent-gray-900 disabled:opacity-50"
                          />
                          <span className="text-gray-700">Sample collected</span>
                        </label>
                      </td>
                    </tr>
                  );
                })}
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
