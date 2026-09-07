"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth, useSessionAuthInput } from "../lib/AuthContext";
import { continuePathAfterAuth } from "../lib/authState";
import { consumeTermsDeclineNotice } from "../lib/legal/termsGate";

export default function Login() {
  const { user, login, loading, popupBlocked, authError } = useAuth();
  const session = useSessionAuthInput();
  const router = useRouter();
  const [error, setError] = useState("");
  const [signingIn, setSigningIn] = useState(false);
  const [declineMessage, setDeclineMessage] = useState("");

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

  useEffect(() => {
    const notice = consumeTermsDeclineNotice();
    if (notice) setDeclineMessage(notice);
  }, []);

  const failureMessage = authError || error;
  const continueHref = continuePathAfterAuth(session);

  useEffect(() => {
    if (loading || !user || continueHref === "/login") return;
    router.replace(continueHref);
  }, [loading, user, continueHref, router]);

  if (loading && !failureMessage && !signingIn) {
    return <main className="min-h-screen flex items-center justify-center text-gray-600">Loading...</main>;
  }

  if (user) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-sm w-full text-center">
          <p className="text-gray-600 mb-4">Continuing as {user.email}…</p>
          <Link href={continueHref} className="text-gray-900 underline font-medium">
            Continue
          </Link>
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
        {declineMessage && <p className="text-sm text-gray-700 mt-3">{declineMessage}</p>}
        {failureMessage && <p className="text-sm text-red-600 mt-3">{failureMessage}</p>}
      </div>
    </main>
  );
}
