"use client";

import Link from "next/link";
import AppNav from "../../lib/AppNav";
import ProtectedRoute from "../../lib/ProtectedRoute";
import ActingClinicPrompt from "../../lib/ActingClinicPrompt";
import { useAuth } from "../../lib/AuthContext";
import { isOwner } from "../../lib/clinicScope";
import { requireSurface } from "../../lib/surfaces";

function ClinicAdminContent() {
  const { role, clinicId, writeClinicId, loading } = useAuth();
  const scopeId = writeClinicId || clinicId;
  const needsClinic = isOwner(role) && !writeClinicId;

  if (loading) {
    return (
      <main className="min-h-screen bg-lf-ground">
        <AppNav />
        <div className="min-h-[50vh] flex items-center justify-center text-gray-600">Loading...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-lf-ground">
      <AppNav />
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Clinic admin</h1>
        <p className="text-gray-600 mb-6">
          Clinic profile, retention, join code, rostering, staff, and pre-approvals.
        </p>
        {needsClinic && <ActingClinicPrompt />}
        {!needsClinic && !scopeId && (
          <p className="text-sm text-gray-600">No clinic is active on this account.</p>
        )}
        {!needsClinic && scopeId && (
          <ul className="space-y-3 text-sm">
            <li>
              <Link
                href={`/owner/clinics/${scopeId}`}
                className="font-medium text-gray-900 underline"
              >
                Clinic profile
              </Link>
              <span className="text-gray-500"> — name, address, retention, join code, rostering</span>
            </li>
            <li>
              <Link
                href={role === "owner" ? `/owner/clinics/${scopeId}/staff` : "/staff"}
                className="font-medium text-gray-900 underline"
              >
                Staff management
              </Link>
              <span className="text-gray-500"> — roles, approvals, and pre-approvals</span>
            </li>
            <li>
              <Link
                href={`/owner/clinics/${scopeId}/roster`}
                className="font-medium text-gray-900 underline"
              >
                Roster
              </Link>
              <span className="text-gray-500"> — roster entries and exceptions</span>
            </li>
          </ul>
        )}
      </div>
    </main>
  );
}

export default function ClinicAdminSettings() {
  return (
    <ProtectedRoute require={requireSurface("clinicAdmin")}>
      <ClinicAdminContent />
    </ProtectedRoute>
  );
}
