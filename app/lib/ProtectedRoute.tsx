"use client";

import { useAuth } from "./AuthContext";
import { protectedRouteDestination, sessionAuthInput, type RouteRequire } from "./authState";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Optional page capability. P1 predicates (`canViewPatients`, …) are assignable.
 * Owner still bypasses login/pending/rejected destination checks; this `require`
 * still runs for owner unless the predicate itself includes owner.
 */
export type { RouteRequire };

export default function ProtectedRoute({
  children,
  require,
}: {
  children: React.ReactNode;
  require?: RouteRequire;
}) {
  const { user, loading, role, status, clinicId, writeClinicId } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const hasRedirected = useRef(false);
  const lastDest = useRef<string | null | undefined>(undefined);

  const dest = loading
    ? null
    : protectedRouteDestination(
        sessionAuthInput({ user, role, status, clinicId, writeClinicId }),
        pathname,
        require
      );

  useEffect(() => {
    if (lastDest.current !== dest) {
      hasRedirected.current = false;
      lastDest.current = dest;
    }
  }, [dest]);

  useEffect(() => {
    if (loading) return;
    if (dest && pathname !== dest && !hasRedirected.current) {
      hasRedirected.current = true;
      router.replace(dest);
    }
  }, [loading, dest, pathname, router]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center text-gray-600">
        Loading...
      </main>
    );
  }

  if (!user) {
    return (
      <main className="min-h-screen flex items-center justify-center text-gray-600">
        Redirecting to login...
      </main>
    );
  }

  if (dest && pathname !== dest) {
    return (
      <main className="min-h-screen flex items-center justify-center text-gray-600">
        Redirecting...
      </main>
    );
  }

  if (require && !require(role)) {
    return (
      <main className="min-h-screen flex items-center justify-center text-gray-600">
        Redirecting...
      </main>
    );
  }

  return <>{children}</>;
}
