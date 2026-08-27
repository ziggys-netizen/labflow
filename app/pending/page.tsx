"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "../lib/AuthContext";
import ProtectedRoute from "../lib/ProtectedRoute";
import { forceTokenRefresh, syncCustomClaims } from "../lib/authApi";
import { continuePathAfterAuth, sessionAuthInput } from "../lib/authState";

function PendingContent() {
  const { user, role, status, clinicId, writeClinicId, logout } = useAuth();
  const router = useRouter();
  const refreshing = useRef(false);
  const rejected = status === "rejected";

  useEffect(() => {
    if (status !== "approved" || !user || refreshing.current) return;
    refreshing.current = true;
    let cancelled = false;
    (async () => {
      try {
        await syncCustomClaims();
        await forceTokenRefresh();
      } catch (err) {
        console.error(err);
      }
      if (!cancelled) {
        router.replace(continuePathAfterAuth(sessionAuthInput({ user, role, status, clinicId, writeClinicId })));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [status, user, role, clinicId, writeClinicId, router]);

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          {rejected ? "Access declined" : "Awaiting approval"}
        </h1>
        <p className="text-gray-600 mb-6">
          {rejected
            ? "Your request to join this clinic was not approved. Contact your clinic administrator if you believe this is a mistake."
            : "Your account is awaiting approval from your clinic administrator."}
        </p>
        <button
          onClick={logout}
          className="text-sm font-medium text-gray-700 underline hover:text-gray-900"
        >
          Sign out
        </button>
      </div>
    </main>
  );
}

export default function Pending() {
  return (
    <ProtectedRoute>
      <PendingContent />
    </ProtectedRoute>
  );
}
