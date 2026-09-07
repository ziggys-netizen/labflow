"use client";

import AppNav from "../../lib/AppNav";
import ProtectedRoute from "../../lib/ProtectedRoute";

function PrivacyContent() {
  return (
    <main className="min-h-screen bg-lf-ground">
      <AppNav />
      <div className="lf-shell flex flex-col gap-4 py-12">
        <h1 className="text-2xl font-semibold text-lf-ink">Privacy</h1>
        <p className="text-sm text-lf-ink-2 max-w-xl">
          The LabFlow privacy document is forthcoming. Questions about how your clinic
          handles personal information go to your clinic administrator.
        </p>
      </div>
    </main>
  );
}

export default function PrivacyPage() {
  return (
    <ProtectedRoute>
      <PrivacyContent />
    </ProtectedRoute>
  );
}
