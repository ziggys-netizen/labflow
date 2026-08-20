"use client";

import { useAuth } from "./AuthContext";
import { canViewDashboard } from "./permissions";

export default function AppNav() {
  const { user, role, logout } = useAuth();

  return (
    <nav className="border-b border-gray-200 px-6 py-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <a href="/" className="text-lg font-semibold text-gray-900">
          LabFlow
        </a>
        <div className="flex items-center gap-4">
          <a href="/patients" className="text-sm font-medium text-gray-700 hover:text-gray-900">
            Patients
          </a>
          <a href="/orders" className="text-sm font-medium text-gray-700 hover:text-gray-900">
            Orders
          </a>
          {canViewDashboard(role) && (
            <a href="/dashboard" className="text-sm font-medium text-gray-700 hover:text-gray-900">
              Dashboard
            </a>
          )}
          {role === "admin" && (
            <a href="/settings" className="text-sm font-medium text-gray-700 hover:text-gray-900">
              Clinic Settings
            </a>
          )}
          {(role === "owner" || role === "clinic_admin") && (
            <a href="/staff" className="text-sm font-medium text-gray-700 hover:text-gray-900">
              Manage Staff
            </a>
          )}
          {role === "owner" && (
            <a href="/owner" className="text-sm font-medium text-gray-700 hover:text-gray-900">
              Owner
            </a>
          )}
          {user ? (
            <div className="flex items-center gap-2">
              <span className="text-sm text-gray-600">{user.email}</span>
              <button
                onClick={logout}
                className="text-sm font-medium text-gray-700 hover:text-gray-900 underline"
              >
                Sign out
              </button>
            </div>
          ) : (
            <a href="/login" className="text-sm font-medium text-gray-700 hover:text-gray-900">
              Sign in
            </a>
          )}
        </div>
      </div>
    </nav>
  );
}
