import { getAdminDb, isAdminCredentialError } from "@/app/lib/firebaseAdmin";
import {
  json503,
  jsonError,
  readJoinCode,
  readJsonBody,
  requireVerifiedUser,
} from "@/app/lib/apiAuth";
import { applyClaimsForUid } from "@/app/lib/userClaims";
import { resolveIdentity } from "@/app/lib/membership";
import { consumeMatchingPreApproval } from "@/app/lib/preApprovalServer";

/**
 * Join confirm. clinicId in the body is ignored — the clinic is re-resolved
 * from the join code. Pre-approval consume happens here only (Admin SDK).
 */
export async function POST(request: Request) {
  const auth = await requireVerifiedUser(request);
  if (auth instanceof Response) return auth;

  try {
    const body = await readJsonBody(request);
    const joinCode = readJoinCode(body);
    if (!joinCode) return jsonError(400, "Enter a join code.");

    const userRef = getAdminDb().collection("users").doc(auth.token.uid);
    const userSnap = await userRef.get();
    const identity = resolveIdentity(userSnap.data() as Record<string, unknown> | undefined);
    if (identity.role === "owner") {
      return jsonError(403, "The owner account does not join a clinic.");
    }
    if (identity.clinicId) {
      return jsonError(403, "This account already belongs to a clinic.");
    }

    const snapshot = await getAdminDb()
      .collection("clinics")
      .where("joinCode", "==", joinCode)
      .limit(5)
      .get();
    const found = snapshot.docs.find((d) => d.data().active !== false);
    if (!found) {
      return jsonError(400, "That code is not valid.");
    }

    const result = await consumeMatchingPreApproval({
      uid: auth.token.uid,
      email: identity.email || auth.token.email,
      clinicId: found.id,
    });
    if (!result.applied) {
      await userRef.update({ clinicId: found.id });
    }
    await applyClaimsForUid(auth.token.uid);

    const name = found.data().name;
    const clinicName =
      typeof name === "string" && name.trim() ? name.trim() : "this clinic";
    return Response.json({ ok: true, clinicName, autoApproved: result.applied });
  } catch (err) {
    if (isAdminCredentialError(err)) return json503();
    console.error(err);
    return jsonError(500, "Something went wrong. Please try again.");
  }
}
