"use client";

import { useEffect, useState } from "react";
import { collection, onSnapshot, query, where } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import { authedPost } from "./authApi";
import {
  ASSIGNABLE_ROLES,
  isShift,
  roleLabel,
  roleRequiresShift,
  SHIFTS,
  shiftLabel,
} from "./permissions";
import {
  isPendingUnexpired,
  normalizeStaffEmail,
  parsePreApprovalRows,
  parsePreApprovalSpreadsheet,
  preApprovalFromData,
  type PreApproval,
} from "./preApprovals";

export default function PreApprovalsPanel({ clinicId }: { clinicId: string }) {
  const { user } = useAuth();
  const [rows, setRows] = useState<PreApproval[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [email, setEmail] = useState("");
  const [role, setRole] = useState("technician");
  const [shift, setShift] = useState("");
  const [bulk, setBulk] = useState("");

  useEffect(() => {
    if (!clinicId) return undefined;
    const self = normalizeStaffEmail(user?.email);
    const q = self
      ? query(
          collection(db, "preApprovals"),
          where("clinicId", "==", clinicId),
          where("email", "!=", self)
        )
      : query(collection(db, "preApprovals"), where("clinicId", "==", clinicId));
    return onSnapshot(
      q,
      (snap) => {
        const now = Date.now();
        setRows(
          snap.docs
            .map((d) => preApprovalFromData(d.id, d.data() as Record<string, unknown>))
            .filter((row): row is PreApproval => row !== null)
            .filter((row) => row.status === "pending" && isPendingUnexpired(row, now))
            .filter((row) => !self || row.email !== self)
            .sort((a, b) => a.email.localeCompare(b.email))
        );
        setLoading(false);
      },
      (err) => {
        console.error(err);
        setStatus("Could not load pre-approvals.");
        setLoading(false);
      }
    );
  }, [clinicId, user?.email]);

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setStatus("Saving...");
    try {
      const res = await authedPost("/api/staff/pre-approvals", {
        clinicId,
        email,
        role,
        shift,
      });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to save pre-approval.");
      setEmail("");
      setShift("");
      setStatus("Pre-approval saved. It lapses after 90 days if unused.");
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Failed to save pre-approval.");
    }
  }

  async function importRows(parsed: { email: string; role: string; shift: string }[]) {
    if (parsed.length === 0) {
      setStatus("No staff rows found. Use columns email, role, shift.");
      return;
    }
    setStatus("Importing...");
    const res = await authedPost("/api/staff/pre-approvals", { clinicId, rows: parsed });
    const data = (await res.json().catch(() => ({}))) as {
      created?: number;
      errors?: string[];
      error?: string;
    };
    if (!res.ok) throw new Error(data.error || "Import failed.");
    const errors = data.errors || [];
    setStatus(
      `Imported ${data.created ?? 0} of ${parsed.length}.${
        errors.length ? ` ${errors.slice(0, 3).join(" ")}` : ""
      }`
    );
  }

  async function handleBulk() {
    try {
      await importRows(parsePreApprovalRows(bulk));
      setBulk("");
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Import failed.");
    }
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setStatus("Reading spreadsheet...");
    try {
      const parsed = await parsePreApprovalSpreadsheet(file);
      await importRows(parsed);
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Could not read that file.");
    }
  }

  async function handleRevoke(id: string) {
    setStatus("Revoking...");
    try {
      const res = await authedPost("/api/staff/pre-approvals/revoke", { clinicId, id });
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) throw new Error(data.error || "Failed to revoke.");
      setStatus("Pre-approval revoked.");
    } catch (err) {
      console.error(err);
      setStatus(err instanceof Error ? err.message : "Failed to revoke pre-approval.");
    }
  }

  return (
    <section className="mb-10 border border-gray-200 rounded-lg p-4">
      <h2 className="text-sm font-medium text-gray-900 mb-1">Staff pre-approvals</h2>
      <p className="text-sm text-gray-600 mb-4">
        Import emails and roles (not live accounts). When that person signs in with Google and
        enters this clinic&apos;s join code, they are approved automatically. Owner cannot be
        listed. Unused entries lapse after 90 days.
      </p>

      <form onSubmit={handleAdd} className="flex flex-wrap items-end gap-2 mb-4">
        <div>
          <label className="block text-xs text-gray-500 mb-1">Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm w-56"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1">Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value)}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </div>
        {roleRequiresShift(role) && (
          <div>
            <label className="block text-xs text-gray-500 mb-1">Shift</label>
            <select
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              className="border border-gray-300 rounded px-2 py-1 text-sm"
            >
              <option value="">Select...</option>
              {SHIFTS.map((s) => (
                <option key={s} value={s}>
                  {shiftLabel(s)}
                </option>
              ))}
            </select>
          </div>
        )}
        <button
          type="submit"
          disabled={roleRequiresShift(role) && !isShift(shift)}
          className="bg-gray-900 text-white text-sm rounded px-3 py-1.5 disabled:opacity-50"
        >
          Add
        </button>
      </form>

      <div className="mb-4">
        <label className="block text-xs text-gray-500 mb-1">Spreadsheet (.xlsx, .xlsm, .csv)</label>
        <input
          type="file"
          accept=".xlsx,.xlsm,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
          onChange={(e) => {
            const file = e.target.files?.[0];
            e.target.value = "";
            void handleFile(file);
          }}
          className="block text-sm text-gray-700 mb-3"
        />
        <label className="block text-xs text-gray-500 mb-1">Or paste email, role, shift rows</label>
        <textarea
          value={bulk}
          onChange={(e) => setBulk(e.target.value)}
          rows={3}
          placeholder={"awa@clinic.gm, technician\nmodou@clinic.gm, lab_supervisor, night"}
          className="w-full border border-gray-300 rounded px-2 py-1 text-sm mb-2"
        />
        <button type="button" onClick={() => void handleBulk()} className="text-sm text-gray-900 underline">
          Import pasted rows
        </button>
      </div>

      {status && <p className="text-sm text-gray-600 mb-3">{status}</p>}
      {loading && <p className="text-sm text-gray-500">Loading...</p>}

      {!loading && rows.length === 0 && (
        <p className="text-sm text-gray-600">No pending pre-approvals.</p>
      )}

      {rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-wide text-gray-500">
                <th className="py-2 pr-3 font-medium">Email</th>
                <th className="py-2 pr-3 font-medium">Role</th>
                <th className="py-2 pr-3 font-medium">Shift</th>
                <th className="py-2 pr-3 font-medium">Created by</th>
                <th className="py-2 pr-3 font-medium">Expires</th>
                <th className="py-2 font-medium"> </th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.id} className="border-t border-gray-100">
                  <td className="py-2 pr-3 text-gray-900">{row.email}</td>
                  <td className="py-2 pr-3 text-gray-900">{roleLabel(row.role)}</td>
                  <td className="py-2 pr-3 text-gray-600">
                    {row.shift ? shiftLabel(row.shift) : "—"}
                  </td>
                  <td className="py-2 pr-3 text-gray-600">{row.createdByEmail || "—"}</td>
                  <td className="py-2 pr-3 text-gray-600">
                    {row.expiresAt ? new Date(row.expiresAt).toLocaleDateString() : "—"}
                  </td>
                  <td className="py-2">
                    <button
                      type="button"
                      onClick={() => void handleRevoke(row.id)}
                      className="text-red-600 underline"
                    >
                      Revoke
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
