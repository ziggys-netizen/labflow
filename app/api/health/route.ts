import {
  AdminUnavailableError,
  getAdminApp,
  isAdminCredentialError,
} from "@/app/lib/firebaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

function notOk() {
  return Response.json({ ok: false }, { status: 503 });
}

/**
 * Cheap Admin SDK probe for preview. No collection scans, no secrets, no PHI.
 * Credentials are resolved at request time so `next build` does not need GCP.
 */
export async function GET() {
  try {
    const app = getAdminApp();
    const credential = app.options.credential;
    if (!credential || typeof credential.getAccessToken !== "function") {
      return notOk();
    }
    await credential.getAccessToken();
    return Response.json({ ok: true, serverNow: new Date().toISOString() });
  } catch (err) {
    if (err instanceof AdminUnavailableError || isAdminCredentialError(err)) {
      return notOk();
    }
    console.error(err);
    return notOk();
  }
}
