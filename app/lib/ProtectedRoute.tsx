"use client";

import { useAuth } from "./AuthContext";
import { useRouter } from "next/navigation";
import { useEffect, useRef } from "react";

export default function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const hasRedirected = useRef(false);

  useEffect(() => {
    if (!loading && !user && !hasRedirected.current) {
      hasRedirected.current = true;
      router.replace("/login");
    }
  }, [user, loading, router]);

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

  return <>{children}</>;
}
