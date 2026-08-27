import { describe, expect, it } from "vitest";
import type { ClinicMembership } from "./membership";
import {
  membershipsInScope,
  pendingEntries,
  staffAssignmentGuard,
  type StaffRow,
} from "./staffModel";

function membership(overrides: Partial<ClinicMembership> = {}): ClinicMembership {
  return {
    clinicId: "c1",
    role: "technician",
    status: "pending",
    shift: null,
    approvedByUid: null,
    approvedByUsername: null,
    approvedByEmail: null,
    approvedAt: null,
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

describe("membershipsInScope", () => {
  it("keeps only the acting clinic for a clinic admin", () => {
    const rows = [
      staff({
        memberships: [membership({ clinicId: "c1" }), membership({ clinicId: "c2", status: "approved" })],
      }),
    ];
    const scoped = membershipsInScope(rows, { owner: false, clinicId: "c1" });
    expect(scoped.get("u1")?.map((m) => m.clinicId)).toEqual(["c1"]);
  });
});

describe("pendingEntries", () => {
  it("lists pending memberships and skips rejected ones", () => {
    const rows = [
      staff({ uid: "p", memberships: [membership({ status: "pending" })] }),
      staff({ uid: "r", memberships: [membership({ status: "rejected" })] }),
      staff({ uid: "a", memberships: [membership({ status: "approved" })] }),
    ];
    const scoped = membershipsInScope(rows, { owner: false, clinicId: "c1" });
    const pending = pendingEntries(rows, scoped, { owner: false, scopeClinicId: "c1" });
    expect(pending.map((entry) => entry.row.uid)).toEqual(["p"]);
  });
});

describe("staffAssignmentGuard", () => {
  it("blocks assigning the owner account and foreign clinics", () => {
    expect(
      staffAssignmentGuard(staff({ isOwnerAccount: true }), "c1", {
        owner: true,
        actorClinicId: null,
      })
    ).toMatch(/owner account cannot be assigned/i);
    expect(
      staffAssignmentGuard(staff(), "c2", { owner: false, actorClinicId: "c1" })
    ).toMatch(/own clinic/i);
  });
});
