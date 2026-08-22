import { isAdminCredentialError } from "@/app/lib/firebaseAdmin";
import { json503, jsonError } from "@/app/lib/apiAuth";
import { lapseExpiredPreApprovals } from "@/app/lib/preApprovalServer";

export const dynamic = "force-dynamic";

function cronAuthorized(request: Request) {
  const secret = process.env.CRON_SECRET;
  const header = request.headers.get("authorization") || "";
  if (secret) return header === `Bearer ${secret}`;
  if (request.headers.get("x-vercel-cron") === "1") return true;
  return !process.env.VERCEL;
}

async function run(request: Request) {
  if (!cronAuthorized(request)) return jsonError(401, "Unauthorized.");
  try {
    const result = await lapseExpiredPreApprovals();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    if (isAdminCredentialError(err)) return json503();
    console.error(err);
    return jsonError(500, "Something went wrong. Please try again.");
  }
}

/** Vercel Cron sends GET. */
export async function GET(request: Request) {
  return run(request);
}

export async function POST(request: Request) {
  return run(request);
}
