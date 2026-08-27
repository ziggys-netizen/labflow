"use client";

import { useEffect, useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useStaffSession, sensitiveActionLabel } from "./pinSession";
import type { SensitivePinAction } from "./pinIdentity";
import { useAuth } from "./AuthContext";
import { evaluateAuthState, sessionAuthInput } from "./authState";
import { BREAK_GLASS_CODES } from "./reasonCodes";
import ReasonCodeField from "./ReasonCodeField";
import { minutesUntil, rosterExpiryWarning } from "./roster";
import { isClinicAdmin } from "./permissions";

export default function PinGate({ children }: { children: ReactNode }) {
  const {
    locked,
    needsSetup,
    ready,
    staffOptions,
    unlock,
    setOwnPin,
    verifiedStaff,
    rosterDecision,
    startBreakGlass,
    openStaffManagement,
    driftWarning,
    rosterOffline,
  } = useStaffSession();
  const { user, role, status, clinicId, writeClinicId } = useAuth();
  const pathname = usePathname() || "";
  const [uid, setUid] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [reasonCode, setReasonCode] = useState("");
  const [reasonNote, setReasonNote] = useState("");
  const scopeClinic = writeClinicId || clinicId;
  // Spec: PIN is layer 4. This overlay must not render until pinApplies.
  const auth = evaluateAuthState(sessionAuthInput({ user, role, status, clinicId, writeClinicId }));
  const showRosterGate =
    ready &&
    !needsSetup &&
    locked &&
    !!verifiedStaff &&
    !!rosterDecision &&
    !rosterDecision.allowed;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = needsSetup ? await setOwnPin(pin) : await unlock(uid, pin);
    if (result) setError(result);
    setPin("");
    setBusy(false);
  }

  async function submitBreakGlass(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = await startBreakGlass(reasonCode, reasonNote);
    if (result) setError(result);
    setBusy(false);
  }

  if (!auth.pinApplies) return <>{children}</>;
  if (!ready) return <>{children}</>;
  if (!locked && !needsSetup) {
    return (
      <>
        <RosterExpiryBanner />
        {children}
      </>
    );
  }

  if (showRosterGate) {
    const admin = isClinicAdmin(verifiedStaff.role);
    return (
      <>
        {children}
        <div className="no-print fixed inset-0 z-50 bg-white/95 flex items-center justify-center px-6">
          <div className="w-full max-w-sm space-y-4">
            <h2 className="text-xl font-semibold text-gray-900">Outside your roster</h2>
            <p className="text-sm text-gray-600">{rosterDecision.message}</p>
            {driftWarning && <p className="text-sm text-amber-800">{driftWarning}</p>}
            {rosterOffline && (
              <p className="text-xs text-gray-500">
                This check is using the device clock and the roster cached on this device.
              </p>
            )}
            <form onSubmit={(e) => void submitBreakGlass(e)} className="space-y-3">
              <ReasonCodeField
                list={BREAK_GLASS_CODES}
                code={reasonCode}
                note={reasonNote}
                onCode={setReasonCode}
                onNote={setReasonNote}
                label="Why are you working outside your roster?"
              />
              {error && <p className="text-sm text-red-600">{error}</p>}
              <button
                type="submit"
                disabled={busy}
                className="w-full rounded-lg bg-gray-900 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                Work outside my roster
              </button>
            </form>
            {admin && (
              <div className="space-y-2">
                <button
                  type="button"
                  onClick={openStaffManagement}
                  className="w-full rounded-lg border border-gray-300 py-2 text-sm font-medium text-gray-800"
                >
                  Open staff management
                </button>
                {scopeClinic && !pathname.includes("/roster") && (
                  <Link
                    href={`/owner/clinics/${scopeClinic}/roster`}
                    onClick={openStaffManagement}
                    className="block text-center text-sm text-gray-700 underline"
                  >
                    Go to the roster
                  </Link>
                )}
              </div>
            )}
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      {children}
      <div className="no-print fixed inset-0 z-50 bg-white/95 flex items-center justify-center px-6">
        <form onSubmit={(e) => void submit(e)} className="w-full max-w-sm space-y-4">
          <h2 className="text-xl font-semibold text-gray-900">
            {needsSetup ? "Set your PIN" : "Unlock to work"}
          </h2>
          <p className="text-sm text-gray-600">
            {needsSetup
              ? "The Google sign-in is the device session. Your PIN is who you are on this bench."
              : "Select your name and enter your PIN. This works without internet."}
          </p>
          {!needsSetup && (
            <label className="block text-sm text-gray-700">
              Staff member
              <select
                value={uid}
                onChange={(e) => setUid(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
                required
              >
                <option value="">Select your name</option>
                {staffOptions.map((person) => (
                  <option key={person.uid} value={person.uid}>
                    {person.displayName}
                  </option>
                ))}
              </select>
            </label>
          )}
          <label className="block text-sm text-gray-700">
            {needsSetup ? "New 4–6 digit PIN" : "PIN"}
            <input
              type="password"
              inputMode="numeric"
              autoComplete="off"
              value={pin}
              onChange={(e) => setPin(e.target.value)}
              className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              required
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          <button
            type="submit"
            disabled={busy}
            className="w-full rounded-lg bg-gray-900 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {needsSetup ? "Save PIN" : "Unlock"}
          </button>
        </form>
      </div>
    </>
  );
}

function RosterExpiryBanner() {
  const { accessUntil, lock } = useStaffSession();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 15_000);
    return () => window.clearInterval(timer);
  }, []);

  const minutesLeft = minutesUntil(accessUntil ? new Date(accessUntil) : null, new Date(now));
  const warning = rosterExpiryWarning(minutesLeft);
  if (!warning || minutesLeft == null) return null;

  return (
    <div className="no-print border-b border-amber-200 bg-amber-50 px-6 py-2">
      <p className="max-w-5xl mx-auto text-sm text-amber-950">
        {warning === "2"
          ? "Your roster window ends in about two minutes. Unsaved results stay on this device."
          : "Your roster window ends in about ten minutes. Finish this entry, or you will need to unlock again."}{" "}
        <button type="button" onClick={lock} className="underline font-medium">
          Lock now
        </button>
      </p>
    </div>
  );
}

export function SensitivePinPrompt({
  action,
  onClose,
  onConfirmed,
}: {
  action: SensitivePinAction;
  onClose: () => void;
  onConfirmed: () => void;
}) {
  const { confirmSensitivePin } = useStaffSession();
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    const result = await confirmSensitivePin(pin, action);
    setBusy(false);
    if (result) {
      setError(result);
      return;
    }
    onConfirmed();
  }

  return (
    <div className="no-print fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-6">
      <form onSubmit={(e) => void submit(e)} className="w-full max-w-sm rounded-lg bg-white p-5 space-y-3">
        <h2 className="text-base font-semibold text-gray-900">Re-enter PIN</h2>
        <p className="text-sm text-gray-600">Required to {sensitiveActionLabel(action)}.</p>
        <input
          type="password"
          inputMode="numeric"
          autoComplete="off"
          value={pin}
          onChange={(e) => setPin(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-3 py-2"
          required
        />
        {error && <p className="text-sm text-red-600">{error}</p>}
        <div className="flex gap-3">
          <button
            type="submit"
            disabled={busy}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            Confirm
          </button>
          <button type="button" onClick={onClose} className="text-sm font-medium text-gray-700 underline">
            Cancel
          </button>
        </div>
      </form>
    </div>
  );
}
