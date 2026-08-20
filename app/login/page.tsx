"use client";

import { useAuth } from "../lib/AuthContext";
import { useState } from "react";

export default function Login() {
  const { user, login, loading } = useAuth();
  const [error, setError] = useState("");

  async function handleLogin() {
    setError("");
    try {
      await login();
    } catch (err: any) {
      console.error(err);
      setError(err?.message || "Sign-in failed. Please try again.");
    }
  }

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center text-gray-600">Loading...</main>;
  }

  if (user) {
    return (
      <main className="min-h-screen bg-white flex items-center justify-center px-6">
        <div className="max-w-sm w-full text-center">
          <p className="text-gray-600 mb-4">You're already signed in as {user.email}.</p>
          <a href="/patients" className="text-gray-900 underline font-medium">
            Go to Patients
          </a>
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
          Sign in with Google
        </button>
        {error && <p className="text-sm text-red-600 mt-3">{error}</p>}
      </div>
    </main>
  );
}
