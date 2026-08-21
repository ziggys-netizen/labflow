"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppNav from "./AppNav";
import { useAuth } from "./AuthContext";
import { isOwner } from "./clinicScope";
import { ClinicMembership } from "./membership";
import {
  ASSIGNABLE_ROLES,
  canManageStaff,
  isAssignableRole,
  landingPathForRole,
  roleLabel,
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
  loadStaffRows,
  makeApproverStamp,
  membershipsInScope,
  pendingEntries,
  removeStaffAssignment,
  staffAssignmentGuard,
  writeStaffMembership,
} from "./staffOps";

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
  joinCode,
}: {
  scopeClinicId?: string | null;
  pendingOnly?: boolean;
  embedded?: boolean;
  joinCode?: string;
}) {
  const { user, role, clinicId, username: myUsername } = useAuth();
  const canAccess = canManageStaff(role);
  const owner = isOwner(role);

  const [rows, setRows] = useState<StaffRow[]>([]);
  const [clinicNames, setClinicNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const [roleDraft, setRoleDraft] = useState<Record<string, string>>({});
  const [clinicDraft, setClinicDraft] = useState<Record<string, string>>({});
  const [usernameDraft, setUsernameDraft] = useState<Record<string, string>>({});
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [collapsedGroups, setCollapsedGroups] = useState<Record<string, boolean>>({});

  useEffect(() => {
    if (!canAccess) return;
    let cancelled = false;

    async function load() {
      try {
        const result = await loadStaffRows({ role, clinicId });
        if (cancelled) return;
        setRows(result.rows);
        setClinicNames(result.clinicNames);
        setRoleDraft(
          Object.fromEntries(
            result.rows.map((r) => [
              r.uid,
              isAssignableRole(r.memberships[0]?.role) ? r.memberships[0].role : "technician",
            ])
          )
        );
        setClinicDraft(
          Object.fromEntries(
            result.rows.map((r) => [
              r.uid,
              scopeClinicId ||
                r.memberships[0]?.clinicId ||
                (owner ? "" : clinicId || ""),
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

  const groups = useMemo(() => {
    const byClinic = new Map<string, { row: StaffRow; membership: ClinicMembership }[]>();
    for (const row of rows) {
      for (const membership of scopedMemberships.get(row.uid) ?? []) {
        if (membership.status === "pending") continue;
        const bucket = byClinic.get(membership.clinicId) ?? [];
        bucket.push({ row, membership });
        byClinic.set(membership.clinicId, bucket);
      }
    }
    return [...byClinic.entries()]
      .map(([id, members]) => ({ clinicId: id, name: clinicNames[id] || id, members }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [rows, clinicNames, scopedMemberships]);

  const ownerRows = useMemo(() => rows.filter((r) => r.isOwnerAccount), [rows]);

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
    setStatusMsg("Saving...");
    try {
      await writeStaffMembership({
        row,
        targetClinicId,
        nextRole,
        status: decision,
        makeActive: true,
        stamp: makeApproverStamp(user, myUsername),
      });
      setStatusMsg(
        decision === "approved"
          ? `Approved as ${roleLabel(nextRole)} at ${clinicNames[targetClinicId] || targetClinicId}.`
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
    setStatusMsg("Saving role...");
    try {
      await writeStaffMembership({
        row,
        targetClinicId: membership.clinicId,
        nextRole,
        status: "approved",
        makeActive: row.activeClinicId === membership.clinicId,
        stamp: makeApproverStamp(user, myUsername),
      });
      setStatusMsg("Role updated.");
      setReloadToken((n) => n + 1);
    } catch (err) {
      console.error(err);
      setStatusMsg("Failed to update role.");
    }
  }

  async function handleAddAssignment(row: StaffRow) {
    const targetClinicId = clinicDraft[`add:${row.uid}`] || "";
    const problem = guard(row, targetClinicId);
    if (problem) {
      setStatusMsg(problem);
      return;
    }
    if (row.memberships.some((m) => m.clinicId === targetClinicId)) {
      setStatusMsg("That staff member is already assigned to this clinic.");
      return;
    }
    const nextRole = roleDraft[`add:${row.uid}`];
    if (!isAssignableRole(nextRole)) {
      setStatusMsg("Choose a role for the new clinic assignment.");
      return;
    }
    setStatusMsg("Saving assignment...");
    try {
      await writeStaffMembership({
        row,
        targetClinicId,
        nextRole,
        status: "approved",
        makeActive: row.memberships.length === 0,
        stamp: makeApproverStamp(user, myUsername),
      });
      setStatusMsg(`Assigned to ${clinicNames[targetClinicId] || targetClinicId}.`);
      setReloadToken((n) => n + 1);
    } catch (err) {
      console.error(err);
      setStatusMsg("Failed to add the clinic assignment.");
    }
  }

  async function handleRemoveAssignment(row: StaffRow, membership: ClinicMembership) {
    const problem = guard(row, membership.clinicId);
    if (problem) {
      setStatusMsg(problem);
      return;
    }
    setStatusMsg("Removing assignment...");
    try {
      await removeStaffAssignment({ row, membership });
      setStatusMsg("Assignment removed.");
      setReloadToken((n) => n + 1);
    } catch (err) {
      console.error(err);
      setStatusMsg("Failed to remove the assignment.");
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
      value: roleDraft[id] ?? fallback,
      onChange: (next: string) => setRoleDraft((prev) => ({ ...prev, [id]: next })),
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

  const body = (
    <>
      {statusMsg && <p className="text-sm text-gray-600 mb-4">{statusMsg}</p>}
      {loading && <p className="text-gray-600">Loading...</p>}

      {!loading && (
        <>
          <section className={pendingOnly ? "" : "mb-10"}>
            <h2 className="text-sm font-medium text-gray-900 mb-3">
              Pending approval ({pending.length})
            </h2>
            {pending.length === 0 && (
              <p className="text-sm text-gray-600">Nothing waiting for approval.</p>
            )}
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
                        {requested && (
                          <p className="text-xs text-gray-400">Clinic ID: {requested}</p>
                        )}
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
                      <RoleSelect {...roleProps(row.uid, "technician")} />
                      <button
                        onClick={() => handleDecision(row, "approved")}
                        className="text-sm bg-gray-900 text-white rounded px-3 py-1.5"
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
                      A clinic must be selected before a role can be approved. The owner role cannot
                      be assigned.
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {!pendingOnly && groups.length === 0 && (
            <p className="text-gray-600">No approved staff records yet.</p>
          )}

          {!pendingOnly &&
            groups.map((group) => {
              const collapsed =
                collapsedGroups[group.clinicId] ?? (owner && !scopeClinicId && groups.length > 1);
              return (
                <section key={group.clinicId} className="mb-6">
                  <button
                    onClick={() =>
                      setCollapsedGroups((prev) => ({ ...prev, [group.clinicId]: !collapsed }))
                    }
                    className="w-full flex items-center justify-between text-left border-b border-gray-200 pb-2 mb-3"
                  >
                    <span className="font-medium text-gray-900">
                      {collapsed ? "▸" : "▾"} {group.name}
                    </span>
                    <span className="text-sm text-gray-500">
                      {group.members.length} staff · ID {group.clinicId}
                    </span>
                  </button>

                  {!collapsed && (
                    <div className="space-y-3">
                      {group.members.map(({ row, membership }) => {
                        const key = `${row.uid}:${membership.clinicId}`;
                        const isActiveClinic = row.activeClinicId === membership.clinicId;
                        return (
                          <div key={key} className="border border-gray-200 rounded-lg p-4">
                            <div className="flex flex-wrap items-start justify-between gap-3">
                              <div>
                                <Identity row={row} />
                                <p className="text-sm text-gray-500 mt-1">
                                  {roleLabel(membership.role)} · {group.name}
                                </p>
                                <p className="text-xs text-gray-400">
                                  Clinic ID: {membership.clinicId}
                                  {row.memberships.length > 1 &&
                                    (isActiveClinic ? " · active clinic" : "")}
                                </p>
                                {membership.approvedAt && (
                                  <p className="text-xs text-gray-400">
                                    Approved by{" "}
                                    {actorLabel(
                                      membership.approvedByUsername ||
                                        membership.approvedByUid ||
                                        membership.approvedByEmail,
                                      directory
                                    )}{" "}
                                    on {new Date(membership.approvedAt).toLocaleDateString()}
                                  </p>
                                )}
                              </div>
                              <StatusBadge status={membership.status} />
                            </div>

                            <div className="flex flex-wrap items-center gap-2 mt-3">
                              <RoleSelect {...roleProps(key, membership.role)} />
                              <button
                                onClick={() => handleRoleChange(row, membership)}
                                className="text-sm text-gray-900 underline"
                              >
                                Save role
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

                            {expanded[key] && (
                              <>
                                <UsernamePanel {...usernameProps(row)} />
                                {owner && !scopeClinicId && (
                                  <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-3 mt-3">
                                    <span className="text-sm text-gray-600">Add another clinic</span>
                                    <ClinicSelect {...clinicProps(`add:${row.uid}`, "")} />
                                    <RoleSelect {...roleProps(`add:${row.uid}`, "technician")} />
                                    <button
                                      onClick={() => handleAddAssignment(row)}
                                      className="text-sm text-gray-900 underline"
                                    >
                                      Assign
                                    </button>
                                  </div>
                                )}
                                <div className="border-t border-gray-100 pt-3 mt-3">
                                  <button
                                    onClick={() => handleRemoveAssignment(row, membership)}
                                    className="text-sm text-red-600 underline"
                                  >
                                    Remove from {group.name}
                                  </button>
                                </div>
                              </>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </section>
              );
            })}

          {!pendingOnly && !scopeClinicId && ownerRows.length > 0 && (
            <section className="mt-10">
              <h2 className="text-sm font-medium text-gray-900 mb-3">Platform owner</h2>
              <div className="space-y-3">
                {ownerRows.map((row) => (
                  <div key={row.uid} className="border border-gray-200 rounded-lg p-4">
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <Identity row={row} />
                      <p className="text-sm text-gray-500">Owner account — cannot be changed.</p>
                    </div>
                    {row.uid === user?.uid && <UsernamePanel {...usernameProps(row)} />}
                  </div>
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </>
  );

  if (!canAccess) {
    if (embedded) return null;
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="max-w-sm mx-auto px-6 py-16 text-center">
          <p className="text-gray-600 mb-4">You do not have access to this page.</p>
          <Link href={landingPathForRole(role)} className="text-gray-900 underline font-medium">
            Go to your workspace
          </Link>
        </div>
      </main>
    );
  }

  if (embedded) {
    return <div>{body}</div>;
  }

  const scopedName = scopeClinicId ? clinicNames[scopeClinicId] || scopeClinicId : null;

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">
          {scopedName ? `Staff — ${scopedName}` : "Manage Staff"}
        </h1>
        <p className="text-gray-600 mb-4">
          A role is held at a clinic, not across the platform. Approving a staff member sets their
          role for one clinic only. The owner role cannot be assigned here.
        </p>
        {joinCode && (
          <p className="text-sm text-gray-700 mb-4">
            Clinic join code: <span className="font-mono font-medium">{joinCode}</span>
          </p>
        )}
        {scopeClinicId && owner && (
          <p className="text-sm text-gray-500 mb-4">
            <Link href="/owner" className="underline text-gray-900">
              Owner console
            </Link>
            {" · "}
            <Link href={`/owner/clinics/${scopeClinicId}`} className="underline text-gray-900">
              Clinic
            </Link>
          </p>
        )}
        {body}
      </div>
    </main>
  );
}
