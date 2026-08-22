import { isAdminCredentialError } from "@/app/lib/firebaseAdmin";
import {
  asRecord,
  json503,
  jsonError,
  readJsonBody,
  requireVerifiedUser,
} from "@/app/lib/apiAuth";
import { applyClaimsForUid, callerMaySyncUid } from "@/app/lib/userClaims";

export async function POST(request: Request) {
  const auth = await requireVerifiedUser(request);
  if (auth instanceof Response) return auth;

  try {
    const body = asRecord(await readJsonBody(request));
    const requested =
      typeof body.uid === "string" && body.uid.trim() ? body.uid.trim() : auth.token.uid;
    // clinicId / role / shift in the body are ignored — claims come from the user doc.
    if (!(await callerMaySyncUid(auth.token.uid, requested))) {
      return jsonError(403, "Not allowed to update those claims.");
    }
    const claims = await applyClaimsForUid(requested);
    return Response.json({ ok: true, role: claims.role });
  } catch (err) {
    if (isAdminCredentialError(err)) return json503();
    if (err instanceof Error && err.message === "USER_NOT_FOUND") {
      return jsonError(404, "User not found.");
    }
    console.error(err);
    return jsonError(500, "Something went wrong. Please try again.");
  }
}
