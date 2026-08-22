import type { NextRequest } from "next/server";
import { isAdminCredentialError } from "@/app/lib/firebaseAdmin";
import {
  asRecord,
  json503,
  jsonError,
  readJsonBody,
  requireVerifiedUser,
} from "@/app/lib/apiAuth";
import {
  actorFromIdentity,
  assertCanManageClinicStaff,
  createPreApprovalRecord,
  createPreApprovalRows,
  listPendingPreApprovals,
  PreApprovalError,
} from "@/app/lib/preApprovalServer";
import type { PreApprovalInputRow } from "@/app/lib/preApprovals";

function readClinicId(value: unknown) {
  return typeof value === "string" ? value.trim() : "";
}

function readRows(body: Record<string, unknown>): PreApprovalInputRow[] | null {
  if (!Array.isArray(body.rows)) return null;
  return body.rows.map((row) => {
    const record = asRecord(row);
    return {
      email: typeof record.email === "string" ? record.email : "",
      role: typeof record.role === "string" ? record.role : "",
      shift: typeof record.shift === "string" ? record.shift : "",
    };
  });
}

export async function GET(request: NextRequest) {
  const auth = await requireVerifiedUser(request);
  if (auth instanceof Response) return auth;

  try {
    const requested = readClinicId(request.nextUrl.searchParams.get("clinicId"));
    const { identity, clinicId } = await assertCanManageClinicStaff(
      auth.token.uid,
      requested || ""
    );
    const rows = await listPendingPreApprovals({
      clinicId,
      callerEmail: identity.email || auth.token.email,
    });
    return Response.json({ ok: true, rows });
  } catch (err) {
    if (err instanceof PreApprovalError) return jsonError(err.httpStatus, err.message);
    if (isAdminCredentialError(err)) return json503();
    console.error(err);
    return jsonError(500, "Something went wrong. Please try again.");
  }
}

export async function POST(request: Request) {
  const auth = await requireVerifiedUser(request);
  if (auth instanceof Response) return auth;

  try {
    const body = asRecord(await readJsonBody(request));
    const { identity, clinicId } = await assertCanManageClinicStaff(
      auth.token.uid,
      readClinicId(body.clinicId)
    );
    const actor = actorFromIdentity(auth.token.uid, identity);
    const rows = readRows(body);
    if (rows) {
      const result = await createPreApprovalRows({
        clinicId,
        rows,
        actorUid: auth.token.uid,
        actor,
      });
      return Response.json({ ok: true, ...result });
    }
    const id = await createPreApprovalRecord({
      clinicId,
      email: typeof body.email === "string" ? body.email : "",
      role: typeof body.role === "string" ? body.role : "",
      shift: typeof body.shift === "string" ? body.shift : "",
      actorUid: auth.token.uid,
      actor,
    });
    return Response.json({ ok: true, id, created: 1 });
  } catch (err) {
    if (err instanceof PreApprovalError) return jsonError(err.httpStatus, err.message);
    if (isAdminCredentialError(err)) return json503();
    console.error(err);
    return jsonError(500, "Something went wrong. Please try again.");
  }
}
