import { describe, expect, it } from "vitest";
import { canViewPatients } from "./permissions";
import {
  AUTH_LAYERS,
  continuePathAfterAuth,
  evaluateAuthState,
  protectedRouteDestination,
  sessionAuthInput,
  type AuthStateInput,
} from "./authState";

/** Later-layer values that must be ignored until Google, approval, and membership pass. */
const PIN_AND_ROSTER_READY: Pick<AuthStateInput, "hasPin" | "pinUnlocked" | "rosterAllowed"> = {
  hasPin: true,
  pinUnlocked: true,
  rosterAllowed: false,
};

function decide(overrides: Partial<AuthStateInput> = {}) {
  return evaluateAuthState({
    hasGoogleUser: true,
    role: "pending",
    status: "pending",
    clinicId: null,
    writeClinicId: null,
    ...PIN_AND_ROSTER_READY,
    ...overrides,
  });
}

describe("AUTH_LAYERS", () => {
  it("is Google, approval, membership, PIN, then roster", () => {
    expect(AUTH_LAYERS).toEqual(["google", "approval", "membership", "pin", "roster"]);
  });
});

describe("evaluateAuthState", () => {
  it("signed out → login; PIN and roster do not run", () => {
    const decision = decide({ hasGoogleUser: false });
    expect(decision).toMatchObject({
      destination: "/login",
      layer: "google",
      pinApplies: false,
      rosterApplies: false,
      pinNeedsSetup: false,
    });
  });

  it("Google session, pending, no clinic → /join before PIN or roster", () => {
    const decision = decide();
    expect(decision.destination).toBe("/join");
    expect(decision.layer).toBe("membership");
    expect(decision.pinApplies).toBe(false);
    expect(decision.rosterApplies).toBe(false);
    expect(decision.pinNeedsSetup).toBe(false);
  });

  it("status unset with a Google session and no clinic still reaches /join", () => {
    const decision = decide({ role: null, status: null, clinicId: null });
    expect(decision).toMatchObject({
      destination: "/join",
      layer: "membership",
      pinApplies: false,
      rosterApplies: false,
    });
  });

  it("pending with clinic → /pending; PIN gate still does not run", () => {
    const decision = decide({
      role: "technician",
      status: "pending",
      clinicId: "c1",
      writeClinicId: "c1",
    });
    expect(decision).toMatchObject({
      destination: "/pending",
      layer: "approval",
      pinApplies: false,
      rosterApplies: false,
      pinNeedsSetup: false,
    });
  });

  it("rejected → /pending; PIN and roster do not run", () => {
    const decision = decide({
      role: "technician",
      status: "rejected",
      clinicId: "c1",
      writeClinicId: "c1",
    });
    expect(decision).toMatchObject({
      destination: "/pending",
      layer: "approval",
      pinApplies: false,
      rosterApplies: false,
    });
  });

  it("approved member without PIN → PIN setup after approval, not before", () => {
    const decision = decide({
      role: "technician",
      status: "approved",
      clinicId: "c1",
      writeClinicId: "c1",
      hasPin: false,
      pinUnlocked: false,
      rosterAllowed: false,
    });
    expect(decision).toMatchObject({
      destination: null,
      layer: "pin",
      pinApplies: true,
      rosterApplies: false,
      pinNeedsSetup: true,
    });
  });

  it("approved member with PIN, locked → PIN unlock; roster has not started", () => {
    const decision = decide({
      role: "technician",
      status: "approved",
      clinicId: "c1",
      writeClinicId: "c1",
      hasPin: true,
      pinUnlocked: false,
      rosterAllowed: false,
    });
    expect(decision).toMatchObject({
      destination: null,
      layer: "pin",
      pinApplies: true,
      rosterApplies: false,
      pinNeedsSetup: false,
    });
  });

  it("approved member with PIN identity, roster blocked → roster after PIN", () => {
    const decision = decide({
      role: "technician",
      status: "approved",
      clinicId: "c1",
      writeClinicId: "c1",
      hasPin: true,
      pinUnlocked: true,
      rosterAllowed: false,
    });
    expect(decision).toMatchObject({
      destination: null,
      layer: "roster",
      pinApplies: true,
      rosterApplies: true,
      pinNeedsSetup: false,
    });
  });

  it("fully authenticated → app", () => {
    const decision = decide({
      role: "technician",
      status: "approved",
      clinicId: "c1",
      writeClinicId: "c1",
      hasPin: true,
      pinUnlocked: true,
      rosterAllowed: true,
    });
    expect(decision).toMatchObject({
      destination: null,
      layer: "ok",
      pinApplies: true,
      rosterApplies: true,
      pinNeedsSetup: false,
    });
  });

  it("owner without acting clinic skips PIN and roster", () => {
    const decision = decide({
      role: "owner",
      status: "approved",
      clinicId: null,
      writeClinicId: null,
      hasPin: false,
      pinUnlocked: false,
      rosterAllowed: false,
    });
    expect(decision).toMatchObject({
      destination: null,
      layer: "ok",
      pinApplies: false,
      rosterApplies: false,
      pinNeedsSetup: false,
    });
  });

  it("owner with acting clinic, no PIN → PIN setup", () => {
    const decision = decide({
      role: "owner",
      status: "approved",
      clinicId: null,
      writeClinicId: "c1",
      hasPin: false,
      pinUnlocked: false,
    });
    expect(decision).toMatchObject({
      destination: null,
      layer: "pin",
      pinApplies: true,
      rosterApplies: false,
      pinNeedsSetup: true,
    });
  });

  it("owner with acting clinic, PIN identity, roster blocked → roster after PIN", () => {
    const decision = decide({
      role: "owner",
      status: "approved",
      clinicId: null,
      writeClinicId: "c1",
      hasPin: true,
      pinUnlocked: true,
      rosterAllowed: false,
    });
    expect(decision).toMatchObject({
      destination: null,
      layer: "roster",
      pinApplies: true,
      rosterApplies: true,
    });
  });

  it("approved with no clinic → /join; PIN does not run", () => {
    const decision = decide({
      role: "technician",
      status: "approved",
      clinicId: null,
      writeClinicId: null,
    });
    expect(decision).toMatchObject({
      destination: "/join",
      layer: "membership",
      pinApplies: false,
      rosterApplies: false,
    });
  });
});

describe("protectedRouteDestination", () => {
  const pendingJoin = sessionAuthInput({
    user: { uid: "u1" },
    role: "pending",
    status: "pending",
    clinicId: null,
    writeClinicId: null,
  });

  it("signed out on a protected page → /login", () => {
    expect(
      protectedRouteDestination(
        sessionAuthInput({
          user: null,
          role: null,
          status: null,
          clinicId: null,
          writeClinicId: null,
        }),
        "/patients"
      )
    ).toBe("/login");
  });

  it("pending with no clinic on /patients → /join, not the patients landing", () => {
    expect(protectedRouteDestination(pendingJoin, "/patients", canViewPatients)).toBe("/join");
  });

  it("pending with no clinic already on /join stays on /join (capability cannot bounce them)", () => {
    expect(protectedRouteDestination(pendingJoin, "/join", canViewPatients)).toBe("/join");
  });

  it("pending with clinic on /join → /pending", () => {
    expect(
      protectedRouteDestination(
        sessionAuthInput({
          user: { uid: "u1" },
          role: "technician",
          status: "pending",
          clinicId: "c1",
          writeClinicId: "c1",
        }),
        "/join"
      )
    ).toBe("/pending");
  });

  it("approved intern off an intern path → /register", () => {
    expect(
      protectedRouteDestination(
        {
          hasGoogleUser: true,
          role: "intern",
          status: "approved",
          clinicId: "c1",
          writeClinicId: "c1",
          hasPin: true,
          pinUnlocked: true,
          rosterAllowed: true,
        },
        "/orders"
      )
    ).toBe("/register");
  });

  it("approved accounts officer off the rollup path → /accounts", () => {
    expect(
      protectedRouteDestination(
        {
          hasGoogleUser: true,
          role: "accounts",
          status: "approved",
          clinicId: "c1",
          writeClinicId: "c1",
          hasPin: true,
          pinUnlocked: true,
          rosterAllowed: true,
        },
        "/orders"
      )
    ).toBe("/accounts");
    expect(
      protectedRouteDestination(
        {
          hasGoogleUser: true,
          role: "accounts",
          status: "approved",
          clinicId: "c1",
          writeClinicId: "c1",
          hasPin: true,
          pinUnlocked: true,
          rosterAllowed: true,
        },
        "/patients",
        canViewPatients
      )
    ).toBe("/accounts");
  });

  it("approved member on patients with a page capability they lack → role landing", () => {
    expect(
      protectedRouteDestination(
        {
          hasGoogleUser: true,
          role: "storekeeper",
          status: "approved",
          clinicId: "c1",
          writeClinicId: "c1",
          hasPin: true,
          pinUnlocked: true,
          rosterAllowed: true,
        },
        "/patients",
        canViewPatients
      )
    ).toBe("/inventory");
  });
});

describe("continuePathAfterAuth", () => {
  it("signed out continues to login", () => {
    expect(
      continuePathAfterAuth({
        hasGoogleUser: false,
        role: null,
        status: null,
        clinicId: null,
        writeClinicId: null,
      })
    ).toBe("/login");
  });

  it("pending with no clinic continues to /join, not /patients", () => {
    expect(continuePathAfterAuth(pendingNoClinic())).toBe("/join");
  });

  it("approved technician continues to the patients workspace", () => {
    expect(
      continuePathAfterAuth({
        hasGoogleUser: true,
        role: "technician",
        status: "approved",
        clinicId: "c1",
        writeClinicId: "c1",
        hasPin: true,
        pinUnlocked: true,
        rosterAllowed: true,
      })
    ).toBe("/patients");
  });

  it("owner continues to /owner", () => {
    expect(
      continuePathAfterAuth({
        hasGoogleUser: true,
        role: "owner",
        status: "approved",
        clinicId: null,
        writeClinicId: null,
      })
    ).toBe("/owner");
  });
});

function pendingNoClinic(): AuthStateInput {
  return {
    hasGoogleUser: true,
    role: "pending",
    status: "pending",
    clinicId: null,
    writeClinicId: null,
    ...PIN_AND_ROSTER_READY,
  };
}
