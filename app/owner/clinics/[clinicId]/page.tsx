"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import ProtectedRoute from "../../../lib/ProtectedRoute";
import AppNav from "../../../lib/AppNav";
import { useAuth } from "../../../lib/AuthContext";
import { db } from "../../../lib/firebase";

interface Clinic {
  id: string;
  name: string;
  address: string;
  tin: string;
  businessRegNumber: string;
  responsiblePerson: string;
  joinCode: string;
}

function ClinicHubContent() {
  const params = useParams();
  const clinicId = params.clinicId as string;
  const { role, setActiveClinic } = useAuth();
  const [clinic, setClinic] = useState<Clinic | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (role === "owner" && clinicId) {
      setActiveClinic(clinicId).catch((err) => console.error(err));
    }
  }, [role, clinicId, setActiveClinic]);

  useEffect(() => {
    let cancelled = false;
    getDoc(doc(db, "clinics", clinicId))
      .then((snap) => {
        if (cancelled) return;
        if (!snap.exists()) {
          setClinic(null);
          return;
        }
        const data = snap.data();
        setClinic({
          id: snap.id,
          name: data.name || snap.id,
          address: data.address || "",
          tin: data.tin || "",
          businessRegNumber: data.businessRegNumber || "",
          responsiblePerson: data.responsiblePerson || "",
          joinCode: data.joinCode || "",
        });
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clinicId]);

  if (role !== "owner") {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="max-w-sm mx-auto px-6 py-16 text-center">
          <p className="text-gray-600 mb-4">You do not have access to this page.</p>
          <Link href="/patients" className="text-gray-900 underline font-medium">
            Go to Patients
          </Link>
        </div>
      </main>
    );
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="min-h-[50vh] flex items-center justify-center text-gray-600">Loading...</div>
      </main>
    );
  }

  if (!clinic) {
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
      <div className="max-w-3xl mx-auto px-6 py-16">
        <p className="text-sm text-gray-500 mb-2">
          <Link href="/owner" className="underline text-gray-900">
            Owner console
          </Link>
        </p>
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">{clinic.name}</h1>
        <p className="text-gray-600 mb-6">
          Working inside this clinic for this session. The owner account is not assigned a clinic
          role.
        </p>

        <section className="border border-gray-200 rounded-lg p-4 mb-6">
          {clinic.address && <p className="text-sm text-gray-700">{clinic.address}</p>}
          <p className="text-sm text-gray-500 mt-1">
            Join code: <span className="font-mono text-gray-900">{clinic.joinCode}</span>
          </p>
          {clinic.tin && <p className="text-sm text-gray-500">TIN: {clinic.tin}</p>}
          {clinic.businessRegNumber && (
            <p className="text-sm text-gray-500">Reg: {clinic.businessRegNumber}</p>
          )}
          {clinic.responsiblePerson && (
            <p className="text-sm text-gray-500">Responsible person: {clinic.responsiblePerson}</p>
          )}
          <p className="text-xs text-gray-400 mt-2">ID: {clinic.id}</p>
        </section>

        <div className="grid gap-3 sm:grid-cols-2">
          <Link
            href={`/owner/clinics/${clinic.id}/staff`}
            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
          >
            <p className="font-medium text-gray-900">Manage staff</p>
            <p className="text-sm text-gray-600 mt-1">Approve, assign roles, and review this clinic.</p>
          </Link>
          <Link
            href={`/owner/clinics/${clinic.id}/migration`}
            className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
          >
            <p className="font-medium text-gray-900">Run migration</p>
            <p className="text-sm text-gray-600 mt-1">
              Upload a spreadsheet, map columns, and import after confirm.
            </p>
          </Link>
          <Link href="/register" className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
            <p className="font-medium text-gray-900">Register a patient</p>
            <p className="text-sm text-gray-600 mt-1">Writes are stamped with this clinic.</p>
          </Link>
          <Link href="/orders" className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50">
            <p className="font-medium text-gray-900">Orders</p>
            <p className="text-sm text-gray-600 mt-1">Create and review orders for this clinic.</p>
          </Link>
        </div>
      </div>
    </main>
  );
}

export default function ClinicHubPage() {
  return (
    <ProtectedRoute>
      <ClinicHubContent />
    </ProtectedRoute>
  );
}
