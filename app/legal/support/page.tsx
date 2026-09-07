"use client";

import AppNav from "../../lib/AppNav";
import ProtectedRoute from "../../lib/ProtectedRoute";

const SUPPORT_EMAIL = process.env.NEXT_PUBLIC_SUPPORT_EMAIL?.trim() || "";

function SupportContent() {
  return (
    <main className="min-h-screen bg-lf-ground">
      <AppNav />
      <div className="lf-shell flex flex-col gap-4 py-12">
        <h1 className="text-2xl font-semibold text-lf-ink">Support</h1>
        <p className="text-sm text-lf-ink-2 max-w-xl">
          Questions about LabFlow at your clinic go to your clinic administrator.
        </p>
        {SUPPORT_EMAIL ? (
          <p className="text-sm text-lf-ink-2">
            Platform support:{" "}
            <a href={`mailto:${SUPPORT_EMAIL}`} className="text-lf-accent underline">
              {SUPPORT_EMAIL}
            </a>
          </p>
        ) : null}
      </div>
    </main>
  );
}

export default function SupportPage() {
  return (
    <ProtectedRoute>
      <SupportContent />
    </ProtectedRoute>
  );
}
