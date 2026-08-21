"use client";

import Link from "next/link";
import { useAuth } from "../lib/AuthContext";
import { landingPathForRole } from "../lib/permissions";
import { useState } from "react";

export default function Login() {
  const { user, role, clinicId, login, loading, popupBlocked, authError } = useAuth();
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);

  async function handleLogin() {
    setError("");
    setSigningIn(true);
    try {
      await login();
    } catch (err: unknown) {
      console.error(err);
      const message = err instanceof Error ? err.message : "Sign-in failed. Please try again.";
      setError(message);
    } finally {
      setSigningIn(false);
    }
  }

  const failureMessage = authError || error;
  const workspaceHref = landingPathForRole(role, clinicId);

  if (loading && !failureMessage && !signingIn) {
    return <main className="min-h-screen flex items-center justify-center text-gray-600">Loading...</main>;
  }

  if (user) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-sm w-full text-center">
          <p className="text-gray-600 mb-4">You are already signed in as {user.email}.</p>
          <div className="flex flex-col items-center gap-2">
            {role === "owner" && (
              <Link href="/owner" className="text-gray-900 underline font-medium">
                Owner
              </Link>
            )}
            <Link href={workspaceHref} className="text-gray-900 underline font-medium">
              Go to your workspace
            </Link>
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">LabFlow Staff Login</h1>
        <p className="text-gray-600 mb-6">Sign in with your Google account to continue.</p>
        <button
          onClick={handleLogin}
          className="w-full bg-gray-900 text-white rounded-lg py-2 font-medium hover:bg-gray-800 transition"
        >
          {failureMessage || popupBlocked ? "Continue with Google" : "Sign in with Google"}
        </button>
        {failureMessage && <p className="text-sm text-red-600 mt-3">{failureMessage}</p>}
      </div>
    </main>
  );
}
