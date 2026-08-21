"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthContext";
import {
  canDeletePatient,
  canEditTestCatalogue,
  canEnterResults,
  canManageStaff,
  canOrderTests,
  canRegisterPatient,
  canViewDashboard,
  canViewInventory,
  canViewPatients,
} from "./permissions";
import { loadClinicNames } from "./clinicScope";
import { loadPendingApprovalCount, subscribeStaffChanged } from "./staffOps";

export default function AppNav() {
  const {
    user,
    role,
    username,
    clinicId,
    actingClinicId,
    actingClinicName,
    memberships,
    setActiveClinic,
    setActingClinic,
    logout,
  } = useAuth();
  const pathname = usePathname();
  const [clinicNames, setClinicNames] = useState<Record<string, string>>({});
  const [switching, setSwitching] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);

  const owner = role === "owner";
  const internOnly = canRegisterPatient(role) && !canViewPatients(role);
  const multiClinic = memberships.length > 1;
  const showOwnerPicker = owner;
  const hideSwitcherOnClinicWorkspace = !owner && pathname.startsWith("/owner/clinics/");
  const showStaffSwitcher = !owner && multiClinic && !hideSwitcherOnClinicWorkspace;
  const staffHref = clinicId ? `/owner/clinics/${clinicId}/staff` : "/patients";

  useEffect(() => {
    if (!showOwnerPicker && !showStaffSwitcher) return;
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
  }, [showOwnerPicker, showStaffSwitcher, role, memberships]);

  useEffect(() => {
    if (!owner) {
      setPendingCount(0);
      return;
    }
    let cancelled = false;
    async function refresh() {
      try {
        const count = await loadPendingApprovalCount();
        if (!cancelled) setPendingCount(count);
      } catch (err) {
        console.error(err);
      }
    }
    refresh();
    const unsub = subscribeStaffChanged(refresh);
    return () => {
      cancelled = true;
      unsub();
    };
  }, [owner]);

  const ownerClinicOptions = useMemo(
    () =>
      Object.entries(clinicNames)
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [clinicNames]
  );

  async function handleStaffClinicChange(next: string) {
    setSwitching(true);
    try {
      await setActiveClinic(next);
    } catch (err) {
      console.error(err);
    } finally {
      setSwitching(false);
    }
  }

  const homeHref = internOnly ? "/register" : "/";
  const bannerName = actingClinicName || actingClinicId;

  return (
    <nav className="border-b border-gray-200">
      <div className="px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <Link href={homeHref} className="text-lg font-semibold text-gray-900">
            LabFlow
          </Link>
          <div className="flex items-center gap-4">
            {internOnly ? (
              <Link href="/register" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                Register
              </Link>
            ) : (
              <>
                {canViewPatients(role) && (
                  <Link href="/patients" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                    Patients
                  </Link>
                )}
                {canDeletePatient(role) && (
                  <Link href="/patients/deleted" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                    Recycle bin
                  </Link>
                )}
                {(canOrderTests(role) || canEnterResults(role)) && (
                  <Link href="/orders" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                    Orders
                  </Link>
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
                {canEditTestCatalogue(role) && (
                  <Link href="/settings" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                    Clinic Settings
                  </Link>
                )}
                {canManageStaff(role) && !owner && (
                  <Link href={staffHref} className="text-sm font-medium text-gray-700 hover:text-gray-900">
                    Manage Staff
                  </Link>
                )}
                {owner && (
                  <Link
                    href="/owner"
                    className="text-sm font-medium text-gray-700 hover:text-gray-900 inline-flex items-center gap-1.5"
                  >
                    Owner
                    {pendingCount > 0 && (
                      <span className="min-w-5 h-5 px-1 rounded-full bg-gray-900 text-white text-[11px] font-medium inline-flex items-center justify-center">
                        {pendingCount > 99 ? "99+" : pendingCount}
                      </span>
                    )}
                  </Link>
                )}
              </>
            )}
            {user ? (
              <div className="flex items-center gap-2">
                {showOwnerPicker && (
                  <select
                    value={actingClinicId ?? ""}
                    onChange={(e) => setActingClinic(e.target.value || null)}
                    aria-label="Acting clinic"
                    className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-700"
                  >
                    <option value="">No clinic selected</option>
                    {actingClinicId &&
                      !ownerClinicOptions.some((c) => c.id === actingClinicId) && (
                        <option value={actingClinicId}>{bannerName}</option>
                      )}
                    {ownerClinicOptions.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                )}
                {showStaffSwitcher && (
                  <select
                    value={clinicId ?? ""}
                    disabled={switching}
                    onChange={(e) => handleStaffClinicChange(e.target.value)}
                    aria-label="Active clinic"
                    className="border border-gray-300 rounded px-2 py-1 text-sm text-gray-700 disabled:opacity-50"
                  >
                    {memberships.map((m) => (
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
      </div>
      {owner && actingClinicId && (
        <div className="border-t border-amber-200 bg-amber-50 px-6 py-2">
          <p className="max-w-5xl mx-auto text-sm text-amber-950">
            Acting in {bannerName} as platform owner. Actions are recorded.
          </p>
        </div>
      )}
    </nav>
  );
}
