"use client";

import AppNav from "./lib/AppNav";

export default function Home() {
  return (
    <main className="min-h-screen bg-white">
      <AppNav />

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
