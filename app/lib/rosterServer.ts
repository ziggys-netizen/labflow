/**
 * Server-side roster check for trusted routes (export, privileged staff).
 *
 * Same category as the PIN: attribution and friction, not a security boundary.
 * Firestore rules do not evaluate recurrence. A queued write that syncs
 * outside the window is retained.
 */

import { getAdminDb } from "./firebaseAdmin";
import { jsonError } from "./apiAuth";
import { isClinicAdmin } from "./permissions";
import {
  activeBreakGlass,
  evaluateRosterAccess,
  parseRosterEntry,
  parseRosterException,
  parseRosterSession,
} from "./roster";

export async function requireRosterAccess(options: {
  uid: string;
  role: string | null;
  clinicId: string | null;
  staffManagement?: boolean;
}): Promise<{ offRoster: boolean } | Response> {
  if (options.role === "owner") return { offRoster: false };
  if (options.staffManagement && isClinicAdmin(options.role)) return { offRoster: false };
  if (!options.clinicId) return { offRoster: false };

  const db = getAdminDb();
  const clinicSnap = await db.collection("clinics").doc(options.clinicId).get();
  const clinic = clinicSnap.data() || {};
  const rosteringEnabled = clinic.rosteringEnabled === true;

  const [entrySnap, exceptionSnap, sessionSnap] = await Promise.all([
    db.collection("rosterEntries").where("clinicId", "==", options.clinicId).get(),
    db.collection("rosterExceptions").where("clinicId", "==", options.clinicId).get(),
    db.collection("rosterSessions").where("clinicId", "==", options.clinicId).get(),
  ]);

  const clinicEntries = entrySnap.docs
    .map((doc) => parseRosterEntry(doc.id, doc.data() as Record<string, unknown>))
    .filter((row): row is NonNullable<typeof row> => row !== null);
  const exceptions = exceptionSnap.docs
    .map((doc) => parseRosterException(doc.id, doc.data() as Record<string, unknown>))
    .filter((row): row is NonNullable<typeof row> => row !== null && row.userUid === options.uid);
  const sessions = sessionSnap.docs
    .map((doc) => parseRosterSession(doc.id, doc.data() as Record<string, unknown>))
    .filter((row): row is NonNullable<typeof row> => row !== null);

  const now = new Date();
  const glass = activeBreakGlass(sessions, options.uid, now);
  const decision = evaluateRosterAccess({
    now,
    role: options.role,
    userUid: options.uid,
    rosteringEnabled,
    clinicEntries,
    userEntries: clinicEntries.filter((row) => row.userUid === options.uid),
    exceptions,
    breakGlassUntil: glass ? new Date(glass.endsAt) : null,
  });

  if (decision.allowed) return { offRoster: decision.offRoster };
  return jsonError(403, decision.message || "You are outside your roster window.");
}
