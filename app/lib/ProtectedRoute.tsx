"use client";

import { useAuth } from "./AuthContext";
import { capabilityRedirect } from "./permissions";
import { useRouter, usePathname } from "next/navigation";
import { useEffect, useRef } from "react";

function getDestination(
  user: { uid: string } | null,
  role: string | null,
  status: string | null,
  clinicId: string | null,
  pathname: string
): string | null {
  if (!user) return "/login";
  if (role === "owner") return null;
  if (status === "pending" && !clinicId) return "/join";
  if (status === "pending" && clinicId) return "/pending";
  if (status === "rejected") return "/pending";
  const locked = capabilityRedirect(role, pathname);
  if (locked && pathname !== locked) return locked;
  return null;
}

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading, role, status, clinicId } = useAuth();
  const router = useRouter();
  const pathname = usePathname();
  const hasRedirected = useRef(false);
  const lastDest = useRef<string | null | undefined>(undefined);

  const dest = loading ? null : getDestination(user, role, status, clinicId, pathname);

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

  return <>{children}</>;
}
