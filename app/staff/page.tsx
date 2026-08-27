"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from "../lib/ProtectedRoute";
import { useAuth } from "../lib/AuthContext";
import { isOwner } from "../lib/clinicScope";
import { canManageStaff } from "../lib/permissions";
import StaffPanel from "../lib/StaffPanel";

function StaffHome() {
  const { role } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClinicId = searchParams.get("clinicId");
  const owner = isOwner(role);

  useEffect(() => {
    if (!owner) return;
    router.replace(queryClinicId ? `/owner/clinics/${queryClinicId}/staff` : "/owner");
  }, [owner, queryClinicId, router]);

  if (owner) {
    return (
      <main className="min-h-screen flex items-center justify-center text-gray-600">Redirecting...</main>
    );
  }

  return <StaffPanel />;
}

export default function Staff() {
  return (
    <ProtectedRoute require={canManageStaff}>
      <Suspense
        fallback={
          <main className="min-h-screen flex items-center justify-center text-gray-600">Loading...</main>
        }
      >
        <StaffHome />
      </Suspense>
    </ProtectedRoute>
  );
}
