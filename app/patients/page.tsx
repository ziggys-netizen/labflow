"use client";

import { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { collection, getDocs, orderBy, query, deleteDoc, doc } from "firebase/firestore";

interface Patient {
  id: string;
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

export default function Patients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [deletingId, setDeletingId] = useState<string | null>(null);

  async function fetchPatients() {
    try {
      const q = query(collection(db, "patients"), orderBy("createdAt", "desc"));
      const snapshot = await getDocs(q);
      const results: Patient[] = snapshot.docs.map((docSnap) => {
        const data = docSnap.data();
        return {
          id: docSnap.id,
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
      setPatients(results);
    } catch (err) {
      console.error(err);
      setError("Could not load patients.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchPatients();
  }, []);

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
    <main className="min-h-screen bg-white px-6 py-16">
      <div className="max-w-6xl mx-auto">
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