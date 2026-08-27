import { describe, expect, it } from "vitest";
import type { ClinicMembership } from "./membership";
import type { PreApproval } from "./preApprovals";
import {
  STAFF_DIRECTORY_EXPORT_HEADERS,
  buildStaffDirectory,
  exportSafeCell,
  staffDirectoryExportRows,
  staffDirectoryToCsv,
  staffExportContainsEmail,
} from "./staffDirectory";
import { membershipsInScope, type StaffRow } from "./staffModel";

function membership(overrides: Partial<ClinicMembership> = {}): ClinicMembership {
  return {
    clinicId: "c1",
    role: "technician",
    status: "approved",
    shift: null,
    approvedByUid: "admin",
    approvedByUsername: "admin.user",
    approvedByEmail: "admin@clinic.test",
    approvedAt: "2026-08-02T00:00:00.000Z",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function staff(overrides: Partial<StaffRow> = {}): StaffRow {
  return {
    uid: "u1",
    name: "Ada",
    username: "ada.lab",
    email: "ada@clinic.test",
    createdAt: "2026-08-01T00:00:00.000Z",
    isOwnerAccount: false,
    memberships: [membership()],
    activeClinicId: "c1",
    ...overrides,
  };
}

function preApproval(overrides: Partial<PreApproval> = {}): PreApproval {
  return {
    id: "pre1",
    clinicId: "c1",
    email: "newhire@clinic.test",
    role: "technician",
    shift: null,
    createdAt: "2026-08-20T00:00:00.000Z",
    createdByUid: "admin",
    createdByEmail: "admin@clinic.test",
    expiresAt: "2026-11-18T00:00:00.000Z",
    status: "pending",
    consumedByUid: null,
    consumedAt: null,
    ...overrides,
  };
}

describe("buildStaffDirectory", () => {
  it("puts pre-approved, pending, approved, and rejected into one table", () => {
    const rows = [
      staff({
        uid: "approved",
        username: "ok.tech",
        email: "ok@clinic.test",
        memberships: [membership({ status: "approved" })],
      }),
      staff({
        uid: "waiting",
        username: "wait.tech",
        email: "wait@clinic.test",
        memberships: [membership({ status: "pending", role: "intern" })],
      }),
      staff({
        uid: "no",
        username: "no.tech",
        email: "no@clinic.test",
        memberships: [membership({ status: "rejected", role: "storekeeper" })],
      }),
    ];
    const scoped = membershipsInScope(rows, { owner: false, clinicId: "c1" });
    const directory = buildStaffDirectory({
      staffRows: rows,
      preApprovals: [preApproval({ role: "lab_manager" })],
      scopedMemberships: scoped,
      owner: false,
      scopeClinicId: "c1",
    });

    expect(directory.map((row) => [row.state, row.username || row.email, row.role])).toEqual([
      ["pre-approved", "newhire@clinic.test", "lab_manager"],
      ["pending", "wait.tech", "intern"],
      ["approved", "ok.tech", "technician"],
      ["rejected", "no.tech", "storekeeper"],
    ]);
  });

  it("does not list the owner account as clinic staff", () => {
    const rows = [
      staff({
        uid: "owner",
        isOwnerAccount: true,
        username: "platform.owner",
        memberships: [],
      }),
    ];
    const scoped = membershipsInScope(rows, { owner: true, clinicId: null });
    const directory = buildStaffDirectory({
      staffRows: rows,
      preApprovals: [],
      scopedMemberships: scoped,
      owner: true,
    });
    expect(directory).toEqual([]);
  });
});

describe("staff directory export", () => {
  it("never includes an email header or email addresses", () => {
    const rows = [
      staff({
        name: "Ada Lovelace",
        username: "ada.lab",
        email: "ada@clinic.test",
        memberships: [
          membership({
            approvedByEmail: "admin@clinic.test",
            approvedByUsername: "admin.user",
          }),
        ],
      }),
    ];
    const scoped = membershipsInScope(rows, { owner: false, clinicId: "c1" });
    const directory = buildStaffDirectory({
      staffRows: rows,
      preApprovals: [preApproval()],
      scopedMemberships: scoped,
      owner: false,
      scopeClinicId: "c1",
    });
    const people = {
      byUid: Object.fromEntries(rows.filter((row) => row.username).map((row) => [row.uid, row.username as string])),
      byEmail: Object.fromEntries(
        rows
          .filter((row) => row.username && row.email)
          .map((row) => [row.email!.toLowerCase(), row.username as string])
      ),
    };
    const csv = staffDirectoryToCsv(directory, { c1: "Banjul Lab" }, people);

    expect([...STAFF_DIRECTORY_EXPORT_HEADERS]).not.toEqual(
      expect.arrayContaining([expect.stringMatching(/email/i)])
    );
    expect(staffExportContainsEmail(csv)).toBe(false);
    expect(csv).toContain("ada.lab");
    expect(csv).toContain("Pre-approved");
    expect(csv).toContain("Banjul Lab");
    expect(csv).not.toContain("ada@clinic.test");
    expect(csv).not.toContain("newhire@clinic.test");
    expect(csv).not.toContain("admin@clinic.test");
  });

  it("blanks actor labels that are still raw emails", () => {
    expect(exportSafeCell("admin@clinic.test")).toBe("");
    expect(exportSafeCell("admin.user")).toBe("admin.user");
    const leaked = staffDirectoryExportRows(
      [
        {
          key: "pre:1",
          kind: "pre-approval",
          state: "pre-approved",
          clinicId: "c1",
          role: "technician",
          shift: null,
          uid: null,
          preApprovalId: "1",
          name: null,
          username: null,
          email: "hidden@clinic.test",
          createdAt: "2026-08-20T00:00:00.000Z",
          expiresAt: "2026-11-18T00:00:00.000Z",
          approvedByUid: null,
          approvedByUsername: null,
          approvedByEmail: "creator@clinic.test",
          approvedAt: "2026-08-20T00:00:00.000Z",
        },
      ],
      { c1: "Clinic" }
    );
    expect(leaked.flat().some((cell) => cell.includes("@"))).toBe(false);
  });
});
