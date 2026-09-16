import { isAdminCredentialError } from "@/app/lib/firebaseAdmin";
import { json503, jsonError } from "@/app/lib/apiAuth";
import { ResendUnavailableError } from "@/app/lib/resendMail";
import { runReorderDigest } from "@/app/lib/lowStockServer";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

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
    const result = await runReorderDigest();
    return Response.json({ ok: true, ...result });
  } catch (err) {
    if (isAdminCredentialError(err)) return json503();
    if (err instanceof ResendUnavailableError) {
      console.error(err);
      // A missing mail setting is configuration, not an unavailable service.
      return jsonError(500, "Email delivery is not configured for stock alerts.");
    }
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
