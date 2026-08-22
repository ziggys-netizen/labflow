import { auth } from "./firebase";

async function authedHeaders() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in.");
  const token = await user.getIdToken();
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

async function authedGet(path: string) {
  return fetch(path, { headers: await authedHeaders() });
}

async function authedPost(path: string, body: Record<string, unknown> = {}) {
  return fetch(path, {
    method: "POST",
    headers: await authedHeaders(),
    body: JSON.stringify(body),
  });
}

/**
 * Ask the trusted server to copy clinicId/role/shift from the user document
 * onto Auth custom claims. The client never sends those fields.
 */
export async function syncCustomClaims(uid?: string): Promise<boolean> {
  try {
    const res = await authedPost("/api/auth/claims/sync", uid ? { uid } : {});
    return res.ok;
  } catch (err) {
    console.error(err);
    return false;
  }
}

export async function forceTokenRefresh(): Promise<void> {
  const user = auth.currentUser;
  if (!user) return;
  await user.getIdToken(true);
}

export { authedGet, authedPost };
