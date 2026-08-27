import { csvCell } from "./auditTypes";
import type { ClinicMembership } from "./membership";
import { roleLabel, shiftLabel, type Shift } from "./permissions";
import type { PreApproval } from "./preApprovals";
import { pendingEntries, type StaffRow } from "./staffModel";

export const STAFF_DIRECTORY_STATES = [
  "pre-approved",
  "pending",
  "approved",
  "rejected",
] as const;

export type StaffDirectoryState = (typeof STAFF_DIRECTORY_STATES)[number];

export const STAFF_DIRECTORY_STATE_LABELS: Record<StaffDirectoryState, string> = {
  "pre-approved": "Pre-approved",
  pending: "Pending",
  approved: "Approved",
  rejected: "Rejected",
};

export const STAFF_DIRECTORY_EXPORT_HEADERS = [
  "Name",
  "Username",
  "Role",
  "Shift",
  "State",
  "Clinic",
  "Created",
  "Expires",
  "Approved by",
  "Approved at",
] as const;

const STATE_ORDER: Record<StaffDirectoryState, number> = {
  "pre-approved": 0,
  pending: 1,
  approved: 2,
  rejected: 3,
};

export type StaffDirectoryKind = "account" | "pre-approval";

export type StaffDirectoryRow = {
  key: string;
  kind: StaffDirectoryKind;
  state: StaffDirectoryState;
  clinicId: string;
  role: string;
  shift: Shift | null;
  uid: string | null;
  preApprovalId: string | null;
  name: string | null;
  username: string | null;
  email: string | null;
  createdAt: string | null;
  expiresAt: string | null;
  approvedByUid: string | null;
  approvedByUsername: string | null;
  approvedByEmail: string | null;
  approvedAt: string | null;
};

function membershipState(status: string | null | undefined): StaffDirectoryState | null {
  if (status === "pending") return "pending";
  if (status === "approved") return "approved";
  if (status === "rejected") return "rejected";
  return null;
}

function accountRow(
  row: StaffRow,
  membership: ClinicMembership | null,
  state: StaffDirectoryState
): StaffDirectoryRow {
  const clinicId = membership?.clinicId ?? "";
  return {
    key: `${row.uid}:${clinicId || "unassigned"}`,
    kind: "account",
    state,
    clinicId,
    role: membership?.role ?? row.memberships[0]?.role ?? "pending",
    shift: membership?.shift ?? null,
    uid: row.uid,
    preApprovalId: null,
    name: row.name,
    username: row.username,
    email: row.email,
    createdAt: membership?.createdAt ?? row.createdAt,
    expiresAt: null,
    approvedByUid: membership?.approvedByUid ?? null,
    approvedByUsername: membership?.approvedByUsername ?? null,
    approvedByEmail: membership?.approvedByEmail ?? null,
    approvedAt: membership?.approvedAt ?? null,
  };
}

function preApprovalRow(row: PreApproval): StaffDirectoryRow {
  return {
    key: `pre:${row.id}`,
    kind: "pre-approval",
    state: "pre-approved",
    clinicId: row.clinicId,
    role: row.role,
    shift: row.shift,
    uid: null,
    preApprovalId: row.id,
    name: null,
    username: null,
    email: row.email,
    createdAt: row.createdAt || null,
    expiresAt: row.expiresAt || null,
    approvedByUid: row.createdByUid,
    approvedByUsername: null,
    approvedByEmail: row.createdByEmail,
    approvedAt: row.createdAt || null,
  };
}

function sortKey(row: StaffDirectoryRow) {
  return (row.username || row.name || row.email || row.uid || row.preApprovalId || "").toLowerCase();
}

export function buildStaffDirectory(options: {
  staffRows: StaffRow[];
  preApprovals: PreApproval[];
  scopedMemberships: Map<string, ClinicMembership[]>;
  owner: boolean;
  scopeClinicId?: string | null;
}): StaffDirectoryRow[] {
  const directory: StaffDirectoryRow[] = [];
  const pending = pendingEntries(options.staffRows, options.scopedMemberships, {
    owner: options.owner,
    scopeClinicId: options.scopeClinicId,
  });

  for (const entry of pending) {
    directory.push(accountRow(entry.row, entry.membership, "pending"));
  }

  for (const row of options.staffRows) {
    if (row.isOwnerAccount) continue;
    const scoped = options.scopedMemberships.get(row.uid) ?? [];
    for (const membership of scoped) {
      const state = membershipState(membership.status);
      if (!state || state === "pending") continue;
      directory.push(accountRow(row, membership, state));
    }
  }

  for (const row of options.preApprovals) {
    directory.push(preApprovalRow(row));
  }

  directory.sort((a, b) => {
    const byState = STATE_ORDER[a.state] - STATE_ORDER[b.state];
    if (byState !== 0) return byState;
    return sortKey(a).localeCompare(sortKey(b));
  });

  return directory;
}

/** Blank any value that looks like an email so a download cannot leak one. */
export function exportSafeCell(value: string | null | undefined): string {
  const text = (value || "").trim();
  if (!text || text.includes("@")) return "";
  return text;
}

function dateCell(iso: string | null): string {
  if (!iso) return "";
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return "";
  return new Date(ms).toISOString().slice(0, 10);
}

export type StaffActorDirectory = {
  byUid: Record<string, string>;
  byEmail: Record<string, string>;
};

export function staffDirectoryActorLabel(
  row: StaffDirectoryRow,
  directory?: StaffActorDirectory
): string {
  if (row.approvedByUsername) return row.approvedByUsername;
  if (row.approvedByUid && directory?.byUid[row.approvedByUid]) {
    return directory.byUid[row.approvedByUid];
  }
  const email = row.approvedByEmail?.trim().toLowerCase();
  if (email && directory?.byEmail[email]) return directory.byEmail[email];
  if (row.approvedByUid) return row.approvedByUid;
  return "";
}

export function staffDirectoryExportRows(
  rows: StaffDirectoryRow[],
  clinicNames: Record<string, string>,
  directory?: StaffActorDirectory
): string[][] {
  return rows.map((row) => [
    exportSafeCell(row.name),
    exportSafeCell(row.username),
    exportSafeCell(roleLabel(row.role)),
    exportSafeCell(row.shift ? shiftLabel(row.shift) : ""),
    exportSafeCell(STAFF_DIRECTORY_STATE_LABELS[row.state]),
    exportSafeCell(clinicNames[row.clinicId] || row.clinicId),
    dateCell(row.createdAt),
    dateCell(row.expiresAt),
    exportSafeCell(staffDirectoryActorLabel(row, directory)),
    dateCell(row.approvedAt),
  ]);
}

export function staffDirectoryToCsv(
  rows: StaffDirectoryRow[],
  clinicNames: Record<string, string>,
  directory?: StaffActorDirectory
): string {
  const header = STAFF_DIRECTORY_EXPORT_HEADERS.join(",");
  const lines = staffDirectoryExportRows(rows, clinicNames, directory).map((cells) =>
    cells.map((cell) => csvCell(cell)).join(",")
  );
  return [header, ...lines].join("\r\n");
}

export function staffDirectoryFilename(clinicId: string, now = new Date()) {
  return `staff-${clinicId || "all"}-${now.toISOString().slice(0, 10)}.csv`;
}

export function staffExportContainsEmail(csv: string): boolean {
  const lines = csv.split(/\r?\n/);
  const header = (lines[0] || "").toLowerCase();
  if (header.split(",").some((col) => col.includes("email"))) return true;
  return lines.slice(1).some((line) => line.includes("@"));
}
