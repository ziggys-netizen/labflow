import { describe, expect, it } from "vitest";
import {
  currentRosterShift,
  deriveShiftLabel,
  evaluateRosterAccess,
  findNextWindow,
  formatRosterMessage,
  isStaffManagementPath,
  matchesPattern,
  rosterExpiryWarning,
  rosteringIsActive,
  weekOfMonth,
  type RosterEntry,
  type RosterException,
} from "./roster";

function entry(overrides: Partial<RosterEntry> = {}): RosterEntry {
  return {
    id: "e1",
    clinicId: "c1",
    userUid: "u1",
    pattern: "weekly",
    weeksOfMonth: [],
    weekParity: null,
    daysOfWeek: [1, 3, 5],
    startTime: "09:00",
    endTime: "14:00",
    graceMinutes: 30,
    dates: [],
    effectiveFrom: "2026-08-01",
    effectiveTo: null,
    createdByUid: "admin",
    createdAt: "2026-08-01T00:00:00.000Z",
    ...overrides,
  };
}

function evaluate(
  now: Date,
  overrides: Partial<Parameters<typeof evaluateRosterAccess>[0]> = {}
) {
  const userEntries = overrides.userEntries ?? [entry()];
  return evaluateRosterAccess({
    now,
    role: "technician",
    userUid: "u1",
    rosteringEnabled: true,
    clinicEntries: userEntries,
    userEntries,
    exceptions: [],
    breakGlassUntil: null,
    ...overrides,
  });
}

describe("deriveShiftLabel", () => {
  it("is derived from startTime only", () => {
    expect(deriveShiftLabel("09:00")).toBe("morning");
    expect(deriveShiftLabel("12:00")).toBe("afternoon");
    expect(deriveShiftLabel("14:00")).toBe("afternoon");
    expect(deriveShiftLabel("18:00")).toBe("night");
    expect(deriveShiftLabel("22:00")).toBe("night");
    expect(deriveShiftLabel("05:00")).toBe("night");
  });
});

describe("monthlyByWeek first and third weeks", () => {
  const monthly = entry({
    pattern: "monthlyByWeek",
    weeksOfMonth: [1, 3],
    daysOfWeek: [1, 3, 5],
    startTime: "09:00",
    endTime: "14:00",
  });

  it("matches Mon/Wed/Fri in weeks 1 and 3 of August 2026", () => {
    expect(weekOfMonth(new Date(2026, 7, 3))).toBe(1);
    expect(weekOfMonth(new Date(2026, 7, 17))).toBe(3);
    expect(weekOfMonth(new Date(2026, 7, 24))).toBe(4);
    expect(matchesPattern(monthly, new Date(2026, 7, 3, 10, 0))).toBe(true);
    expect(matchesPattern(monthly, new Date(2026, 7, 5, 10, 0))).toBe(true);
    expect(matchesPattern(monthly, new Date(2026, 7, 7, 10, 0))).toBe(true);
    expect(matchesPattern(monthly, new Date(2026, 7, 17, 10, 0))).toBe(true);
    expect(matchesPattern(monthly, new Date(2026, 7, 19, 10, 0))).toBe(true);
    expect(matchesPattern(monthly, new Date(2026, 7, 21, 10, 0))).toBe(true);
  });

  it("rejects week 2 and week 4, and Tuesday", () => {
    expect(matchesPattern(monthly, new Date(2026, 7, 10, 10, 0))).toBe(false);
    expect(matchesPattern(monthly, new Date(2026, 7, 24, 10, 0))).toBe(false);
    expect(matchesPattern(monthly, new Date(2026, 7, 4, 10, 0))).toBe(false);
  });

  it("grants access inside the window and names the next window outside it", () => {
    const inside = evaluate(new Date(2026, 7, 3, 10, 0), { userEntries: [monthly] });
    expect(inside.allowed).toBe(true);
    expect(inside.reason).toBe("rostered");
    expect(inside.shiftLabel).toBe("morning");

    const outside = evaluate(new Date(2026, 7, 3, 16, 0), { userEntries: [monthly] });
    expect(outside.allowed).toBe(false);
    expect(outside.nextWindow?.getDate()).toBe(5);
    expect(outside.nextWindow?.getHours()).toBe(9);
    expect(outside.message).toContain("Wednesday 09:00");
  });
});

describe("night shift crossing midnight", () => {
  const night = entry({
    pattern: "weekly",
    daysOfWeek: [1],
    startTime: "22:00",
    endTime: "06:00",
  });

  it("grants access at 23:00 on the rostered day and at 05:00 the next calendar day", () => {
    expect(evaluate(new Date(2026, 7, 3, 23, 0), { userEntries: [night] }).allowed).toBe(true);
    expect(evaluate(new Date(2026, 7, 4, 5, 0), { userEntries: [night] }).allowed).toBe(true);
    expect(evaluate(new Date(2026, 7, 4, 5, 0), { userEntries: [night] }).shiftLabel).toBe("night");
  });

  it("refuses 23:00 on the following day when that day is not rostered", () => {
    expect(evaluate(new Date(2026, 7, 4, 23, 0), { userEntries: [night] }).allowed).toBe(false);
  });
});

describe("grace at both ends", () => {
  const shift = entry({ daysOfWeek: [1], startTime: "09:00", endTime: "14:00", graceMinutes: 30 });

  it("opens 30 minutes before and stays open 30 minutes after", () => {
    expect(evaluate(new Date(2026, 7, 3, 8, 30), { userEntries: [shift] }).allowed).toBe(true);
    expect(evaluate(new Date(2026, 7, 3, 14, 29), { userEntries: [shift] }).allowed).toBe(true);
    expect(evaluate(new Date(2026, 7, 3, 8, 29), { userEntries: [shift] }).allowed).toBe(false);
    expect(evaluate(new Date(2026, 7, 3, 14, 30), { userEntries: [shift] }).allowed).toBe(false);
  });
});

describe("refusal copy", () => {
  it("names the ended time and the next window", () => {
    const decision = evaluate(new Date(2026, 7, 3, 15, 0), {
      userEntries: [entry({ daysOfWeek: [1, 3], startTime: "09:00", endTime: "14:30" })],
    });
    expect(decision.allowed).toBe(false);
    expect(decision.message).toBe("Your shift ended at 14:30. You are next rostered Wednesday 09:00.");
  });
});

describe("break-glass", () => {
  it("grants access and stamps offRoster", () => {
    const decision = evaluate(new Date(2026, 7, 3, 20, 0), {
      breakGlassUntil: new Date(2026, 7, 3, 22, 0),
    });
    expect(decision.allowed).toBe(true);
    expect(decision.offRoster).toBe(true);
    expect(decision.reason).toBe("break_glass");
  });
});

describe("leave exception", () => {
  const leave: RosterException = {
    id: "x1",
    clinicId: "c1",
    userUid: "u1",
    type: "leave",
    startsAt: new Date(2026, 7, 3, 0, 0).toISOString(),
    endsAt: new Date(2026, 7, 6, 0, 0).toISOString(),
    reasonCode: null,
    note: null,
    createdByUid: "admin",
    createdAt: "2026-08-01T00:00:00.000Z",
  };

  it("removes access during leave even inside the pattern", () => {
    const decision = evaluate(new Date(2026, 7, 3, 10, 0), { exceptions: [leave] });
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toBe("exception");
    expect(decision.message).toContain("on leave");
  });

  it("lets a planned extra cover override the pattern", () => {
    const extra: RosterException = {
      ...leave,
      id: "x2",
      type: "extra",
      startsAt: new Date(2026, 7, 4, 18, 0).toISOString(),
      endsAt: new Date(2026, 7, 4, 22, 0).toISOString(),
    };
    const decision = evaluate(new Date(2026, 7, 4, 19, 0), { exceptions: [extra] });
    expect(decision.allowed).toBe(true);
    expect(decision.offRoster).toBe(false);
    expect(decision.reason).toBe("extra");
  });
});

describe("clinic with no roster stays always-on", () => {
  it("does not lock when rostering is off or there are no clinic entries", () => {
    expect(rosteringIsActive(false, 3)).toBe(false);
    expect(rosteringIsActive(true, 0)).toBe(false);
    expect(
      evaluate(new Date(2026, 7, 3, 3, 0), { rosteringEnabled: false, clinicEntries: [], userEntries: [] })
        .reason
    ).toBe("rostering_inactive");
    expect(
      evaluate(new Date(2026, 7, 3, 3, 0), { rosteringEnabled: true, clinicEntries: [], userEntries: [] })
        .allowed
    ).toBe(true);
  });

  it("exempts the owner entirely", () => {
    const decision = evaluate(new Date(2026, 7, 3, 3, 0), { role: "owner", userEntries: [entry()] });
    expect(decision.allowed).toBe(true);
    expect(decision.reason).toBe("owner_exempt");
    expect(decision.offRoster).toBe(false);
  });
});

describe("staff-management lockout trap", () => {
  it("treats clinic profile, staff, and roster pages as staff management", () => {
    expect(isStaffManagementPath("/owner/clinics/abc")).toBe(true);
    expect(isStaffManagementPath("/owner/clinics/abc/staff")).toBe(true);
    expect(isStaffManagementPath("/owner/clinics/abc/roster")).toBe(true);
    expect(isStaffManagementPath("/staff")).toBe(true);
    expect(isStaffManagementPath("/patients")).toBe(false);
    expect(isStaffManagementPath("/dashboard")).toBe(false);
  });
});

describe("session expiry warnings", () => {
  it("warns at 10 minutes and again at 2", () => {
    expect(rosterExpiryWarning(15)).toBeNull();
    expect(rosterExpiryWarning(10)).toBe("10");
    expect(rosterExpiryWarning(3)).toBe("10");
    expect(rosterExpiryWarning(2)).toBe("2");
    expect(rosterExpiryWarning(0.5)).toBe("2");
    expect(rosterExpiryWarning(-1)).toBeNull();
  });
});

describe("next window and derived shift fallback", () => {
  it("finds the next Monday 09:00 after a Friday shift", () => {
    const weekly = entry({ daysOfWeek: [1, 5], startTime: "09:00", endTime: "14:00" });
    const next = findNextWindow([weekly], [], new Date(2026, 7, 7, 15, 0));
    expect(next?.getDate()).toBe(10);
    expect(next?.getHours()).toBe(9);
  });

  it("uses the current roster entry for supervisor shift, else the membership fallback", () => {
    expect(currentRosterShift([entry()], [], new Date(2026, 7, 3, 10, 0), "afternoon")).toBe("morning");
    expect(currentRosterShift([entry()], [], new Date(2026, 7, 3, 20, 0), "afternoon")).toBe("afternoon");
    expect(currentRosterShift([], [], new Date(2026, 7, 3, 10, 0), "night")).toBe("night");
  });
});

describe("formatRosterMessage", () => {
  it("does not invent a next window when none exists", () => {
    expect(
      formatRosterMessage({
        allowed: false,
        offRoster: false,
        reason: "not_rostered",
        shiftLabel: null,
        accessUntil: null,
        lastWindowEnd: null,
        nextWindow: null,
        exception: null,
      })
    ).toBe("You are not on the roster for this clinic.");
  });
});
