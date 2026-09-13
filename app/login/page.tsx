"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useAuth, useSessionAuthInput } from "../lib/AuthContext";
import { continuePathAfterAuth } from "../lib/authState";
import LabFlowWordmark from "../lib/LabFlowWordmark";
import { consumeTermsDeclineNotice } from "../lib/legal/termsGate";

function Stage({ children }: { children: ReactNode }) {
  return (
    <main className="min-h-screen flex items-center justify-center px-6">
      {children}
    </main>
  );
}

export default function Login() {
  const { user, login, loading, popupBlocked, authError, bootstrapError, termsError, retryBootstrap } =
    useAuth();
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
  const gateError = bootstrapError || termsError;

  useEffect(() => {
    if (loading || gateError || !user || continueHref === "/login") return;
    router.replace(continueHref);
  }, [loading, gateError, user, continueHref, router]);

  // Animation runs during auth resolve only — never blocks redirect above.
  if (loading && !failureMessage && !signingIn) {
    return (
      <Stage>
        <div className="lf-glass-panel px-10 py-8">
          <LabFlowWordmark animate size="lg" />
        </div>
      </Stage>
    );
  }

  if (gateError) {
    return (
      <Stage>
        <div className="lf-glass-panel max-w-sm w-full px-6 py-8 text-center flex flex-col items-center gap-4">
          <LabFlowWordmark size="lg" />
          <p className="text-lf-ink-2">{gateError}</p>
          <button
            type="button"
            onClick={retryBootstrap}
            className="w-full bg-lf-ink text-lf-surface rounded-lf-md py-2 font-medium hover:opacity-90 transition"
          >
            Retry
          </button>
        </div>
      </Stage>
    );
  }

  if (user) {
    return (
      <Stage>
        <div className="lf-glass-panel max-w-sm w-full px-6 py-8 text-center flex flex-col items-center gap-4">
          <LabFlowWordmark size="lg" />
          <p className="text-lf-ink-2">Continuing as {user.email}…</p>
          <Link href={continueHref} className="text-lf-ink underline font-medium">
            Continue
          </Link>
        </div>
      </Stage>
    );
  }

  return (
    <Stage>
      <div className="lf-glass-panel max-w-sm w-full px-6 py-8 text-center flex flex-col items-center gap-4">
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
    </Stage>
  );
}
