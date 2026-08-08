"use client";

import { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { collection, getDocs, orderBy, query } from "firebase/firestore";

interface Patient {
  id: string;
  name: string;
  dob: string;
  phone: string;
  createdAt: string;
}

export default function Patients() {
  const [patients, setPatients] = useState<Patient[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    async function fetchPatients() {
      try {
        const q = query(collection(db, "patients"), orderBy("createdAt", "desc"));
        const snapshot = await getDocs(q);
        const results: Patient[] = snapshot.docs.map((doc) => {
          const data = doc.data();
          return {
            id: doc.id,
            name: data.name,
            dob: data.dob,
            phone: data.phone,
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
    fetchPatients();
  }, []);

  return (
    <main className="min-h-screen bg-white px-6 py-16">
      <div className="max-w-2xl mx-auto">
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
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-gray-300">
                <th className="py-2 pr-4 text-sm font-medium text-gray-700">Name</th>
                <th className="py-2 pr-4 text-sm font-medium text-gray-700">Date of birth</th>
                <th className="py-2 pr-4 text-sm font-medium text-gray-700">Phone</th>
              </tr>
            </thead>
            <tbody>
              {patients.map((p) => (
                <tr key={p.id} className="border-b border-gray-100">
                  <td className="py-2 pr-4 text-gray-900">{p.name}</td>
                  <td className="py-2 pr-4 text-gray-600">{p.dob}</td>
                  <td className="py-2 pr-4 text-gray-600">{p.phone}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </main>
  );
}