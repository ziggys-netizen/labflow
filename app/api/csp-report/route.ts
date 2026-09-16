export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Browsers POST here when Content-Security-Policy-Report-Only blocks
 * something (see next.config.ts). Report bodies are resource URIs and the
 * page path that triggered them — a Lab ID may appear in that path, never a
 * patient name, so this is safe to land in server logs during the soak week.
 */
export async function POST(request: Request) {
  try {
    const body = await request.text();
    console.warn("[csp-report]", body);
  } catch (err) {
    console.error(err);
  }
  return new Response(null, { status: 204 });
}
