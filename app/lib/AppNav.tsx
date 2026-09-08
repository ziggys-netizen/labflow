"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAuth } from "./AuthContext";
import {
  canApproveResults,
  canDeletePatient,
  canEditTestCatalogue,
  canEnterResults,
  canManageStaff,
  canOrderTests,
  canRegisterPatient,
  canViewDashboard,
  canViewInventory,
  canViewOwnRegisteredPatients,
  canViewPatients,
  canViewTestValueRollup,
  roleLabel,
} from "./permissions";
import { loadClinicNames } from "./clinicScope";
import { useClinicCollection } from "./clinicListen";
import { loadPendingApprovalCount, subscribeStaffChanged } from "./staffOps";
import { SyncStatus } from "./ConnectionContext";
import { countResultsEntered } from "./reviewQueue";
import { useStaffSession } from "./pinSession";
import RetentionBanner from "./RetentionBanner";
import { formatHeaderIdentity, isNavActive } from "./headerIdentity";
import LabFlowWordmark from "./LabFlowWordmark";

type NavItem = {
  href: string;
  label: string;
  badge?: number;
};

function navClass(active: boolean) {
  return [
    "lf-touch inline-flex items-center justify-center gap-1 rounded-lf-sm px-[11px] py-[5px] text-sm font-medium",
    active
      ? "bg-lf-surface text-lf-ink ring-1 ring-inset ring-lf-line"
      : "text-lf-ink-2 hover:text-lf-ink",
  ].join(" ");
}

export default function AppNav() {
  const {
    user,
    role,
    username,
    clinicId,
    actingClinicId,
    actingClinicName,
    writeClinicId,
    memberships,
    setActiveClinic,
    setActingClinic,
    logout,
  } = useAuth();
  const { acting, lock, locked } = useStaffSession();
  const pathname = usePathname();
  const [clinicNames, setClinicNames] = useState<Record<string, string>>({});
  const [switching, setSwitching] = useState(false);
  const [pendingCount, setPendingCount] = useState(0);
  const [menuOpen, setMenuOpen] = useState(false);

  const owner = role === "owner";
  const internOnly = canRegisterPatient(role) && !canViewPatients(role);
  const accountsOnly = canViewTestValueRollup(role) && !canViewPatients(role) && !canViewInventory(role);
  const multiClinic = memberships.length > 1;
  const showOwnerPicker = owner;
  const hideSwitcherOnClinicWorkspace = !owner && pathname.startsWith("/owner/clinics/");
  const showStaffSwitcher = !owner && multiClinic && !hideSwitcherOnClinicWorkspace;
  const staffHref = "/staff";

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
    if (!owner) return;
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

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  const pendingBadge = owner ? pendingCount : 0;
  const canReview = canApproveResults(role);
  const reviewOrders = useClinicCollection("orders", role, clinicId, { enabled: canReview });
  const reviewBadge = countResultsEntered(
    reviewOrders.docs.map((docSnap) => {
      const data = docSnap.data();
      return {
        status: typeof data.status === "string" ? data.status : null,
        clinicId: typeof data.clinicId === "string" ? data.clinicId : null,
      };
    }),
    writeClinicId
  );

  const ownerClinicOptions = useMemo(
    () =>
      Object.entries(clinicNames)
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name)),
    [clinicNames]
  );

  const navItems = useMemo<NavItem[]>(() => {
    if (internOnly) {
      const items: NavItem[] = [{ href: "/register", label: "Register" }];
      if (canViewOwnRegisteredPatients(role)) {
        items.push({ href: "/patients", label: "My patients" });
      }
      return items;
    }
    const items: NavItem[] = [];
    if (canViewPatients(role)) items.push({ href: "/patients", label: "Patients" });
    if (canDeletePatient(role)) items.push({ href: "/patients/deleted", label: "Recycle bin" });
    if (canOrderTests(role) || canEnterResults(role)) items.push({ href: "/orders", label: "Orders" });
    if (canViewInventory(role)) items.push({ href: "/inventory", label: "Store" });
    if (canReview) items.push({ href: "/review", label: "Review", badge: reviewBadge });
    if (canViewDashboard(role)) items.push({ href: "/dashboard", label: "Dashboard" });
    if (canViewTestValueRollup(role)) items.push({ href: "/accounts", label: "Test value" });
    if (canEditTestCatalogue(role)) items.push({ href: "/settings", label: "Clinic Settings" });
    if (canManageStaff(role) && !owner) items.push({ href: staffHref, label: "Manage Staff" });
    if (owner) items.push({ href: "/owner", label: "Owner", badge: pendingBadge });
    return items;
  }, [internOnly, role, canReview, reviewBadge, owner, pendingBadge]);

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

  const homeHref = internOnly ? "/register" : accountsOnly ? "/accounts" : "/";
  const bannerName = actingClinicName || actingClinicId;
  const identityText = formatHeaderIdentity(
    acting?.displayName,
    username,
    roleLabel(acting?.role || role)
  );
  const showSessionControls = Boolean(user);
  const showMenu = navItems.length > 0 || showSessionControls;

  const clinicControls = (
    <>
      {showOwnerPicker && (
        <select
          value={actingClinicId ?? ""}
          onChange={(e) => setActingClinic(e.target.value || null)}
          aria-label="Acting clinic"
          className="lf-touch max-w-full border border-lf-line rounded-lf-sm bg-lf-surface px-2 text-sm text-lf-ink"
        >
          <option value="">No clinic selected</option>
          {actingClinicId && !ownerClinicOptions.some((c) => c.id === actingClinicId) && (
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
          className="lf-touch max-w-full border border-lf-line rounded-lf-sm bg-lf-surface px-2 text-sm text-lf-ink disabled:opacity-50"
        >
          {memberships.map((m) => (
            <option key={m.clinicId} value={m.clinicId}>
              {clinicNames[m.clinicId] || m.clinicId}
            </option>
          ))}
        </select>
      )}
    </>
  );

  const sessionActions = user ? (
    <>
      {acting && !locked && (
        <button
          type="button"
          onClick={lock}
          className="lf-touch inline-flex items-center justify-center rounded-lf-sm px-2 text-sm font-medium text-lf-accent"
        >
          Lock
        </button>
      )}
      <button
        type="button"
        onClick={logout}
        className="lf-touch inline-flex items-center justify-center rounded-lf-sm px-2 text-sm font-medium text-lf-accent"
      >
        Sign out
      </button>
    </>
  ) : (
    <Link
      href="/login"
      className="lf-touch inline-flex items-center justify-center rounded-lf-sm px-[11px] py-[5px] text-sm font-medium text-lf-accent"
    >
      Sign in
    </Link>
  );

  const identityLink = user ? (
    <Link
      href="/profile"
      title={identityText}
      className="lf-touch inline-flex max-w-[10rem] min-w-0 items-center sm:max-w-[16rem]"
    >
      <span className="font-mono text-xs uppercase tracking-wide text-lf-ink-3 truncate">
        {identityText}
      </span>
    </Link>
  ) : (
    sessionActions
  );

  const navLinks = (layout: "row" | "stack") => (
    <div className={layout === "row" ? "flex flex-wrap items-center justify-center gap-1" : "flex flex-col gap-1"}>
      {navItems.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          className={`${navClass(isNavActive(pathname, item.href))} ${layout === "stack" ? "w-full justify-start" : ""}`}
        >
          {item.label}
          {item.badge != null && item.badge > 0 && (
            <span className="min-w-5 h-5 px-1 rounded-full bg-lf-ink text-lf-surface text-[11px] font-medium inline-flex items-center justify-center">
              {item.badge > 99 ? "99+" : item.badge}
            </span>
          )}
        </Link>
      ))}
    </div>
  );

  return (
    <nav className="border-b border-lf-line bg-lf-ground">
      <div className="px-0 py-4">
        <div className="lf-shell flex items-center gap-4 min-w-0">
          <Link href={homeHref} className="lf-touch inline-flex shrink-0 items-center text-lf-ink">
            <LabFlowWordmark size="md" />
          </Link>

          <div className="hidden min-w-0 flex-1 lg:flex justify-center">{navLinks("row")}</div>

          <div className="ml-auto flex min-w-0 items-center justify-end gap-2">
            <div className="hidden lg:flex items-center gap-2">
              {clinicControls}
              {user ? identityLink : null}
              {user ? sessionActions : identityLink}
            </div>
            <div className="flex min-w-0 items-center gap-2 lg:hidden">
              {identityLink}
              {showMenu && (
                <button
                  type="button"
                  className="lf-touch inline-flex items-center justify-center rounded-lf-sm text-lf-accent"
                  aria-expanded={menuOpen}
                  aria-controls="app-nav-menu"
                  aria-label={menuOpen ? "Close menu" : "Open menu"}
                  onClick={() => setMenuOpen((open) => !open)}
                >
                  {menuOpen ? (
                    <span className="text-sm font-medium">Close</span>
                  ) : (
                    <span aria-hidden className="flex flex-col gap-1">
                      <span className="block h-px w-4 bg-current" />
                      <span className="block h-px w-4 bg-current" />
                      <span className="block h-px w-4 bg-current" />
                    </span>
                  )}
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {menuOpen && showMenu && (
        <div id="app-nav-menu" className="border-t border-lf-line bg-lf-surface lg:hidden">
          <div className="lf-shell flex flex-col gap-2 py-4">
            {navLinks("stack")}
            {user && (
              <div className="flex flex-col gap-2">
                {clinicControls}
                <div className="flex flex-wrap gap-2">{sessionActions}</div>
              </div>
            )}
          </div>
        </div>
      )}

      {owner && actingClinicId && (
        <div className="border-t border-lf-warn bg-lf-warn-soft px-0 py-2">
          <p className="lf-shell text-sm text-lf-ink">
            Acting in {bannerName} as platform owner. Actions are recorded.
          </p>
        </div>
      )}
      <SyncStatus />
      <RetentionBanner />
    </nav>
  );
}
