import { getAdminAuth, getAdminDb } from "./firebaseAdmin";
import { resolveIdentity } from "./membership";
import { canManageStaff } from "./permissions";

/**
 * Custom claims are exactly { clinicId, role, shift }.
 * Owner clinicId is omitted (membership is null; acting clinic is never a claim).
 * Shift is omitted unless the active role has one.
 */
export type LabFlowClaims = {
  clinicId?: string;
  role: string;
  shift?: string;
};

export function claimsFromUserData(data: Record<string, unknown> | undefined): LabFlowClaims {
  const identity = resolveIdentity(data);
  if (identity.role === "owner") {
    return { role: "owner" };
  }
  const claims: LabFlowClaims = { role: identity.role ?? "pending" };
  if (identity.clinicId) claims.clinicId = identity.clinicId;
  if (identity.shift) claims.shift = identity.shift;
  return claims;
}

export async function applyClaimsForUid(uid: string): Promise<LabFlowClaims> {
  const snap = await getAdminDb().collection("users").doc(uid).get();
  if (!snap.exists) {
    throw new Error("USER_NOT_FOUND");
  }
  const claims = claimsFromUserData(snap.data() as Record<string, unknown> | undefined);
  await getAdminAuth().setCustomUserClaims(uid, claims);
  return claims;
}

export async function callerMaySyncUid(callerUid: string, targetUid: string): Promise<boolean> {
  if (callerUid === targetUid) return true;
  const db = getAdminDb();
  const [callerSnap, targetSnap] = await Promise.all([
    db.collection("users").doc(callerUid).get(),
    db.collection("users").doc(targetUid).get(),
  ]);
  if (!callerSnap.exists || !targetSnap.exists) return false;
  const caller = resolveIdentity(callerSnap.data() as Record<string, unknown> | undefined);
  if (!canManageStaff(caller.role)) return false;
  if (caller.role === "owner") return true;
  const target = resolveIdentity(targetSnap.data() as Record<string, unknown> | undefined);
  const clinic = caller.clinicId;
  if (!clinic) return false;
  return (
    target.clinicId === clinic || target.memberships.some((m) => m.clinicId === clinic)
  );
}
