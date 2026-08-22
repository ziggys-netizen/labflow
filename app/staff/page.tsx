"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import ProtectedRoute from "../lib/ProtectedRoute";
import { useAuth } from "../lib/AuthContext";
import { isOwner } from "../lib/clinicScope";
import { canManageStaff, landingPathForRole } from "../lib/permissions";

function StaffRedirect() {
  const { role, clinicId } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryClinicId = searchParams.get("clinicId");

  useEffect(() => {
    if (isOwner(role)) {
      router.replace(queryClinicId ? `/owner/clinics/${queryClinicId}/staff` : "/owner");
      return;
    }
    router.replace(landingPathForRole(role, clinicId));
  }, [role, clinicId, queryClinicId, router]);

  return (
    <main className="min-h-screen flex items-center justify-center text-gray-600">Redirecting...</main>
  );
}

export default function Staff() {
  return (
    <ProtectedRoute require={canManageStaff}>
      <Suspense
        fallback={
          <main className="min-h-screen flex items-center justify-center text-gray-600">Loading...</main>
        }
      >
        <StaffRedirect />
      </Suspense>
    </ProtectedRoute>
  );
}
