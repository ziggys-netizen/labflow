"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ProtectedRoute from "../../../../lib/ProtectedRoute";
import AppNav from "../../../../lib/AppNav";
import StaffPanel from "../../../../lib/StaffPanel";
import { useAuth } from "../../../../lib/AuthContext";
import { isOwner } from "../../../../lib/clinicScope";
import {
  canAccessClinicWorkspace,
  canManageStaff,
  landingPathForRole,
} from "../../../../lib/permissions";

function ClinicStaffContent() {
  const params = useParams();
  const clinicId = String(params.clinicId || "");
  const { role, clinicId: actorClinicId, setActingClinic } = useAuth();
  const owner = isOwner(role);
  const allowed = canAccessClinicWorkspace(role, actorClinicId, clinicId);

  useEffect(() => {
    if (owner && clinicId) setActingClinic(clinicId);
  }, [owner, clinicId, setActingClinic]);

  if (!allowed) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="max-w-sm mx-auto px-6 py-16 text-center">
          <p className="text-gray-600 mb-4">You can only manage staff for your own clinic.</p>
          <Link
            href={landingPathForRole(role, actorClinicId)}
            className="text-gray-900 underline font-medium"
          >
            Go to your workspace
          </Link>
        </div>
      </main>
    );
  }

  return <StaffPanel scopeClinicId={clinicId} />;
}

export default function ClinicStaffPage() {
  return (
    <ProtectedRoute require={canManageStaff}>
      <ClinicStaffContent />
    </ProtectedRoute>
  );
}
