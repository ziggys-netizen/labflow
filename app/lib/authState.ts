/**
 * Authentication evaluates in this order. Later layers must not run until
 * earlier ones have passed. Adding a layer without a test in `authState.test.ts`
 * is how the join-loop happened.
 *
 * 1. Google session
 * 2. Approval status
 * 3. Clinic membership
 * 4. Terms acceptance (`termsRequired`)
 * 5. PIN
 * 6. Roster
 *
 * `pending` with no clinic reaches `/join` before terms, PIN, or roster apply.
 * Terms refer to the PIN, so accepting first reads correctly.
 * PIN is set after approval (PRD §4.2). PinGate must not render until pinApplies.
 *
 * The owner is exempt from the terms layer — processor, not clinic staff.
 */

import { ACCEPTABLE_USE } from "./legal/acceptableUse";
import {
  TERMS_PATH,
  isOwnerExemptFromStaffTerms,
  isTermsReadablePath,
  termsGateSatisfied,
} from "./legal/termsGate";
import { capabilityRedirect, landingPathForRole } from "./permissions";

export const AUTH_LAYERS = [
  "google",
  "approval",
  "membership",
  "termsRequired",
  "pin",
  "roster",
] as const;
export type AuthLayer = (typeof AUTH_LAYERS)[number];

export type AuthStateInput = {
  hasGoogleUser: boolean;
  role: string | null;
  status: string | null;
  clinicId: string | null;
  writeClinicId: string | null;
  /**
   * Newest accepted version of the clinic staff terms for this user.
   * Ignored until the terms layer (after membership). The owner is exempt —
   * this field is not read for owner. Omit/`null` means no current acceptance.
   */
  acceptedTermsVersion?: string | null;
  /**
   * Terms lookup timed out with a cached acceptance of any version. Routing
   * may proceed under that version until the network confirms; then this is
   * cleared and a newer published version gates again.
   */
  termsTimeoutGrace?: boolean;
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
 * Terms version is included because `termsRequired` is a routing destination.
 */
export function sessionAuthInput(session: {
  user: { uid: string } | null;
  role: string | null;
  status: string | null;
  clinicId: string | null;
  writeClinicId: string | null;
  acceptedTermsVersion?: string | null;
  termsTimeoutGrace?: boolean;
}): AuthStateInput {
  return {
    hasGoogleUser: Boolean(session.user),
    role: session.role,
    status: session.status,
    clinicId: session.clinicId,
    writeClinicId: session.writeClinicId,
    acceptedTermsVersion: session.acceptedTermsVersion,
    termsTimeoutGrace: session.termsTimeoutGrace,
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

function evaluateTermsThenPin(input: AuthStateInput): AuthStateDecision {
  if (
    !isOwnerExemptFromStaffTerms(input.role) &&
    !termsGateSatisfied({
      acceptedVersion: input.acceptedTermsVersion,
      currentVersion: ACCEPTABLE_USE.version,
      timeoutGrace: input.termsTimeoutGrace,
    })
  ) {
    return beforePin(TERMS_PATH, "termsRequired");
  }
  return evaluatePinAndRoster(input);
}

/**
 * Route and gate decision for one auth snapshot. Pathname is not an input —
 * callers compare `destination` to the current path.
 *
 * PIN and roster fields on the input are read only after Google, approval,
 * membership, and terms have passed. `pinApplies` / `rosterApplies` are the
 * spec for PinGate and the staff session: those overlays must not run when
 * the flag is false, even if a PIN record or roster decision exists.
 */
export function evaluateAuthState(input: AuthStateInput): AuthStateDecision {
  if (!input.hasGoogleUser) {
    return beforePin("/login", "google");
  }

  if (isOwnerExemptFromStaffTerms(input.role)) {
    // Decision: owner is the processor, not clinic staff. These terms do not
    // apply. Exempt from the gate — not an oversight. (clinicId is null, so
    // the owner also cannot create an acceptance.)
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

  return evaluateTermsThenPin(input);
}

/**
 * Path ProtectedRoute must send them to. Auth layers win over page
 * capabilities — a pending user on `/patients` goes to `/join`, not the
 * patients landing. When `destination` is already the required onboarding
 * path, it is still returned so capability fallbacks cannot bounce them off it.
 *
 * During `termsRequired`, `/terms` and `/legal/*` document routes may stay
 * so the footer Terms link is not a trap.
 */
export function protectedRouteDestination(
  input: AuthStateInput,
  pathname: string,
  require?: RouteRequire
): string | null {
  const decision = evaluateAuthState(input);
  if (decision.destination) {
    if (decision.layer === "termsRequired" && isTermsReadablePath(pathname)) {
      return null;
    }
    return decision.destination;
  }
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
