"use client";

import { useEffect, useState } from "react";
import ProtectedRoute from "../lib/ProtectedRoute";
import AppNav from "../lib/AppNav";
import { useAuth } from "../lib/AuthContext";
import ActingClinicPrompt from "../lib/ActingClinicPrompt";
import { isOwner } from "../lib/clinicScope";
import { subscribeDocument } from "../lib/clinicListen";
import { canViewTestValueRollup } from "../lib/permissions";
import {
  DAILY_TEST_VALUE_ROLLUPS,
  VALUE_OF_TESTS_ORDERED_LABEL,
  formatTestValue,
  localDateKey,
  parseDailyTestValueRollup,
  rollupDocumentId,
  type DailyTestValueRollup,
} from "../lib/dailyTestValueRollup";

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function AccountsContent() {
  const { role, clinicId, writeClinicId } = useAuth();
  const owner = isOwner(role);
  const scopeClinic = writeClinicId || clinicId;
  const [date, setDate] = useState(() => localDateKey());
  const [rollup, setRollup] = useState<DailyTestValueRollup | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!scopeClinic || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      setRollup(null);
      setLoading(false);
      setError("");
      return;
    }
    setLoading(true);
    const id = rollupDocumentId(scopeClinic, date);
    return subscribeDocument(
      DAILY_TEST_VALUE_ROLLUPS,
      id,
      (snap) => {
        const data = snap.exists() ? (snap.data() as Record<string, unknown>) : undefined;
        setRollup(parseDailyTestValueRollup(id, data));
        setError("");
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setError("Could not load the day’s test value.");
        setLoading(false);
      }
    );
  }, [scopeClinic, date]);

  const testCount = rollup?.testCount ?? 0;
  const value = rollup?.valueOfTestsOrdered ?? 0;
  const lines = rollup?.byTest ?? [];

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-5xl mx-auto px-6 py-8">
        <h1 className="text-2xl font-semibold text-gray-900">Day’s test value</h1>
        <p className="text-sm text-gray-600 mt-2 max-w-2xl">
          Counts and implied catalogue value of tests released on this day. Rejected samples are
          not included. A recollection of an episode that already carried a charge is not included.
          This is management information, not a book of account.
        </p>

        {owner && !scopeClinic && <div className="mt-6"><ActingClinicPrompt /></div>}

        <div className="mt-6">
          <label className="block text-sm font-medium text-gray-700 mb-1" htmlFor="accounts-date">
            Day
          </label>
          <input
            id="accounts-date"
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm text-gray-900"
          />
        </div>

        {error && <p className="text-sm text-red-800 mt-4">{error}</p>}

        {scopeClinic && (
          <>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-6">
              <Metric
                label="Tests released"
                value={loading ? "…" : String(testCount)}
                hint="Counted when results are released, not when they are ordered"
              />
              <Metric
                label={VALUE_OF_TESTS_ORDERED_LABEL}
                value={loading ? "…" : formatTestValue(value)}
                hint="Catalogue price at release. Not income."
              />
            </div>

            <h2 className="text-sm font-medium text-gray-900 mt-8 mb-2">Breakdown by test</h2>
            {loading && <p className="text-sm text-gray-600">Loading...</p>}
            {!loading && lines.length === 0 && (
              <p className="text-sm text-gray-600">No tests released on this day.</p>
            )}
            {!loading && lines.length > 0 && (
              <div className="overflow-x-auto border border-gray-200 rounded-lg">
                <table className="min-w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left">
                      <th className="py-2 px-3 font-medium text-gray-600">Code</th>
                      <th className="py-2 px-3 font-medium text-gray-600">Test</th>
                      <th className="py-2 px-3 font-medium text-gray-600">Count</th>
                      <th className="py-2 px-3 font-medium text-gray-600">{VALUE_OF_TESTS_ORDERED_LABEL}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.code} className="border-b border-gray-100 last:border-b-0">
                        <td className="py-2 px-3 text-gray-900">{line.code}</td>
                        <td className="py-2 px-3 text-gray-900">{line.name}</td>
                        <td className="py-2 px-3 text-gray-900">{line.count}</td>
                        <td className="py-2 px-3 text-gray-900">{formatTestValue(line.value)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function AccountsPage() {
  return (
    <ProtectedRoute require={canViewTestValueRollup}>
      <AccountsContent />
    </ProtectedRoute>
  );
}
