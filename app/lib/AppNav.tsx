"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useAuth } from "./AuthContext";
import {
  canEditCatalogue,
  canManageStaff,
  canViewDashboard,
  canViewInventory,
  isIntern,
  isStorekeeper,
} from "./permissions";
import { loadClinicNames } from "./clinicScope";

export default function AppNav() {
  const { user, role, username, clinicId, memberships, setActiveClinic, logout } = useAuth();
  const [clinicNames, setClinicNames] = useState<Record<string, string>>({});
  const [switching, setSwitching] = useState(false);

  const owner = role === "owner";
  const intern = isIntern(role);
  const multiClinic = memberships.length > 1;
  const showClinicSwitcher = owner || multiClinic;

  useEffect(() => {
    if (!showClinicSwitcher) return;
    let cancelled = false;
    loadClinicNames(
      role,
      memberships.map((m) => m.clinicId)
    )
      .then((names) => {
        if (!cancelled) setClinicNames(names);
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [showClinicSwitcher, role, memberships]);

  const ownerClinicOptions = useMemo(
    () =>
      Object.entries(clinicNames)
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [clinicNames]
  );

  async function handleClinicChange(next: string) {
    setSwitching(true);
    try {
      await setActiveClinic(next);
    } catch (err) {
      console.error(err);
    } finally {
      setSwitching(false);
    }
  }

  const showClinicalNav = !isStorekeeper(role) && !intern;
  const homeHref = intern ? "/register" : "/";

  return (
    <nav className="border-b border-gray-200 px-6 py-4">
      <div className="max-w-5xl mx-auto flex items-center justify-between">
        <Link href={homeHref} className="text-lg font-semibold text-gray-900">
          LabFlow
        </Link>
        <div className="flex items-center gap-4">
          {intern && (
            <Link href="/register" className="text-sm font-medium text-gray-700 hover:text-gray-900">
              Register
            </Link>
          )}
          {showClinicalNav && (
            <>
              <Link href="/patients" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                Patients
              </Link>
              <Link href="/orders" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                Orders
              </Link>
            </>
          )}
          {canViewInventory(role) && (
            <Link href="/inventory" className="text-sm font-medium text-gray-700 hover:text-gray-900">
              Store
            </Link>
          )}
          {canViewDashboard(role) && (
            <Link href="/dashboard" className="text-sm font-medium text-gray-700 hover:text-gray-900">
              Dashboard
            </Link>
          )}
          {canEditCatalogue(role) && (
            <Link href="/settings" className="text-sm font-medium text-gray-700 hover:text-gray-900">
              Clinic Settings
            </Link>
          )}
          {canManageStaff(role) && !owner && (
            <Link href="/staff" className="text-sm font-medium text-gray-700 hover:text-gray-900">
              Manage Staff
            </Link>
          )}
          {owner && (
            <Link href="/owner" className="text-sm font-medium text-gray-700 hover:text-gray-900">
              Owner
            </Link>
          )}
          {user ? (
            <div className="flex items-center gap-2">
              {showClinicSwitcher && (
                <select
                  value={clinicId ?? ""}
                  disabled={switching}
                  onChange={(e) => handleClinicChange(e.target.value)}
                  aria-label={owner ? "Acting clinic" : "Active clinic"}
                  className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 disabled:opacity-50"
                >
                  {owner && <option value="">All clinics</option>}
                  {owner
                    ? ownerClinicOptions.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name}
                        </option>
                      ))
                    : memberships.map((m) => (
                        <option key={m.clinicId} value={m.clinicId}>
                          {clinicNames[m.clinicId] || m.clinicId}
                        </option>
                      ))}
                </select>
              )}
              <Link
                href="/profile"
                className="text-sm text-gray-600 hover:text-gray-900 hover:underline"
              >
                {username || "Set username"}
              </Link>
              <button
                onClick={logout}
                className="text-sm font-medium text-gray-700 hover:text-gray-900 underline"
              >
                Sign out
              </button>
            </div>
          ) : (
            <Link href="/login" className="text-sm font-medium text-gray-700 hover:text-gray-900">
              Sign in
            </Link>
          )}
        </div>
      </div>
    </nav>
  );
}
