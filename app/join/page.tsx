"use client";

import { useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { authedPost, forceTokenRefresh } from "../lib/authApi";
import ProtectedRoute from "../lib/ProtectedRoute";

interface FoundClinic {
  name: string;
  code: string;
}

function JoinContent() {
  const { status, clinicId } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);
  const [match, setMatch] = useState<FoundClinic | null>(null);
  const [autoApproved, setAutoApproved] = useState(false);

  async function handleLookup(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setError("Enter a join code.");
      return;
    }

    setSaving(true);
    try {
      const res = await authedPost("/api/join/redeem", { joinCode: normalized });
      const data = (await res.json().catch(() => ({}))) as {
        found?: boolean;
        clinicName?: string;
        error?: string;
      };
      if (res.status === 401) {
        setError("Sign in required.");
        return;
      }
      if (res.status === 429) {
        setError(data.error || "Too many attempts. Try again in an hour.");
        return;
      }
      if (res.status === 503) {
        setError("Join is temporarily unavailable. Try again shortly.");
        return;
      }
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      if (!data.found) {
        setError("That code is not valid.");
        setMatch(null);
        return;
      }
      const name =
        typeof data.clinicName === "string" && data.clinicName.trim()
          ? data.clinicName.trim()
          : "this clinic";
      setMatch({ name, code: normalized });
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleConfirm() {
    if (!match) return;
    setError("");
    setSaving(true);
    try {
      const res = await authedPost("/api/join/confirm", { joinCode: match.code });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        autoApproved?: boolean;
      };
      if (!res.ok) {
        setError(data.error || "Something went wrong. Please try again.");
        return;
      }
      await forceTokenRefresh();
      setAutoApproved(Boolean(data.autoApproved));
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  function handleBack() {
    setMatch(null);
    setError("");
  }

  if (status === "approved" || autoApproved) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-sm w-full text-center">
          <p className="text-gray-600 mb-4">You already have access to LabFlow.</p>
          <a href="/patients" className="text-gray-900 underline font-medium">
            Continue
          </a>
        </div>
      </main>
    );
  }

  if (submitted || (status === "pending" && clinicId)) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-sm w-full text-center">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2">Request submitted</h1>
          <p className="text-gray-600">
            Your account is awaiting approval from your clinic administrator.
          </p>
        </div>
      </main>
    );
  }

  if (match) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-sm w-full">
          <h1 className="text-2xl font-semibold text-gray-900 mb-2 text-center">Confirm clinic</h1>
          <p className="text-gray-600 mb-6 text-center">
            You are requesting to join <span className="font-medium text-gray-900">{match.name}</span>.
            Confirm only if this is the clinic you work at.
          </p>
          <div className="space-y-3">
            <button
              type="button"
              onClick={handleConfirm}
              disabled={saving}
              className="w-full bg-gray-900 text-white rounded-lg py-2 font-medium hover:bg-gray-800 transition disabled:opacity-50"
            >
              {saving ? "Submitting..." : `Join ${match.name}`}
            </button>
            <button
              type="button"
              onClick={handleBack}
              disabled={saving}
              className="w-full border border-gray-300 text-gray-900 rounded-lg py-2 font-medium hover:bg-gray-50 transition disabled:opacity-50"
            >
              Use a different code
            </button>
            {error && <p className="text-sm text-red-600 text-center">{error}</p>}
          </div>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-sm w-full">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2 text-center">Join a clinic</h1>
        <p className="text-gray-600 mb-6 text-center">
          Enter the join code provided by your clinic administrator.
        </p>
        <form onSubmit={handleLookup} className="space-y-4">
          <input
            type="text"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder="JOIN CODE"
            maxLength={7}
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-center tracking-widest uppercase"
          />
          <button
            type="submit"
            disabled={saving}
            className="w-full bg-gray-900 text-white rounded-lg py-2 font-medium hover:bg-gray-800 transition disabled:opacity-50"
          >
            {saving ? "Checking..." : "Continue"}
          </button>
          {error && <p className="text-sm text-red-600 text-center">{error}</p>}
        </form>
      </div>
    </main>
  );
}

export default function Join() {
  return (
    <ProtectedRoute>
      <JoinContent />
    </ProtectedRoute>
  );
}
