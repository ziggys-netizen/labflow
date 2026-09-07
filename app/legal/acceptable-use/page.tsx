"use client";

import AppNav from "../../lib/AppNav";
import ProtectedRoute from "../../lib/ProtectedRoute";
import TermsDocument from "../../lib/TermsDocument";
import { ACCEPTABLE_USE } from "../../lib/legal/acceptableUse";
import { formatTermsUpdateNotice, termsRecordedCaption } from "../../lib/legal/termsGate";

function AcceptableUseContent() {
  return (
    <main className="min-h-screen bg-lf-ground">
      <AppNav />
      <div className="lf-shell flex flex-col gap-4 py-12">
        <h1 className="text-2xl font-semibold text-lf-ink">{ACCEPTABLE_USE.title}</h1>
        <p className="text-sm text-lf-ink-2">{formatTermsUpdateNotice()}</p>
        <TermsDocument />
        <p className="font-mono text-[11px] uppercase text-lf-ink-3">
          {termsRecordedCaption()}
        </p>
      </div>
    </main>
  );
}

export default function AcceptableUsePage() {
  return (
    <ProtectedRoute>
      <AcceptableUseContent />
    </ProtectedRoute>
  );
}
