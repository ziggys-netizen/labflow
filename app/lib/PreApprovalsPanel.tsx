"use client";

import { useState } from "react";
import { useAuth } from "./AuthContext";
import {
  ASSIGNABLE_ROLES,
  canImportStaffPreApprovals,
  isShift,
  roleLabel,
  roleRequiresShift,
  SHIFTS,
  shiftLabel,
} from "./permissions";
import { parsePreApprovalRows, parsePreApprovalSpreadsheet, validatePreApprovalDraft } from "./preApprovals";
import { createPreApproval, createPreApprovalBatch } from "./staffApi";

export default function PreApprovalsPanel({
  clinicId,
  onChanged,
}: {
  clinicId: string;
  onChanged?: () => void;
}) {
  const { role } = useAuth();
  const canImport = canImportStaffPreApprovals(role);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [email, setEmail] = useState("");
  const [draftRole, setDraftRole] = useState("technician");
  const [shift, setShift] = useState("");
  const [bulk, setBulk] = useState("");

  function setFailure(message: string) {
    setError(message);
    setStatus("");
  }

  async function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setStatus("Saving...");
    setBusy(true);
    try {
      const draft = validatePreApprovalDraft({ email, role: draftRole, shift });
      await createPreApproval({
        clinicId,
        email: draft.email,
        role: draft.role,
        shift: draft.shift || "",
      });
      setEmail("");
      setShift("");
      setError("");
      setStatus("Pre-approval saved. It lapses after 90 days if unused.");
      onChanged?.();
    } catch (err) {
      console.error(err);
      setFailure(err instanceof Error ? err.message : "Failed to save pre-approval.");
    } finally {
      setBusy(false);
    }
  }

  async function importRows(parsed: { email: string; role: string; shift: string }[]) {
    if (parsed.length === 0) {
      setFailure("No staff rows found. Use columns email, role, shift.");
      return false;
    }
    setError("");
    setStatus("Importing...");
    setBusy(true);
    try {
      const data = await createPreApprovalBatch({ clinicId, rows: parsed });
      const errors = data.errors || [];
      setStatus(
        `Imported ${data.created ?? 0} of ${parsed.length}.${
          errors.length ? ` ${errors.slice(0, 3).join(" ")}` : ""
        }`
      );
      onChanged?.();
      return true;
    } catch (err) {
      console.error(err);
      setFailure(err instanceof Error ? err.message : "Import failed.");
      return false;
    } finally {
      setBusy(false);
    }
  }

  async function handleBulk() {
    const ok = await importRows(parsePreApprovalRows(bulk));
    if (ok) setBulk("");
  }

  async function handleFile(file: File | undefined) {
    if (!file) return;
    setError("");
    setStatus("Reading spreadsheet...");
    try {
      const parsed = await parsePreApprovalSpreadsheet(file);
      await importRows(parsed);
    } catch (err) {
      console.error(err);
      setFailure(err instanceof Error ? err.message : "Could not read that file.");
    }
  }

  return (
    <section className="mb-10 border border-gray-200 rounded-lg p-4">
      <h2 className="text-sm font-medium text-gray-900 mb-1">Add a pre-approval</h2>
      <p className="text-sm text-gray-600 mb-4">
        Email and role are stored by the trusted server, not written from this browser. When that
        person signs in with Google and enters this clinic&apos;s join code, they are approved
        automatically. Owner cannot be listed. Unused entries lapse after 90 days.
      </p>

      <form onSubmit={(e) => void handleAdd(e)} className="flex flex-wrap items-end gap-2 mb-3">
        <div>
          <label className="block text-xs text-gray-500 mb-1" htmlFor="preapproval-email">
            Email
          </label>
          <input
            id="preapproval-email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy || !clinicId}
            className="border border-gray-300 rounded px-2 py-1 text-sm w-56"
          />
        </div>
        <div>
          <label className="block text-xs text-gray-500 mb-1" htmlFor="preapproval-role">
            Role
          </label>
          <select
            id="preapproval-role"
            value={draftRole}
            onChange={(e) => setDraftRole(e.target.value)}
            disabled={busy}
            className="border border-gray-300 rounded px-2 py-1 text-sm"
          >
            {ASSIGNABLE_ROLES.map((r) => (
              <option key={r} value={r}>
                {roleLabel(r)}
              </option>
            ))}
          </select>
        </div>
        {roleRequiresShift(draftRole) && (
          <div>
            <label className="block text-xs text-gray-500 mb-1" htmlFor="preapproval-shift">
              Shift
            </label>
            <select
              id="preapproval-shift"
              value={shift}
              onChange={(e) => setShift(e.target.value)}
              disabled={busy}
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
          disabled={busy || !clinicId || (roleRequiresShift(draftRole) && !isShift(shift))}
          className="bg-gray-900 text-white text-sm rounded px-3 py-1.5 disabled:opacity-50"
        >
          {busy ? "Saving..." : "Add"}
        </button>
      </form>

      {error && (
        <p role="alert" className="text-sm text-red-700 mb-3">
          {error}
        </p>
      )}
      {!error && status && <p className="text-sm text-gray-600 mb-3">{status}</p>}

      {canImport && (
        <div className="mb-1">
          <label className="block text-xs text-gray-500 mb-1">Spreadsheet (.xlsx, .xlsm, .csv)</label>
          <input
            type="file"
            accept=".xlsx,.xlsm,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            disabled={busy || !clinicId}
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
            disabled={busy || !clinicId}
            placeholder={"awa@clinic.gm, technician\nmodou@clinic.gm, lab_supervisor, night"}
            className="w-full border border-gray-300 rounded px-2 py-1 text-sm mb-2"
          />
          <button
            type="button"
            disabled={busy || !clinicId}
            onClick={() => void handleBulk()}
            className="text-sm text-gray-900 underline disabled:opacity-50"
          >
            Import pasted rows
          </button>
        </div>
      )}
    </section>
  );
}
