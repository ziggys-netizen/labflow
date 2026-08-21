"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import ProtectedRoute from "../../../../lib/ProtectedRoute";
import AppNav from "../../../../lib/AppNav";
import StaffPanel from "../../../../lib/StaffPanel";
import { useAuth } from "../../../../lib/AuthContext";
import { db } from "../../../../lib/firebase";

interface Clinic {
  id: string;
  name: string;
  joinCode: string;
}

function ClinicStaffContent() {
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
        if (snap.exists()) {
          const data = snap.data();
          setClinic({
            id: snap.id,
            name: data.name || snap.id,
            joinCode: data.joinCode || "",
          });
        }
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
          <p className="text-gray-600 mb-4">Only the owner can open clinic staff from here.</p>
          <Link href="/staff" className="text-gray-900 underline font-medium">
            Manage Staff
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
          <p className="text-gray-600">Clinic not found.</p>
        </div>
      </main>
    );
  }

  return <StaffPanel scopeClinicId={clinicId} joinCode={clinic.joinCode} />;
}

export default function ClinicStaffPage() {
  return (
    <ProtectedRoute>
      <ClinicStaffContent />
    </ProtectedRoute>
  );
}
