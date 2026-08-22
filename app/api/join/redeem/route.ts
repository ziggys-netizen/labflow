import { getAdminDb, isAdminCredentialError } from "@/app/lib/firebaseAdmin";
import {
  json503,
  jsonError,
  readJoinCode,
  readJsonBody,
  requireVerifiedUser,
} from "@/app/lib/apiAuth";
import { logAudit } from "@/app/lib/auditAdmin";
import { resolveIdentity } from "@/app/lib/membership";

const MAX_ATTEMPTS_PER_HOUR = 5;

async function rateLimited(uid: string): Promise<boolean> {
  const hour = new Date().toISOString().slice(0, 13);
  const ref = getAdminDb().collection("serverJoinRateLimits").doc(uid);
  const snap = await ref.get();
  const data = snap.data();
  const count = data?.hour === hour ? Number(data.count) || 0 : 0;
  if (count >= MAX_ATTEMPTS_PER_HOUR) return true;
  await ref.set({
    hour,
    count: count + 1,
    updatedAt: new Date().toISOString(),
  });
  return false;
}

export async function POST(request: Request) {
  const auth = await requireVerifiedUser(request);
  if (auth instanceof Response) return auth;

  try {
    const body = await readJsonBody(request);
    const joinCode = readJoinCode(body);
    if (!joinCode) return jsonError(400, "Enter a join code.");

    const userSnap = await getAdminDb().collection("users").doc(auth.token.uid).get();
    const identity = resolveIdentity(userSnap.data() as Record<string, unknown> | undefined);
    if (identity.role === "owner") {
      return jsonError(403, "The owner account does not join a clinic.");
    }
    if (identity.clinicId) {
      return jsonError(403, "This account already belongs to a clinic.");
    }

    if (await rateLimited(auth.token.uid)) {
      return jsonError(429, "Too many attempts. Try again in an hour.");
    }

    const snapshot = await getAdminDb()
      .collection("clinics")
      .where("joinCode", "==", joinCode)
      .limit(5)
      .get();
    const found = snapshot.docs.find((d) => d.data().active !== false);

    if (!found) {
      try {
        await logAudit({
          clinicId: null,
          actor: {
            uid: auth.token.uid,
            email: auth.token.email ?? identity.email,
            role: identity.role,
            shift: identity.shift,
            actingAsOwner: false,
          },
          action: "joinCode.failedAttempt",
          targetCollection: "clinics",
          targetId: "",
          targetLabel: "join code",
          detail: { reason: "invalid or inactive join code" },
        });
      } catch (err) {
        console.error(err);
      }
      return Response.json({ found: false });
    }

    const name = found.data().name;
    const clinicName =
      typeof name === "string" && name.trim() ? name.trim() : "this clinic";
    return Response.json({ found: true, clinicName });
  } catch (err) {
    if (isAdminCredentialError(err)) return json503();
    console.error(err);
    return jsonError(500, "Something went wrong. Please try again.");
  }
}
