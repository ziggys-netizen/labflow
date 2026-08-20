"use client";

import { useAuth } from "../lib/AuthContext";
import ProtectedRoute from "../lib/ProtectedRoute";

function PendingContent() {
  const { status, logout } = useAuth();
  const rejected = status === "rejected";

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
