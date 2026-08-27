import { isAdminCredentialError } from "@/app/lib/firebaseAdmin";
import {
  asRecord,
  json503,
  jsonError,
  readJsonBody,
  requireVerifiedUser,
} from "@/app/lib/apiAuth";
import { requireRosterAccess } from "@/app/lib/rosterServer";
import {
  actorFromIdentity,
  assertCanManageClinicStaff,
  PreApprovalError,
  revokePreApproval,
} from "@/app/lib/preApprovalServer";

export async function POST(request: Request) {
  const auth = await requireVerifiedUser(request);
  if (auth instanceof Response) return auth;

  try {
    const body = asRecord(await readJsonBody(request));
    const clinicId = typeof body.clinicId === "string" ? body.clinicId.trim() : "";
    const id = typeof body.id === "string" ? body.id.trim() : "";
    if (!id) return jsonError(400, "Missing pre-approval.");
    const { identity } = await assertCanManageClinicStaff(auth.token.uid, clinicId);
    const roster = await requireRosterAccess({
      uid: auth.token.uid,
      role: identity.role,
      clinicId,
      staffManagement: true,
    });
    if (roster instanceof Response) return roster;
    await revokePreApproval({
      id,
      clinicId,
      actorUid: auth.token.uid,
      actor: actorFromIdentity(auth.token.uid, identity),
    });
    return Response.json({ ok: true });
  } catch (err) {
    if (err instanceof PreApprovalError) return jsonError(err.httpStatus, err.message);
    if (isAdminCredentialError(err)) return json503();
    console.error(err);
    return jsonError(500, "Something went wrong. Please try again.");
  }
}
