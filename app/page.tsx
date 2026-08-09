"use client";

import { useAuth } from "./lib/AuthContext";

export default function Home() {
  const { user, logout } = useAuth();

  return (
    <main className="min-h-screen bg-white">
      <nav className="border-b border-gray-200 px-6 py-4">
        <div className="max-w-5xl mx-auto flex items-center justify-between">
          <span className="text-lg font-semibold text-gray-900">LabFlow</span>
          <div className="flex items-center gap-4">
            <a href="/patients" className="text-sm font-medium text-gray-700 hover:text-gray-900">
              View patients
            </a>
            {user ? (
              <>
                <span className="text-sm text-gray-600">{user.email}</span>
                <button
                  onClick={logout}
                  className="text-sm font-medium text-gray-700 hover:text-gray-900"
                >
                  Sign out
                </button>
              </>
            ) : (
              <a href="/login" className="text-sm font-medium text-gray-700 hover:text-gray-900">
                Sign in
              </a>
            )}
          </div>
        </div>
      </nav>

      <section className="max-w-5xl mx-auto px-6 py-24 text-center">
        <h1 className="text-4xl sm:text-5xl font-semibold text-gray-900 tracking-tight">
          Laboratory management, built for quality
        </h1>
        <p className="mt-4 text-lg text-gray-600 max-w-2xl mx-auto">
          LabFlow helps clinical laboratories track patients, samples, and results — designed around WHO SLIPTA and ISO 15189 quality standards.
        </p>
        <div className="mt-8">
          <a href="/register" className="inline-block rounded-lg bg-gray-900 px-6 py-3 text-white font-medium hover:bg-gray-800 transition">Register a patient</a>
        </div>
      </section>
    </main>
  );
}
