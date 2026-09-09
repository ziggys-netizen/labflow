"use client";

import { useAuth, useSessionAuthInput } from "./AuthContext";
import { protectedRouteDestination, type RouteRequire } from "./authState";
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
  const { user, loading, role, bootstrapError, authOffline, retryBootstrap } = useAuth();
  const session = useSessionAuthInput();
  const router = useRouter();
  const pathname = usePathname();
  const hasRedirected = useRef(false);
  const lastDest = useRef<string | null | undefined>(undefined);

  const dest =
    loading || bootstrapError ? null : protectedRouteDestination(session, pathname, require);

  useEffect(() => {
    if (lastDest.current !== dest) {
      hasRedirected.current = false;
      lastDest.current = dest;
    }
  }, [dest]);

  useEffect(() => {
    if (loading || bootstrapError) return;
    if (dest && pathname !== dest && !hasRedirected.current) {
      hasRedirected.current = true;
      router.replace(dest);
    }
  }, [loading, bootstrapError, dest, pathname, router]);

  if (loading) {
    return (
      <main className="min-h-screen flex items-center justify-center text-gray-600">
        Loading...
      </main>
    );
  }

  if (bootstrapError) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-4 px-4 text-center">
        <p className="text-gray-800 max-w-md">{bootstrapError}</p>
        <button
          type="button"
          onClick={retryBootstrap}
          className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-900 hover:bg-gray-50"
        >
          Retry
        </button>
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

  return (
    <>
      {authOffline && (
        <div className="no-print border-b border-amber-200 bg-amber-50 px-0 py-2">
          <p className="lf-shell text-sm text-amber-950">Offline — using cached account details</p>
        </div>
      )}
      {children}
    </>
  );
}
