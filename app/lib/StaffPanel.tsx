"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppNav from "./AppNav";
import { useAuth } from "./AuthContext";
import { isOwner } from "./clinicScope";
import { ClinicMembership } from "./membership";
import {
  ASSIGNABLE_ROLES,
  SHIFTS,
  canManageStaff,
  isAssignableRole,
  isShift,
  landingPathForRole,
  roleDisplay,
  roleLabel,
  roleRequiresShift,
  shiftLabel,
} from "./permissions";
import {
  UsernameTakenError,
  actorLabel,
  buildIdentityDirectory,
  claimUsername,
  validateUsername,
} from "./identity";
import {
  PendingEntry,
  StaffRow,
  groupStaffByRole,
  loadStaffRows,
  makeApproverStamp,
  membershipsInScope,
  pendingEntries,
  removeStaffAssignment,
  staffAssignmentGuard,
  writeStaffMembership,
} from "./staffOps";
import { actorFromAuth, safeLogAudit } from "./audit";
import PreApprovalsPanel from "./PreApprovalsPanel";
import { useStaffSession } from "./pinSession";
import { SensitivePinPrompt } from "./PinGate";

function StatusBadge({ status }: { status: string }) {
  return (
    <span className="text-xs uppercase tracking-wide text-gray-500 border border-gray-300 rounded px-2 py-1">
      {status}
    </span>
  );
}

function Identity({ row }: { row: StaffRow }) {
  return (
    <div>
      <p className="font-medium text-gray-900">
        {row.username || <span className="text-gray-500 italic">no username yet</span>}
      </p>
      {row.name && <p className="text-sm text-gray-600">{row.name}</p>}
      <p className="text-xs text-gray-400">Sign-in account: {row.email || "unknown"}</p>
    </div>
  );
}

function RoleSelect({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Role"
      className="border border-gray-300 rounded px-2 py-1 text-sm"
    >
      {ASSIGNABLE_ROLES.map((r) => (
        <option key={r} value={r}>
          {roleLabel(r)}
        </option>
      ))}
    </select>
  );
}

function ShiftSelect({ value, onChange }: { value: string; onChange: (next: string) => void }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Shift"
      required
      className="border border-gray-300 rounded px-2 py-1 text-sm"
    >
      <option value="">Select shift...</option>
      {SHIFTS.map((s) => (
        <option key={s} value={s}>
          {shiftLabel(s)}
        </option>
      ))}
    </select>
  );
}

function RoleAndShift({
  roleValue,
  onRoleChange,
  shiftValue,
  onShiftChange,
}: {
  roleValue: string;
  onRoleChange: (next: string) => void;
  shiftValue: string;
  onShiftChange: (next: string) => void;
}) {
  return (
    <>
      <RoleSelect value={roleValue} onChange={onRoleChange} />
      {roleRequiresShift(roleValue) && <ShiftSelect value={shiftValue} onChange={onShiftChange} />}
    </>
  );
}

function ClinicSelect({
  value,
  onChange,
  clinics,
  locked,
}: {
  value: string;
  onChange: (next: string) => void;
  clinics: { id: string; name: string }[];
  locked?: boolean;
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      aria-label="Clinic"
      disabled={locked}
      className="border border-gray-300 rounded px-2 py-1 text-sm disabled:bg-gray-50"
    >
      <option value="">Select clinic...</option>
      {clinics.map((c) => (
        <option key={c.id} value={c.id}>
          {c.name}
        </option>
      ))}
    </select>
  );
}

function UsernamePanel({
  uid,
  value,
  onChange,
  onSave,
}: {
  uid: string;
  value: string;
  onChange: (next: string) => void;
  onSave: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 mt-3">
      <label className="text-sm text-gray-600" htmlFor={`username-${uid}`}>
        Username
      </label>
      <input
        id={`username-${uid}`}
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="e.g. isaac.lab"
        maxLength={20}
        className="border border-gray-300 rounded px-2 py-1 text-sm font-mono"
      />
      <button onClick={onSave} className="text-sm text-gray-900 underline">
        Save username
      </button>
      <span className="text-xs text-gray-400">Displayed instead of the email address.</span>
    </div>
  );
}

export default function StaffPanel({
  scopeClinicId,
  pendingOnly = false,
  embedded = false,
}: {
  scopeClinicId?: string | null;
  pendingOnly?: boolean;
  embedded?: boolean;
}) {
  const { user, role, clinicId, username: myUsername, shift } = useAuth();
  const { resetStaffPin } = useStaffSession();
  const [pinResetUid, setPinResetUid] = useState<string | null>(null);
  const canAccess = canManageStaff(role);
  const owner = isOwner(role);

  const [rows, setRows] = useState<StaffRow[]>([]);
  const [clinicNames, setClinicNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const [roleDraft, setRoleDraft] = useState<Record<string, string>>({});
  const [shiftDraft, setShiftDraft] = useState<Record<string, string>>({});
  const [clinicDraft, setClinicDraft] = useState<Record<string, string>>({});
  const [usernameDraft, setUsernameDraft] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!canAccess) return;
    let cancelled = false;

    async function load() {
      try {
        const result = await loadStaffRows({ role, clinicId });
        if (cancelled) return;
        setRows(result.rows);
        setClinicNames(result.clinicNames);
        const nextRoleDraft: Record<string, string> = {};
        const nextShiftDraft: Record<string, string> = {};
        for (const r of result.rows) {
          const first = r.memberships[0];
          nextRoleDraft[r.uid] = isAssignableRole(first?.role) ? first.role : "technician";
          nextShiftDraft[r.uid] = first?.shift ?? "";
          for (const membership of r.memberships) {
            const key = `${r.uid}:${membership.clinicId}`;
            nextRoleDraft[key] = isAssignableRole(membership.role) ? membership.role : "technician";
            nextShiftDraft[key] = membership.shift ?? "";
          }
        }
        setRoleDraft(nextRoleDraft);
        setShiftDraft(nextShiftDraft);
        setClinicDraft(
          Object.fromEntries(
            result.rows.map((r) => [
              r.uid,
              scopeClinicId || r.memberships[0]?.clinicId || (owner ? "" : clinicId || ""),
            ])
          )
        );
        setUsernameDraft(Object.fromEntries(result.rows.map((r) => [r.uid, r.username || ""])));
      } catch (err) {
        console.error(err);
        if (!cancelled) setStatusMsg("Could not load staff.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [canAccess, owner, role, clinicId, scopeClinicId, reloadToken]);

  const directory = useMemo(
    () => buildIdentityDirectory(rows.map((r) => ({ uid: r.uid, email: r.email, username: r.username }))),
    [rows]
  );

  const assignableClinics = useMemo(() => {
    if (scopeClinicId) {
      return [{ id: scopeClinicId, name: clinicNames[scopeClinicId] || scopeClinicId }];
    }
    if (owner) {
      return Object.entries(clinicNames)
        .map(([id, name]) => ({ id, name }))
        .sort((a, b) => a.name.localeCompare(b.name));
    }
    if (!clinicId) return [];
    return [{ id: clinicId, name: clinicNames[clinicId] || clinicId }];
  }, [owner, clinicNames, clinicId, scopeClinicId]);

  const scopedMemberships = useMemo(
    () => membershipsInScope(rows, { owner, clinicId, scopeClinicId }),
    [rows, owner, clinicId, scopeClinicId]
  );

  const pending: PendingEntry[] = useMemo(
    () => pendingEntries(rows, scopedMemberships, { owner, scopeClinicId }),
    [rows, owner, scopedMemberships, scopeClinicId]
  );

  const roleGroups = useMemo(() => {
    const members: { row: StaffRow; membership: ClinicMembership }[] = [];
    for (const row of rows) {
      for (const membership of scopedMemberships.get(row.uid) ?? []) {
        if (membership.status === "pending") continue;
        members.push({ row, membership });
      }
    }
    return groupStaffByRole(members);
  }, [rows, scopedMemberships]);

  function guard(row: StaffRow, targetClinicId: string): string | null {
    return staffAssignmentGuard(row, targetClinicId, { owner, actorClinicId: clinicId });
  }

  async function handleDecision(row: StaffRow, decision: "approved" | "rejected") {
    const targetClinicId = clinicDraft[row.uid] || scopeClinicId || "";
    const problem = guard(row, targetClinicId);
    if (problem) {
      setStatusMsg(problem);
      return;
    }
    const nextRole = roleDraft[row.uid];
    if (!isAssignableRole(nextRole)) {
      setStatusMsg("Choose a role before approving.");
      return;
    }
    const nextShift = shiftDraft[row.uid];
    if (decision === "approved" && roleRequiresShift(nextRole) && !isShift(nextShift)) {
      setStatusMsg("Choose a shift before approving a Shift Supervisor.");
      return;
    }
    setStatusMsg("Saving...");
    try {
      await writeStaffMembership({
        row,
        targetClinicId,
        nextRole,
        shift: roleRequiresShift(nextRole) && isShift(nextShift) ? nextShift : null,
        status: decision,
        makeActive: true,
        stamp: makeApproverStamp(user, myUsername),
      });
      const actor = actorFromAuth(user, role, shift);
      if (actor) {
        await safeLogAudit({
          clinicId: targetClinicId,
          actor,
          action: decision === "approved" ? "staff.approve" : "staff.reject",
          targetCollection: "users",
          targetId: row.uid,
          targetLabel: row.username || row.name || row.email || row.uid,
          detail: {
            role: nextRole,
            shift: roleRequiresShift(nextRole) && isShift(nextShift) ? nextShift : null,
            status: decision,
          },
        });
      }
      setStatusMsg(
        decision === "approved"
          ? `Approved as ${roleDisplay(nextRole, nextShift)} at ${clinicNames[targetClinicId] || targetClinicId}.`
          : "Request rejected."
      );
      setReloadToken((n) => n + 1);
    } catch (err) {
      console.error(err);
      setStatusMsg("Failed to update the staff member.");
    }
  }

  async function handleRoleChange(row: StaffRow, membership: ClinicMembership) {
    const problem = guard(row, membership.clinicId);
    if (problem) {
      setStatusMsg(problem);
      return;
    }
    const nextRole = roleDraft[`${row.uid}:${membership.clinicId}`] ?? membership.role;
    if (!isAssignableRole(nextRole)) {
      setStatusMsg("That role cannot be assigned.");
      return;
    }
    const nextShift = shiftDraft[`${row.uid}:${membership.clinicId}`];
    if (roleRequiresShift(nextRole) && !isShift(nextShift)) {
      setStatusMsg("Choose a shift before saving a Shift Supervisor.");
      return;
    }
    setStatusMsg("Saving role...");
    try {
      await writeStaffMembership({
        row,
        targetClinicId: membership.clinicId,
        nextRole,
        shift: roleRequiresShift(nextRole) && isShift(nextShift) ? nextShift : null,
        status: "approved",
        makeActive: row.activeClinicId === membership.clinicId,
        stamp: makeApproverStamp(user, myUsername),
      });
      const actor = actorFromAuth(user, role, shift);
      if (actor) {
        await safeLogAudit({
          clinicId: membership.clinicId,
          actor,
          action: "staff.roleChange",
          targetCollection: "users",
          targetId: row.uid,
          targetLabel: row.username || row.name || row.email || row.uid,
          detail: {
            fields: ["role", "shift"],
            fromRole: membership.role,
            toRole: nextRole,
            shift: roleRequiresShift(nextRole) && isShift(nextShift) ? nextShift : null,
          },
        });
      }
      setStatusMsg("Role updated.");
      setReloadToken((n) => n + 1);
    } catch (err) {
      console.error(err);
      setStatusMsg("Failed to update role.");
    }
  }

  async function handleRemoveAssignment(row: StaffRow, membership: ClinicMembership) {
    const problem = guard(row, membership.clinicId);
    if (problem) {
      setStatusMsg(problem);
      return;
    }
    const label = row.username || row.name || row.email || "this staff member";
    if (!window.confirm(`Revoke ${label} from this clinic?`)) return;
    setStatusMsg("Revoking...");
    try {
      await removeStaffAssignment({ row, membership });
      setStatusMsg("Access revoked.");
      setReloadToken((n) => n + 1);
    } catch (err) {
      console.error(err);
      setStatusMsg("Failed to revoke access.");
    }
  }

  async function handleUsername(row: StaffRow) {
    if (row.isOwnerAccount && row.uid !== user?.uid) {
      setStatusMsg("The owner account can only change its own username.");
      return;
    }
    const check = validateUsername(usernameDraft[row.uid]);
    if (!check.ok) {
      setStatusMsg(check.error ?? "Invalid username.");
      return;
    }
    if (check.value === row.username) {
      setStatusMsg("That is already their username.");
      return;
    }
    setStatusMsg("Saving username...");
    try {
      await claimUsername({
        uid: row.uid,
        username: check.value,
        previousUsername: row.username,
      });
      setStatusMsg(`Username set to ${check.value}.`);
      setReloadToken((n) => n + 1);
    } catch (err) {
      console.error(err);
      setStatusMsg(
        err instanceof UsernameTakenError ? err.message : "Failed to save the username."
      );
    }
  }

  async function confirmPinReset() {
    if (!pinResetUid) return;
    const err = await resetStaffPin(pinResetUid);
    setPinResetUid(null);
    setStatusMsg(err || "PIN reset. They must set a new PIN at next unlock.");
  }

  function usernameProps(row: StaffRow) {
    return {
      uid: row.uid,
      value: usernameDraft[row.uid] ?? "",
      onChange: (next: string) => setUsernameDraft((prev) => ({ ...prev, [row.uid]: next })),
      onSave: () => handleUsername(row),
    };
  }

  function roleProps(id: string, fallback: string) {
    return {
      roleValue: roleDraft[id] ?? fallback,
      onRoleChange: (next: string) => setRoleDraft((prev) => ({ ...prev, [id]: next })),
      shiftValue: shiftDraft[id] ?? "",
      onShiftChange: (next: string) => setShiftDraft((prev) => ({ ...prev, [id]: next })),
    };
  }

  function clinicProps(id: string, fallback: string) {
    return {
      value: clinicDraft[id] ?? fallback,
      onChange: (next: string) => setClinicDraft((prev) => ({ ...prev, [id]: next })),
      clinics: assignableClinics,
      locked: Boolean(scopeClinicId),
    };
  }

  const pendingList = (
    <div className="space-y-3">
      {pending.map(({ row, membership }) => {
        const requested = membership?.clinicId ?? scopeClinicId ?? "";
        return (
          <div
            key={`${row.uid}:${requested || "unassigned"}`}
            className="border border-gray-300 rounded-lg p-4"
          >
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <Identity row={row} />
                <p className="text-sm text-gray-500 mt-1">
                  {requested
                    ? `Requested ${clinicNames[requested] || requested}`
                    : "No clinic requested"}
                </p>
                {row.createdAt && (
                  <p className="text-xs text-gray-400">
                    Signed up {new Date(row.createdAt).toLocaleDateString()}
                  </p>
                )}
              </div>
              <StatusBadge status="pending" />
            </div>
            <div className="flex flex-wrap items-center gap-2 mt-3">
              <ClinicSelect {...clinicProps(row.uid, requested)} />
              <RoleAndShift {...roleProps(row.uid, "technician")} />
              <button
                onClick={() => handleDecision(row, "approved")}
                disabled={
                  roleRequiresShift(roleDraft[row.uid] ?? "technician") &&
                  !isShift(shiftDraft[row.uid])
                }
                className="text-sm bg-gray-900 text-white rounded px-3 py-1.5 disabled:opacity-50"
              >
                Approve
              </button>
              <button
                onClick={() => handleDecision(row, "rejected")}
                className="text-sm text-red-600 underline"
              >
                Reject
              </button>
            </div>
            <p className="text-xs text-gray-400 mt-2">
              Approve with a role. Shift Supervisor requires a shift. The owner role cannot be
              assigned.
            </p>
          </div>
        );
      })}
    </div>
  );

  const approvedList = (
    <>
      {roleGroups.length === 0 && (
        <p className="text-gray-600">No approved staff records yet.</p>
      )}
      {roleGroups.map((group) => (
        <section key={group.role} className="mb-8">
          <h2 className="font-medium text-gray-900 border-b border-gray-200 pb-2 mb-3">
            {group.label}
            <span className="ml-2 text-sm font-normal text-gray-500">{group.members.length}</span>
          </h2>
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="text-xs uppercase tracking-wide text-gray-500">
                  <th className="py-2 pr-3 font-medium">Name</th>
                  <th className="py-2 pr-3 font-medium">Username</th>
                  <th className="py-2 pr-3 font-medium">Email</th>
                  <th className="py-2 pr-3 font-medium">Role</th>
                  <th className="py-2 pr-3 font-medium">Shift</th>
                  <th className="py-2 pr-3 font-medium">Approved by</th>
                  <th className="py-2 pr-3 font-medium">Approved at</th>
                  <th className="py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {group.members.map(({ row, membership }) => {
                  const key = `${row.uid}:${membership.clinicId}`;
                  return (
                    <tr key={key} className="border-t border-gray-100 align-top">
                      <td className="py-3 pr-3 text-gray-900">{row.name || "—"}</td>
                      <td className="py-3 pr-3 font-mono text-gray-900">{row.username || "—"}</td>
                      <td className="py-3 pr-3 text-gray-600">{row.email || "—"}</td>
                      <td className="py-3 pr-3 text-gray-900">{roleLabel(membership.role)}</td>
                      <td className="py-3 pr-3 text-gray-900">
                        {roleRequiresShift(membership.role)
                          ? shiftLabel(membership.shift) || "—"
                          : "—"}
                      </td>
                      <td className="py-3 pr-3 text-gray-600">
                        {actorLabel(
                          membership.approvedByUsername ||
                            membership.approvedByUid ||
                            membership.approvedByEmail,
                          directory
                        )}
                      </td>
                      <td className="py-3 pr-3 text-gray-600 whitespace-nowrap">
                        {membership.approvedAt
                          ? new Date(membership.approvedAt).toLocaleDateString()
                          : "—"}
                      </td>
                      <td className="py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <RoleAndShift {...roleProps(key, membership.role)} />
                          <button
                            onClick={() => handleRoleChange(row, membership)}
                            disabled={
                              roleRequiresShift(roleDraft[key] ?? membership.role) &&
                              !isShift(shiftDraft[key] ?? membership.shift)
                            }
                            className="text-sm text-gray-900 underline disabled:opacity-50"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => handleRemoveAssignment(row, membership)}
                            className="text-sm text-red-600 underline"
                          >
                            Revoke
                          </button>
                          <button
                            type="button"
                            onClick={() => setPinResetUid(row.uid)}
                            className="text-sm text-gray-900 underline"
                          >
                            Reset PIN
                          </button>
                          <button
                            onClick={() =>
                              setExpanded((prev) => ({ ...prev, [key]: !prev[key] }))
                            }
                            className="text-sm text-gray-600 underline"
                          >
                            {expanded[key] ? "Close" : "More"}
                          </button>
                        </div>
                        {expanded[key] && <UsernamePanel {...usernameProps(row)} />}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </>
  );

  if (!canAccess) {
    if (embedded) return null;
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="max-w-sm mx-auto px-6 py-16 text-center">
          <p className="text-gray-600 mb-4">You do not have access to this page.</p>
          <Link href={landingPathForRole(role, clinicId)} className="text-gray-900 underline font-medium">
            Go to your workspace
          </Link>
        </div>
      </main>
    );
  }

  if (embedded && pendingOnly) {
    if (!loading && pending.length === 0) return null;
    return (
      <section className="border border-gray-200 rounded-lg p-4 mb-6">
        <h2 className="font-medium text-gray-900 mb-3">
          Pending approvals{loading ? "" : ` (${pending.length})`}
        </h2>
        {statusMsg && <p className="text-sm text-gray-600 mb-4">{statusMsg}</p>}
        {loading ? <p className="text-sm text-gray-500">Loading...</p> : pendingList}
      </section>
    );
  }

  const body = (
    <>
      {statusMsg && <p className="text-sm text-gray-600 mb-4">{statusMsg}</p>}
      {pinResetUid && (
        <SensitivePinPrompt
          action="staff"
          onClose={() => setPinResetUid(null)}
          onConfirmed={() => void confirmPinReset()}
        />
      )}
      {loading && <p className="text-gray-600">Loading...</p>}
      {!loading && (
        <>
          <section className="mb-10">
            <h2 className="text-sm font-medium text-gray-900 mb-3">
              Pending approvals ({pending.length})
            </h2>
            {pending.length === 0 ? (
              <p className="text-sm text-gray-600">Nothing waiting for approval.</p>
            ) : (
              pendingList
            )}
          </section>
          {(scopeClinicId || clinicId) && (
            <PreApprovalsPanel clinicId={scopeClinicId || clinicId || ""} />
          )}
          {approvedList}
        </>
      )}
    </>
  );

  if (embedded) return <div>{body}</div>;

  const scopedName = scopeClinicId ? clinicNames[scopeClinicId] || scopeClinicId : null;

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-5xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          {scopedName ? `Staff — ${scopedName}` : "Manage Staff"}
        </h1>
        <p className="text-gray-600 mb-4">
          A role is held at a clinic, not across the platform. Approving a staff member sets their
          role for one clinic only. The owner role cannot be assigned here.
        </p>
        {scopeClinicId && (
          <p className="text-sm text-gray-500 mb-4">
            {owner && (
              <>
                <Link href="/owner" className="underline text-gray-900">
                  Owner console
                </Link>
                {" · "}
              </>
            )}
            <Link href={`/owner/clinics/${scopeClinicId}`} className="underline text-gray-900">
              Clinic profile
            </Link>
            {" · "}
            <Link href={`/owner/clinics/${scopeClinicId}/audit`} className="underline text-gray-900">
              Audit log
            </Link>
          </p>
        )}
        {body}
      </div>
    </main>
  );
}
