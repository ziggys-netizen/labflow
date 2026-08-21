"use client";

import { useEffect, useState } from "react";
import ProtectedRoute from "../lib/ProtectedRoute";
import AppNav from "../lib/AppNav";
import { useAuth } from "../lib/AuthContext";
import { loadClinicNames } from "../lib/clinicScope";
import { roleDisplay } from "../lib/permissions";
import {
  USERNAME_RULES,
  UsernameTakenError,
  actorLabel,
  claimUsername,
  validateUsername,
} from "../lib/identity";

function ProfileContent() {
  const { user, role, username, clinicId, memberships, setActiveClinic } = useAuth();
  const [draft, setDraft] = useState(username ?? "");
  const [syncedUsername, setSyncedUsername] = useState(username);
  const [clinicNames, setClinicNames] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // The username arrives from a Firestore listener, so the field is reconciled
  // during render rather than in an effect, which would cost an extra pass.
  if (syncedUsername !== username) {
    setSyncedUsername(username);
    setDraft(username ?? "");
  }

  useEffect(() => {
    let cancelled = false;
    loadClinicNames(
      role,
      memberships.map((m) => m.clinicId)
    )
      .then((names) => {
        if (!cancelled) setClinicNames(names);
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [role, memberships]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setMessage("");
    setError("");

    const check = validateUsername(draft);
    if (!check.ok) {
      setError(check.error ?? "Invalid username.");
      return;
    }
    if (check.value === username) {
      setMessage("That is already your username.");
      return;
    }

    setSaving(true);
    try {
      const claimed = await claimUsername({
        uid: user.uid,
        username: check.value,
        previousUsername: username,
      });
      setMessage(`Username set to ${claimed}.`);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof UsernameTakenError
          ? err.message
          : "Could not save the username. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSwitch(next: string) {
    setMessage("");
    setError("");
    try {
      await setActiveClinic(next);
      setMessage("Active clinic changed.");
    } catch (err) {
      console.error(err);
      setError("Could not change the active clinic.");
    }
  }

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-2xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Your profile</h1>
        <p className="text-gray-600 mb-6">
          Your username is how the rest of LabFlow identifies you. You still sign in with your
          Google account.
        </p>

        {message && <p className="text-sm text-gray-600 mb-4">{message}</p>}
        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}

        <section className="border border-gray-200 rounded-lg p-4 mb-6">
          <h2 className="font-medium text-gray-900 mb-1">Username</h2>
          <p className="text-sm text-gray-600 mb-3">{USERNAME_RULES}</p>
          <form onSubmit={handleSave} className="flex flex-wrap items-center gap-3">
            <input
              type="text"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              placeholder="e.g. isaac.lab"
              maxLength={20}
              className="border border-gray-300 rounded-lg px-3 py-2 text-sm font-mono"
            />
            <button
              type="submit"
              disabled={saving}
              className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2 disabled:opacity-50"
            >
              {saving ? "Saving..." : username ? "Change username" : "Set username"}
            </button>
          </form>
          {!username && (
            <p className="text-xs text-gray-400 mt-3">
              Until you set one, your records are attributed to your account ID.
            </p>
          )}
        </section>

        <section className="border border-gray-200 rounded-lg p-4 mb-6">
          <h2 className="font-medium text-gray-900 mb-3">Clinic assignments</h2>
          {role === "owner" && (
            <p className="text-sm text-gray-600">
              Owner account — global access to every clinic. Owner accounts are never assigned to a
              clinic. Use the clinic selector in the header to operate inside a clinic for this
              session.
            </p>
          )}
          {role !== "owner" && memberships.length === 0 && (
            <p className="text-sm text-gray-600">You are not assigned to a clinic yet.</p>
          )}
          <div className="space-y-3">
            {memberships.map((m) => {
              const active = m.clinicId === clinicId;
              return (
                <div
                  key={m.clinicId}
                  className={`border rounded-lg p-3 ${
                    active ? "border-gray-900" : "border-gray-100"
                  }`}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="font-medium text-gray-900">
                        {clinicNames[m.clinicId] || m.clinicId}
                      </p>
                      <p className="text-sm text-gray-500">
                        {roleDisplay(m.role, m.shift)} · {m.status}
                      </p>
                      <p className="text-xs text-gray-400 mt-1">Clinic ID: {m.clinicId}</p>
                      {m.approvedAt && (
                        <p className="text-xs text-gray-400">
                          Approved by{" "}
                          {actorLabel(m.approvedByUsername || m.approvedByEmail || m.approvedByUid)}{" "}
                          on {new Date(m.approvedAt).toLocaleDateString()}
                        </p>
                      )}
                    </div>
                    {active ? (
                      <span className="text-xs uppercase tracking-wide text-gray-500 border border-gray-300 rounded px-2 py-1">
                        Active
                      </span>
                    ) : (
                      <button
                        onClick={() => handleSwitch(m.clinicId)}
                        disabled={m.status !== "approved"}
                        className="text-sm text-gray-900 underline disabled:text-gray-400 disabled:no-underline"
                      >
                        {m.status === "approved" ? "Make active" : "Awaiting approval"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="border border-gray-200 rounded-lg p-4">
          <h2 className="font-medium text-gray-900 mb-1">Sign-in account</h2>
          <p className="text-sm text-gray-600">
            You authenticate with Google as{" "}
            <span className="font-mono text-gray-900">{user?.email}</span>. This address is used for
            sign-in and account recovery only — it is not shown to other staff as your identity.
          </p>
        </section>
      </div>
    </main>
  );
}

export default function Profile() {
  return (
    <ProtectedRoute>
      <ProfileContent />
    </ProtectedRoute>
  );
}
