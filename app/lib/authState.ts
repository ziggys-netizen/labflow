/**
 * Authentication evaluates in this order. Later layers must not run until
 * earlier ones have passed. Adding a layer without a test in `authState.test.ts`
 * is how the join-loop happened.
 *
 * 1. Google session
 * 2. Approval status
 * 3. Clinic membership
 * 4. PIN
 * 5. Roster
 *
 * `pending` with no clinic reaches `/join` before PIN or roster apply.
 * PIN is set after approval (PRD §4.2). PinGate must not render until layer 4.
 */

import { capabilityRedirect, landingPathForRole } from "./permissions";

export const AUTH_LAYERS = ["google", "approval", "membership", "pin", "roster"] as const;
export type AuthLayer = (typeof AUTH_LAYERS)[number];

export type AuthStateInput = {
  hasGoogleUser: boolean;
  role: string | null;
  status: string | null;
  clinicId: string | null;
  writeClinicId: string | null;
  /**
   * PIN record exists for this account at the active clinic.
   * Ignored until the PIN layer. Omit when only routing is needed.
   */
  hasPin?: boolean;
  /**
   * Verified PIN identity is currently unlocked (not idle-locked).
   * Ignored until the PIN layer, and roster does not run until this is true.
   */
  pinUnlocked?: boolean;
  /**
   * Roster currently allows work. Ignored until PIN identity exists.
   */
  rosterAllowed?: boolean;
};

export type AuthStateDecision = {
  /** Path they must be on. Null means any post-onboarding path. */
  destination: string | null;
  /** First unsatisfied layer, or `ok` when every in-scope layer has passed. */
  layer: AuthLayer | "ok";
  pinApplies: boolean;
  rosterApplies: boolean;
  pinNeedsSetup: boolean;
};

export type RouteRequire = (role: string | null) => boolean;

function beforePin(destination: string, layer: AuthLayer): AuthStateDecision {
  return {
    destination,
    layer,
    pinApplies: false,
    rosterApplies: false,
    pinNeedsSetup: false,
  };
}

function clinicOf(input: AuthStateInput): string | null {
  return input.clinicId && input.clinicId.trim() ? input.clinicId : null;
}

/**
 * Map AuthContext fields into the machine. PIN/roster details are omitted so
 * routing callers cannot accidentally let those layers run early.
 */
export function sessionAuthInput(session: {
  user: { uid: string } | null;
  role: string | null;
  status: string | null;
  clinicId: string | null;
  writeClinicId: string | null;
}): AuthStateInput {
  return {
    hasGoogleUser: Boolean(session.user),
    role: session.role,
    status: session.status,
    clinicId: session.clinicId,
    writeClinicId: session.writeClinicId,
  };
}

function evaluatePinAndRoster(input: AuthStateInput): AuthStateDecision {
  const pinApplies = input.role === "owner" ? Boolean(input.writeClinicId) : Boolean(clinicOf(input));
  if (!pinApplies) {
    return {
      destination: null,
      layer: "ok",
      pinApplies: false,
      rosterApplies: false,
      pinNeedsSetup: false,
    };
  }

  if (input.hasPin === false) {
    return {
      destination: null,
      layer: "pin",
      pinApplies: true,
      rosterApplies: false,
      pinNeedsSetup: true,
    };
  }

  if (input.hasPin === true && input.pinUnlocked !== true) {
    return {
      destination: null,
      layer: "pin",
      pinApplies: true,
      rosterApplies: false,
      pinNeedsSetup: false,
    };
  }

  if (input.pinUnlocked === true) {
    const rosterOk = input.rosterAllowed !== false;
    return {
      destination: null,
      layer: rosterOk ? "ok" : "roster",
      pinApplies: true,
      rosterApplies: true,
      pinNeedsSetup: false,
    };
  }

  return {
    destination: null,
    layer: "pin",
    pinApplies: true,
    rosterApplies: false,
    pinNeedsSetup: false,
  };
}

/**
 * Route and gate decision for one auth snapshot. Pathname is not an input —
 * callers compare `destination` to the current path.
 *
 * PIN and roster fields on the input are read only after Google, approval, and
 * membership have passed. `pinApplies` / `rosterApplies` are the spec for
 * PinGate and the staff session: those overlays must not run when the flag is
 * false, even if a PIN record or roster decision exists.
 */
export function evaluateAuthState(input: AuthStateInput): AuthStateDecision {
  if (!input.hasGoogleUser) {
    return beforePin("/login", "google");
  }

  if (input.role === "owner") {
    return evaluatePinAndRoster(input);
  }

  if (input.status === "rejected") {
    return beforePin("/pending", "approval");
  }

  const clinicId = clinicOf(input);
  if (input.status !== "approved") {
    if (!clinicId) {
      return beforePin("/join", "membership");
    }
    return beforePin("/pending", "approval");
  }

  if (!clinicId) {
    return beforePin("/join", "membership");
  }

  return evaluatePinAndRoster(input);
}

/**
 * Path ProtectedRoute must send them to. Auth layers win over page
 * capabilities — a pending user on `/patients` goes to `/join`, not the
 * patients landing. When `destination` is already the required onboarding
 * path, it is still returned so capability fallbacks cannot bounce them off it.
 */
export function protectedRouteDestination(
  input: AuthStateInput,
  pathname: string,
  require?: RouteRequire
): string | null {
  const decision = evaluateAuthState(input);
  if (decision.destination) return decision.destination;
  const locked = capabilityRedirect(input.role, pathname);
  if (locked) return locked;
  if (require && !require(input.role)) {
    return landingPathForRole(input.role, input.clinicId);
  }
  return null;
}

/** Where a signed-in session should continue; `/login` when signed out. */
export function continuePathAfterAuth(input: AuthStateInput): string {
  const decision = evaluateAuthState(input);
  if (decision.destination) return decision.destination;
  return landingPathForRole(input.role, input.clinicId);
}
