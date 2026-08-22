"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ProtectedRoute from "../../../../lib/ProtectedRoute";
import AppNav from "../../../../lib/AppNav";
import { useAuth } from "../../../../lib/AuthContext";
import {
  canAccessClinicWorkspace,
  canManageStaff,
  landingPathForRole,
  roleDisplay,
} from "../../../../lib/permissions";
import { isOwner } from "../../../../lib/clinicScope";
import { loadClinic } from "../../../../lib/clinics";
import {
  AUDIT_ACTIONS,
  auditLogsToCsv,
  defaultAuditDateFrom,
  defaultAuditDateTo,
  filterAuditLogs,
  loadClinicAuditLogs,
  localDayEndIso,
  localDayStartIso,
  type AuditLogRecord,
} from "../../../../lib/audit";

const PAGE_SIZE = 50;

function formatWhen(iso: string) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function ClinicAuditContent() {
  const params = useParams();
  const clinicId = String(params.clinicId || "");
  const { role, clinicId: actorClinicId, setActingClinic } = useAuth();
  const owner = isOwner(role);
  const allowed = canAccessClinicWorkspace(role, actorClinicId, clinicId);

  useEffect(() => {
    if (owner && clinicId) setActingClinic(clinicId);
  }, [owner, clinicId, setActingClinic]);

  if (!allowed) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="max-w-sm mx-auto px-6 py-16 text-center">
          <p className="text-gray-600 mb-4">You can only open your own clinic audit log.</p>
          <Link
            href={landingPathForRole(role, actorClinicId)}
            className="text-gray-900 underline font-medium"
          >
            Go to your workspace
          </Link>
        </div>
      </main>
    );
  }

  return <ClinicAuditViewer key={clinicId} clinicId={clinicId} owner={owner} />;
}

function ClinicAuditViewer({ clinicId, owner }: { clinicId: string; owner: boolean }) {
  const [clinicName, setClinicName] = useState("");
  const [dateFrom, setDateFrom] = useState(defaultAuditDateFrom);
  const [dateTo, setDateTo] = useState(defaultAuditDateTo);
  const [actionFilter, setActionFilter] = useState("");
  const [actorFilter, setActorFilter] = useState("");
  const [appliedFrom, setAppliedFrom] = useState(defaultAuditDateFrom);
  const [appliedTo, setAppliedTo] = useState(defaultAuditDateTo);
  const [rows, setRows] = useState<AuditLogRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        const [clinic, logs] = await Promise.all([
          loadClinic(clinicId),
          loadClinicAuditLogs(clinicId, {
            startAt: localDayStartIso(appliedFrom),
            endAt: localDayEndIso(appliedTo),
          }),
        ]);
        if (cancelled) return;
        setClinicName(clinic?.name || clinicId);
        setRows(logs);
        setPage(0);
        setError("");
      } catch (err) {
        console.error(err);
        if (cancelled) return;
        setError("Could not load the audit log.");
        setRows([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void load();
    return () => {
      cancelled = true;
    };
  }, [clinicId, appliedFrom, appliedTo]);

  const filtered = useMemo(
    () => filterAuditLogs(rows, { action: actionFilter, actorUid: actorFilter }),
    [rows, actionFilter, actorFilter]
  );

  const actors = useMemo(() => {
    const seen = new Map<string, { uid: string; label: string }>();
    for (const row of rows) {
      if (!row.actorUid || seen.has(row.actorUid)) continue;
      const who = row.actorEmail || row.actorUid;
      const role = roleDisplay(row.actorRole, row.actorShift);
      seen.set(row.actorUid, { uid: row.actorUid, label: role ? `${who} (${role})` : who });
    }
    return [...seen.values()].sort((a, b) => a.label.localeCompare(b.label));
  }, [rows]);

  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount - 1);
  const pageRows = filtered.slice(currentPage * PAGE_SIZE, currentPage * PAGE_SIZE + PAGE_SIZE);

  function applyDates(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
  }

  function downloadCsv() {
    const csv = auditLogsToCsv(filtered);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `audit-${clinicId}-${appliedFrom}-to-${appliedTo}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-6xl mx-auto px-6 py-16">
        {owner && (
          <p className="text-sm text-gray-500 mb-2">
            <Link href="/owner" className="underline text-gray-900">
              Owner console
            </Link>
            {" · "}
            <Link href={`/owner/clinics/${clinicId}`} className="underline text-gray-900">
              Clinic profile
            </Link>
          </p>
        )}
        {!owner && (
          <p className="text-sm text-gray-500 mb-2">
            <Link href={`/owner/clinics/${clinicId}`} className="underline text-gray-900">
              Clinic profile
            </Link>
            {" · "}
            <Link href={`/owner/clinics/${clinicId}/staff`} className="underline text-gray-900">
              Staff
            </Link>
          </p>
        )}
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Audit log</h1>
        <p className="text-gray-600 mb-6">
          {clinicName || clinicId}. Entries start when logging was turned on. Earlier actions are
          not backfilled. This clinic only.
        </p>

        <form onSubmit={applyDates} className="flex flex-wrap items-end gap-3 mb-4">
          <label className="text-sm text-gray-700">
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(e) => setDateFrom(e.target.value)}
              className="mt-1 block border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <label className="text-sm text-gray-700">
            To
            <input
              type="date"
              value={dateTo}
              onChange={(e) => setDateTo(e.target.value)}
              className="mt-1 block border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </label>
          <button
            type="submit"
            className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2"
          >
            Apply dates
          </button>
          <label className="text-sm text-gray-700">
            Action
            <select
              value={actionFilter}
              onChange={(e) => {
                setActionFilter(e.target.value);
                setPage(0);
              }}
              className="mt-1 block border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[14rem]"
            >
              <option value="">All actions</option>
              {AUDIT_ACTIONS.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
          </label>
          <label className="text-sm text-gray-700">
            Actor
            <select
              value={actorFilter}
              onChange={(e) => {
                setActorFilter(e.target.value);
                setPage(0);
              }}
              className="mt-1 block border border-gray-300 rounded-lg px-3 py-2 text-sm min-w-[14rem]"
            >
              <option value="">All actors</option>
              {actors.map((actor) => (
                <option key={actor.uid} value={actor.uid}>
                  {actor.label}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={downloadCsv}
            disabled={loading || filtered.length === 0}
            className="text-sm text-gray-900 underline disabled:opacity-50"
          >
            Download CSV
          </button>
        </form>

        {error && <p className="text-sm text-red-600 mb-4">{error}</p>}
        {loading && <p className="text-gray-600">Loading...</p>}
        {!loading && filtered.length === 0 && (
          <p className="text-sm text-gray-600">No audit entries in this range.</p>
        )}
        {!loading && filtered.length > 0 && (
          <>
            <p className="text-sm text-gray-500 mb-3">
              {filtered.length} {filtered.length === 1 ? "entry" : "entries"}
              {filtered.length !== rows.length ? ` (of ${rows.length} in date range)` : ""}
            </p>
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="w-full text-sm text-left">
                <thead>
                  <tr className="text-xs uppercase tracking-wide text-gray-500 bg-gray-50">
                    <th className="py-2 px-3 font-medium">When</th>
                    <th className="py-2 px-3 font-medium">Action</th>
                    <th className="py-2 px-3 font-medium">Actor</th>
                    <th className="py-2 px-3 font-medium">Target</th>
                    <th className="py-2 px-3 font-medium">Detail</th>
                  </tr>
                </thead>
                <tbody>
                  {pageRows.map((row) => (
                    <tr key={row.id} className="border-t border-gray-100 align-top">
                      <td className="py-2 px-3 whitespace-nowrap text-gray-700">{formatWhen(row.at)}</td>
                      <td className="py-2 px-3 font-mono text-gray-900">{row.action}</td>
                      <td className="py-2 px-3 text-gray-700">
                        <div>{row.actorEmail || row.actorUid || "—"}</div>
                        <div className="text-xs text-gray-500">
                          {roleDisplay(row.actorRole, row.actorShift) || "—"}
                          {row.actingAsOwner ? " · acting as owner" : ""}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-gray-700">
                        <div>{row.targetLabel || row.targetId || "—"}</div>
                        <div className="text-xs text-gray-500">
                          {row.targetCollection}
                          {row.targetId ? ` / ${row.targetId}` : ""}
                        </div>
                      </td>
                      <td className="py-2 px-3 text-xs text-gray-600 font-mono whitespace-pre-wrap">
                        {row.detail ? JSON.stringify(row.detail) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {pageCount > 1 && (
              <div className="flex items-center gap-3 mt-4 text-sm">
                <button
                  type="button"
                  disabled={currentPage === 0}
                  onClick={() => setPage((p) => Math.max(0, p - 1))}
                  className="text-gray-900 underline disabled:opacity-50"
                >
                  Previous
                </button>
                <span className="text-gray-600">
                  Page {currentPage + 1} of {pageCount}
                </span>
                <button
                  type="button"
                  disabled={currentPage >= pageCount - 1}
                  onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                  className="text-gray-900 underline disabled:opacity-50"
                >
                  Next
                </button>
              </div>
            )}
          </>
        )}
      </div>
    </main>
  );
}

export default function ClinicAuditPage() {
  return (
    <ProtectedRoute require={canManageStaff}>
      <ClinicAuditContent />
    </ProtectedRoute>
  );
}
