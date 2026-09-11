"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useAuth, useSessionAuthInput } from "../lib/AuthContext";
import { actorFromAuth } from "../lib/audit";
import { continuePathAfterAuth } from "../lib/authState";
import ProtectedRoute from "../lib/ProtectedRoute";
import TermsDocument from "../lib/TermsDocument";
import { ACCEPTABLE_USE } from "../lib/legal/acceptableUse";
import { recordTermsAcceptance } from "../lib/legal/termsAcceptanceStore";
import {
  TERMS_ACCEPT_CHECKBOX_LABEL,
  TERMS_DECLINE_MESSAGE,
  canSubmitTermsAcceptance,
  formatTermsUpdateNotice,
  persistTermsDeclineNotice,
  termsRecordedCaption,
} from "../lib/legal/termsGate";

function TermsGateContent() {
  const { user, role, shift, clinicId, logout, acceptCurrentTerms } = useAuth();
  const session = useSessionAuthInput();
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const [busy, setBusy] = useState(false);

  const documentVersion = ACCEPTABLE_USE.version;
  const versionKnown = canSubmitTermsAcceptance(documentVersion);
  const canSubmit = versionKnown && accepted && !busy;

  async function handleAccept() {
    if (!user || !clinicId || !canSubmit) return;
    const actor = actorFromAuth(user, role, shift);
    if (!actor) return;
    setBusy(true);
    try {
      await recordTermsAcceptance({
        uid: user.uid,
        clinicId,
        actor,
        version: documentVersion,
      });
    } catch (err) {
      console.error(err);
      // Offline queue is already the write path. Do not block the bench.
    }
    acceptCurrentTerms();
    router.replace(
      continuePathAfterAuth({
        ...session,
        acceptedTermsVersion: documentVersion,
        termsTimeoutGrace: false,
      })
    );
  }

  async function handleDecline() {
    persistTermsDeclineNotice();
    await logout();
    router.replace("/login");
  }

  return (
    <main className="min-h-screen bg-lf-ground">
      <div className="lf-shell flex flex-col gap-4 py-12">
        <h1 className="text-2xl font-semibold text-lf-ink">Before you start</h1>
        <p className="text-sm text-lf-ink-2">{formatTermsUpdateNotice()}</p>
        <TermsDocument />
        {!versionKnown ? (
          <p className="text-sm text-lf-ink-2">
            These terms cannot be accepted until their version is known. Speak to your clinic
            administrator.
          </p>
        ) : (
          <label className="flex items-start gap-3 text-sm text-lf-ink">
            <input
              type="checkbox"
              checked={accepted}
              onChange={(e) => setAccepted(e.target.checked)}
              className="mt-1 size-4"
            />
            <span>{TERMS_ACCEPT_CHECKBOX_LABEL}</span>
          </label>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={!canSubmit}
            onClick={() => void handleAccept()}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Accept and continue
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void handleDecline()}
            className="text-sm font-medium text-lf-ink-2 underline"
          >
            Decline
          </button>
        </div>
        <p className="sr-only">{TERMS_DECLINE_MESSAGE}</p>
        {versionKnown ? (
          <p className="font-mono text-[11px] uppercase text-lf-ink-3">
            {termsRecordedCaption(documentVersion)}
          </p>
        ) : null}
      </div>
    </main>
  );
}

export default function TermsPage() {
  return (
    <ProtectedRoute>
      <TermsGateContent />
    </ProtectedRoute>
  );
}
