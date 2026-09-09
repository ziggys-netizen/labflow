"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useAuth, useSessionAuthInput } from "../lib/AuthContext";
import { continuePathAfterAuth } from "../lib/authState";
import LabFlowWordmark from "../lib/LabFlowWordmark";
import { consumeTermsDeclineNotice } from "../lib/legal/termsGate";

export default function Login() {
  const { user, login, loading, popupBlocked, authError, bootstrapError, retryBootstrap } = useAuth();
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
    if (loading || bootstrapError || !user || continueHref === "/login") return;
    router.replace(continueHref);
  }, [loading, bootstrapError, user, continueHref, router]);

  // Animation runs during auth resolve only — never blocks redirect above.
  if (loading && !failureMessage && !signingIn) {
    return (
      <main className="min-h-screen flex items-center justify-center bg-lf-ground px-6">
        <LabFlowWordmark animate size="lg" />
      </main>
    );
  }

  if (bootstrapError) {
    return (
      <main className="min-h-screen bg-lf-ground flex items-center justify-center px-6">
        <div className="max-w-sm w-full text-center flex flex-col items-center gap-4">
          <LabFlowWordmark size="lg" />
          <p className="text-lf-ink-2">{bootstrapError}</p>
          <button
            type="button"
            onClick={retryBootstrap}
            className="w-full bg-lf-ink text-lf-surface rounded-lf-md py-2 font-medium hover:opacity-90 transition"
          >
            Retry
          </button>
        </div>
      </main>
    );
  }

  if (user) {
    return (
      <main className="min-h-screen bg-lf-ground flex items-center justify-center px-6">
        <div className="max-w-sm w-full text-center flex flex-col items-center gap-4">
          <LabFlowWordmark size="lg" />
          <p className="text-lf-ink-2">Continuing as {user.email}…</p>
          <Link href={continueHref} className="text-lf-ink underline font-medium">
            Continue
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-lf-ground flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center flex flex-col items-center gap-4">
        <LabFlowWordmark size="lg" />
        <p className="text-lf-ink-2">Sign in with your Google account to continue.</p>
        <button
          onClick={handleLogin}
          className="w-full bg-lf-ink text-lf-surface rounded-lf-md py-2 font-medium hover:opacity-90 transition"
        >
          {failureMessage || popupBlocked ? "Continue with Google" : "Sign in with Google"}
        </button>
        {declineMessage && <p className="text-sm text-lf-ink-2">{declineMessage}</p>}
        {failureMessage && <p className="text-sm text-lf-crit">{failureMessage}</p>}
      </div>
    </main>
  );
}
