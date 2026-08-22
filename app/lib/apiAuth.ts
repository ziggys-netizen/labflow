import type { DecodedIdToken } from "firebase-admin/auth";
import {
  AdminUnavailableError,
  getAdminAuth,
  getAdminDb,
  isAdminCredentialError,
} from "./firebaseAdmin";
import { resolveIdentity, type ResolvedIdentity } from "./membership";

export function jsonError(status: number, message: string) {
  return Response.json({ error: message }, { status });
}

export function json503() {
  return jsonError(503, "Trusted server is not configured. See docs/OIDC-SETUP.md.");
}

function bearerToken(request: Request): string | null {
  const header = request.headers.get("authorization") || request.headers.get("Authorization");
  if (!header) return null;
  const match = /^Bearer\s+(\S+)/i.exec(header.trim());
  return match?.[1] ?? null;
}

/**
 * Verifies Authorization: Bearer <idToken>. Never reads clinicId from the body.
 * Missing/invalid token → 401. Admin not configured → 503.
 */
export async function requireVerifiedUser(
  request: Request
): Promise<{ token: DecodedIdToken } | Response> {
  const idToken = bearerToken(request);
  if (!idToken) return jsonError(401, "Sign in required.");
  try {
    const token = await getAdminAuth().verifyIdToken(idToken);
    return { token };
  } catch (err) {
    if (err instanceof AdminUnavailableError || isAdminCredentialError(err)) {
      return json503();
    }
    return jsonError(401, "Invalid or expired session.");
  }
}

function claimString(token: DecodedIdToken, key: string): string | null {
  const value = (token as unknown as Record<string, unknown>)[key];
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export type CapabilityAuth = {
  token: DecodedIdToken;
  identity: ResolvedIdentity;
  role: string | null;
  clinicId: string | null;
  email: string | null;
};

/**
 * Verifies the Bearer token, then checks a permissions.ts predicate against
 * the user-document role (claims as fallback). clinicId in the body is never
 * read here — callers must resolve clinic from the returned identity/claims.
 */
export async function requireCapability(
  request: Request,
  capability: (role: string | null | undefined) => boolean,
  deniedMessage = "Not allowed."
): Promise<CapabilityAuth | Response> {
  const auth = await requireVerifiedUser(request);
  if (auth instanceof Response) return auth;

  try {
    const snap = await getAdminDb().collection("users").doc(auth.token.uid).get();
    const identity = resolveIdentity(snap.data() as Record<string, unknown> | undefined);
    const claimRole = claimString(auth.token, "role");
    const role = identity.role ?? claimRole;
    if (!capability(role)) return jsonError(403, deniedMessage);
    const claimClinic = claimString(auth.token, "clinicId");
    const clinicId = identity.clinicId ?? claimClinic;
    const email = identity.email || auth.token.email || null;
    return { token: auth.token, identity, role, clinicId, email };
  } catch (err) {
    if (err instanceof AdminUnavailableError || isAdminCredentialError(err)) {
      return json503();
    }
    throw err;
  }
}

export async function readJsonBody(request: Request): Promise<unknown> {
  try {
    return await request.json();
  } catch {
    return null;
  }
}

export function asRecord(body: unknown): Record<string, unknown> {
  return body && typeof body === "object" && !Array.isArray(body)
    ? (body as Record<string, unknown>)
    : {};
}

/** Join codes from the client. Ignore any clinicId on the same payload. */
export function readJoinCode(body: unknown): string {
  const record = asRecord(body);
  const raw = record.joinCode;
  if (typeof raw !== "string") return "";
  return raw.trim().toUpperCase().slice(0, 32);
}
