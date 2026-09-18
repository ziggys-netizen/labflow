"use client";

import { useAuth, useSessionAuthInput } from "./AuthContext";
import { protectedRouteDestination, type RouteRequire } from "./authState";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef } from "react";
import LabFlowWordmark from "./LabFlowWordmark";

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
  const { user, loading, role, bootstrapError, termsError, authOffline, retryBootstrap } = useAuth();
  const session = useSessionAuthInput();
  const router = useRouter();
  const pathname = usePathname();
  const hasRedirected = useRef(false);
  const lastDest = useRef<string | null | undefined>(undefined);

  const gateError = bootstrapError || termsError;

  const dest =
    loading || gateError ? null : protectedRouteDestination(session, pathname, require);

  useEffect(() => {
    if (lastDest.current !== dest) {
      hasRedirected.current = false;
      lastDest.current = dest;
    }
  }, [dest]);

  useEffect(() => {
    if (loading || gateError) return;
    if (dest && pathname !== dest && !hasRedirected.current) {
      hasRedirected.current = true;
      router.replace(dest);
    }
  }, [loading, gateError, dest, pathname, router]);

  if (loading) {
    return <GateCard>Loading...</GateCard>;
  }

  if (gateError) {
    return (
      <GateCard alert>
        <span className="block">{gateError}</span>
        <button
          type="button"
          onClick={retryBootstrap}
          className="lf-touch mt-4 inline-flex w-full items-center justify-center rounded-lf-md bg-lf-ink px-4 font-medium text-lf-surface hover:opacity-90"
        >
          Retry
        </button>
      </GateCard>
    );
  }

  if (!user) {
    return <GateCard>Redirecting to sign in...</GateCard>;
  }

  if (dest && pathname !== dest) {
    return <GateCard>Redirecting...</GateCard>;
  }

  if (require && !require(role)) {
    return <GateCard>Redirecting...</GateCard>;
  }

  return (
    <>
      {authOffline && (
        <div className="no-print border-b border-amber-200 bg-amber-50 px-0 py-2">
          <p className="lf-shell text-sm text-amber-950">Offline. Using saved account details.</p>
        </div>
      )}
      {children}
    </>
  );
}

/**
 * Every waiting and "cannot reach" state sits on the same solid panel as the
 * sign-in card. Bare text over the moving laboratory scene was unreadable
 * wherever a tube passed behind it.
 */
function GateCard({ children, alert = false }: { children: React.ReactNode; alert?: boolean }) {
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <div className="lf-glass-panel flex w-full max-w-sm flex-col items-center gap-4 px-6 py-8 text-center">
        <LabFlowWordmark size="lg" />
        <div
          role={alert ? "alert" : "status"}
          aria-live={alert ? "assertive" : "polite"}
          className="w-full text-lf-ink"
        >
          {children}
        </div>
      </div>
    </main>
  );
}
