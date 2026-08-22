"use client";

import { useState, type ReactNode } from "react";
import { useStaffSession, sensitiveActionLabel } from "./pinSession";
import type { SensitivePinAction } from "./pinIdentity";

export default function PinGate({ children }: { children: ReactNode }) {
  const { locked, needsSetup, ready, staffOptions, unlock, setOwnPin } = useStaffSession();
  const [uid, setUid] = useState("");
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  if (!ready) return <>{children}</>;
  if (!locked && !needsSetup) return <>{children}</>;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    const result = needsSetup ? await setOwnPin(pin) : await unlock(uid, pin);
    if (result) setError(result);
    setPin("");
    setBusy(false);
  }

  return (
    <>
      {children}
      <div className="fixed inset-0 z-50 bg-white/95 flex items-center justify-center px-6">
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
    const result = await confirmSensitivePin(pin);
    setBusy(false);
    if (result) {
      setError(result);
      return;
    }
    onConfirmed();
  }

  return (
    <div className="fixed inset-0 z-[60] bg-black/40 flex items-center justify-center px-6">
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
