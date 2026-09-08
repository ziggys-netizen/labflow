"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import AppNav from "../lib/AppNav";
import ProtectedRoute from "../lib/ProtectedRoute";
import { useAuth } from "../lib/AuthContext";
import { canAccessClinicSettings, canEditTestCatalogue, landingPathForRole } from "../lib/permissions";

/**
 * Legacy /settings entry. Routes to Catalogue or Clinic admin from SURFACES.
 * Prefer deep links to /settings/catalogue and /settings/clinic.
 */
function SettingsRedirect() {
  const { role, clinicId, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (loading) return;
    if (canEditTestCatalogue(role)) {
      router.replace("/settings/catalogue");
      return;
    }
    if (canAccessClinicSettings(role)) {
      router.replace("/settings/clinic");
      return;
    }
    router.replace(landingPathForRole(role, clinicId));
  }, [loading, role, clinicId, router]);

  return (
    <main className="min-h-screen bg-lf-ground">
      <AppNav />
      <div className="min-h-[50vh] flex items-center justify-center text-gray-600">Redirecting...</div>
    </main>
  );
}

export default function Settings() {
  return (
    <ProtectedRoute
      require={(role) => canEditTestCatalogue(role) || canAccessClinicSettings(role)}
    >
      <SettingsRedirect />
    </ProtectedRoute>
  );
}
