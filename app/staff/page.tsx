"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { doc, getDoc } from "firebase/firestore";
import { useState } from "react";
import ProtectedRoute from "../lib/ProtectedRoute";
import StaffPanel from "../lib/StaffPanel";
import { useAuth } from "../lib/AuthContext";
import { isOwner } from "../lib/clinicScope";
import { db } from "../lib/firebase";

function StaffContent() {
  const { role, clinicId } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const owner = isOwner(role);
  const queryClinicId = searchParams.get("clinicId");
  const [joinCode, setJoinCode] = useState("");

  useEffect(() => {
    if (owner && !queryClinicId) {
      router.replace("/owner");
    }
  }, [owner, queryClinicId, router]);

  useEffect(() => {
    if (role !== "clinic_admin" || !clinicId) return;
    let cancelled = false;
    getDoc(doc(db, "clinics", clinicId))
      .then((snap) => {
        if (!cancelled && snap.exists()) setJoinCode(snap.data().joinCode || "");
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [role, clinicId]);

  if (owner && !queryClinicId) return null;

  return (
    <StaffPanel
      scopeClinicId={owner ? queryClinicId : clinicId}
      joinCode={role === "clinic_admin" ? joinCode : undefined}
    />
  );
}

export default function Staff() {
  return (
    <ProtectedRoute>
      <Suspense
        fallback={
          <main className="min-h-screen flex items-center justify-center text-gray-600">Loading...</main>
        }
      >
        <StaffContent />
      </Suspense>
    </ProtectedRoute>
  );
}
