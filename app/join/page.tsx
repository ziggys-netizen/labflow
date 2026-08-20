"use client";

import { useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { db } from "../lib/firebase";
import { collection, query, where, getDocs, doc, updateDoc } from "firebase/firestore";
import ProtectedRoute from "../lib/ProtectedRoute";

function JoinContent() {
  const { user, status, clinicId } = useAuth();
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [saving, setSaving] = useState(false);

  async function handleJoin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    const normalized = code.trim().toUpperCase();
    if (!normalized) {
      setError("Enter a join code.");
      return;
    }
    if (!user) return;

    setSaving(true);
    try {
      const q = query(collection(db, "clinics"), where("joinCode", "==", normalized));
      const snapshot = await getDocs(q);
      const match = snapshot.docs.find((d) => d.data().active !== false);
      if (!match) {
        setError("That code is not valid.");
        return;
      }
      await updateDoc(doc(db, "users", user.uid), {
        clinicId: match.id,
      });
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      setError("Something went wrong. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  if (status === "approved") {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-sm w-full text-center">
          <p className="text-gray-600 mb-4">You already have access to LabFlow.</p>
          <a href="/patients" className="text-gray-900 underline font-medium">
            Go to Patients
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

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-sm w-full">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2 text-center">Join a clinic</h1>
        <p className="text-gray-600 mb-6 text-center">
          Enter the join code provided by your clinic administrator.
        </p>
        <form onSubmit={handleJoin} className="space-y-4">
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
            {saving ? "Checking..." : "Submit code"}
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
