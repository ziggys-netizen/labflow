"use client";

import AppNav from "./lib/AppNav";
import LabScene from "./lib/LabScene";

export default function Home() {
  return (
    <main className="relative isolate min-h-screen">
      <LabScene />
      <AppNav />

      <section className="lf-shell py-16 sm:py-24">
        <div className="lf-glass-panel mx-auto max-w-3xl px-6 py-10 text-center sm:px-12 sm:py-14">
          <h1 className="text-4xl font-semibold tracking-tight text-lf-ink sm:text-5xl">
            Laboratory management, built for quality
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-lg text-lf-ink-2">
            LabFlow helps clinical laboratories track patients, samples, and results — designed around WHO SLIPTA and ISO 15189 quality standards.
          </p>
          <div className="mt-8">
            <a
              href="/register"
              className="lf-touch inline-flex w-full items-center justify-center rounded-lf-md bg-lf-ink px-6 font-medium text-lf-surface transition hover:opacity-90 sm:w-auto"
            >
              Register a patient
            </a>
          </div>
        </div>
      </section>
    </main>
  );
}
