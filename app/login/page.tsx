"use client";

import { useAuth } from "../lib/AuthContext";
import { useRouter } from "next/navigation";
import { useEffect } from "react";

export default function Login() {
  const { user, login, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push("/patients");
    }
  }, [user, loading, router]);

  return (
    <main className="min-h-screen bg-white flex items-center justify-center px-6">
      <div className="max-w-sm w-full text-center">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">LabFlow Staff Login</h1>
        <p className="text-gray-600 mb-6">Sign in with your Google account to continue.</p>
        <button
          onClick={login}
          className="w-full bg-gray-900 text-white rounded-lg py-2 font-medium hover:bg-gray-800 transition"
        >
          Sign in with Google
        </button>
      </div>
    </main>
  );
}
