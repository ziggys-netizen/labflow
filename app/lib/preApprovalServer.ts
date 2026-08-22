import { FieldValue } from "firebase-admin/firestore";
import { getAdminDb } from "./firebaseAdmin";
import { logAudit } from "./auditAdmin";
import { resolveIdentity, type ResolvedIdentity } from "./membership";
import { canManageStaff, isAssignableRole, isShift, roleRequiresShift } from "./permissions";
import {
  isPendingUnexpired,
  normalizeStaffEmail,
  preApprovalExpiry,
  preApprovalFromData,
  type PreApproval,
  type PreApprovalInputRow,
  validatePreApprovalDraft,
} from "./preApprovals";

export class PreApprovalError extends Error {
  constructor(
    message: string,
    public httpStatus = 400
  ) {
    super(message);
    this.name = "PreApprovalError";
  }
}

function actorFromIdentity(
  uid: string,
  identity: ResolvedIdentity
): Parameters<typeof logAudit>[0]["actor"] {
  return {
    uid,
    email: identity.email,
    role: identity.role,
    shift: identity.shift,
    actingAsOwner: identity.role === "owner",
  };
}

function asString(value: unknown) {
  return typeof value === "string" && value.trim() ? value : null;
}

export async function assertCanManageClinicStaff(
  uid: string,
  clinicId: string
): Promise<{ identity: ResolvedIdentity; clinicId: string }> {
  if (!clinicId) throw new PreApprovalError("Select a clinic.", 400);
  const snap = await getAdminDb().collection("users").doc(uid).get();
  if (!snap.exists) throw new PreApprovalError("Not allowed to manage staff.", 403);
  const identity = resolveIdentity(snap.data() as Record<string, unknown> | undefined);
  if (identity.role === "owner") return { identity, clinicId };
  if (!canManageStaff(identity.role) || identity.status !== "approved") {
    throw new PreApprovalError("Not allowed to manage staff.", 403);
  }
  const inClinic =
    identity.clinicId === clinicId ||
    identity.memberships.some((m) => m.clinicId === clinicId && m.status === "approved");
  if (!inClinic) throw new PreApprovalError("You can only manage your own clinic.", 403);
  return { identity, clinicId };
}

async function pendingForEmail(clinicId: string, email: string) {
  const snapshot = await getAdminDb()
    .collection("preApprovals")
    .where("clinicId", "==", clinicId)
    .where("email", "==", email)
    .limit(20)
    .get();
  const now = Date.now();
  return snapshot.docs.filter((d) => isPendingUnexpired(d.data(), now));
}

export async function createPreApprovalRecord(options: {
  clinicId: string;
  email: string;
  role: string;
  shift?: string | null;
  actorUid: string;
  actor: ReturnType<typeof actorFromIdentity>;
}): Promise<string> {
  const clinic = await getAdminDb().collection("clinics").doc(options.clinicId).get();
  if (!clinic.exists) throw new PreApprovalError("Clinic not found.");
  let draft;
  try {
    draft = validatePreApprovalDraft({
      email: options.email,
      role: options.role,
      shift: options.shift,
    });
  } catch (err) {
    throw new PreApprovalError(err instanceof Error ? err.message : "Invalid pre-approval.");
  }
  const existing = await pendingForEmail(options.clinicId, draft.email);
  if (existing.length > 0) {
    throw new PreApprovalError("A pending pre-approval already exists for this email.");
  }
  const now = new Date().toISOString();
  const payload = {
    clinicId: options.clinicId,
    email: draft.email,
    role: draft.role,
    shift: draft.shift,
    createdAt: now,
    createdByUid: options.actorUid,
    createdByEmail: options.actor.email,
    expiresAt: preApprovalExpiry(),
    status: "pending" as const,
    consumedByUid: null,
    consumedAt: null,
  };
  const ref = await getAdminDb().collection("preApprovals").add(payload);
  try {
    await logAudit({
      clinicId: options.clinicId,
      actor: options.actor,
      action: "preApproval.create",
      targetCollection: "preApprovals",
      targetId: ref.id,
      targetLabel: draft.email,
      detail: { role: draft.role, shift: draft.shift, expiresAt: payload.expiresAt },
    });
  } catch (err) {
    console.error(err);
  }
  return ref.id;
}

export async function createPreApprovalRows(options: {
  clinicId: string;
  rows: PreApprovalInputRow[];
  actorUid: string;
  actor: ReturnType<typeof actorFromIdentity>;
}): Promise<{ created: number; errors: string[] }> {
  let created = 0;
  const errors: string[] = [];
  for (const row of options.rows) {
    try {
      await createPreApprovalRecord({
        clinicId: options.clinicId,
        email: row.email,
        role: row.role,
        shift: row.shift,
        actorUid: options.actorUid,
        actor: options.actor,
      });
      created += 1;
    } catch (err) {
      const message = err instanceof Error ? err.message : "failed";
      errors.push(`${row.email || "(blank)"}: ${message}`);
    }
  }
  return { created, errors };
}

export async function listPendingPreApprovals(options: {
  clinicId: string;
  callerEmail: string | null | undefined;
}): Promise<PreApproval[]> {
  const snapshot = await getAdminDb()
    .collection("preApprovals")
    .where("clinicId", "==", options.clinicId)
    .get();
  const now = Date.now();
  const self = normalizeStaffEmail(options.callerEmail || "");
  return snapshot.docs
    .map((d) => preApprovalFromData(d.id, d.data() as Record<string, unknown>))
    .filter((row): row is PreApproval => row !== null)
    .filter((row) => row.status === "pending" && isPendingUnexpired(row, now))
    .filter((row) => !self || row.email !== self)
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function revokePreApproval(options: {
  id: string;
  clinicId: string;
  actorUid: string;
  actor: ReturnType<typeof actorFromIdentity>;
}) {
  const ref = getAdminDb().collection("preApprovals").doc(options.id);
  const snap = await ref.get();
  if (!snap.exists) throw new PreApprovalError("Pre-approval not found.", 404);
  const data = snap.data() || {};
  if (String(data.clinicId || "") !== options.clinicId) {
    throw new PreApprovalError("Pre-approval not found.", 404);
  }
  if (!isPendingUnexpired(data)) {
    throw new PreApprovalError("Only unused, unexpired pre-approvals can be revoked.");
  }
  await ref.delete();
  try {
    await logAudit({
      clinicId: options.clinicId,
      actor: options.actor,
      action: "preApproval.revoke",
      targetCollection: "preApprovals",
      targetId: options.id,
      targetLabel: normalizeStaffEmail(String(data.email || "")),
      detail: { role: data.role || null, shift: data.shift || null },
    });
  } catch (err) {
    console.error(err);
  }
}

/**
 * Consume a matching pending pre-approval inside join confirm only.
 * Re-checks expiresAt. Sets role, shift, and approved status in one write.
 */
export async function consumeMatchingPreApproval(options: {
  uid: string;
  email: string | undefined | null;
  clinicId: string;
}): Promise<{ applied: boolean; role?: string }> {
  const email = normalizeStaffEmail(options.email);
  if (!email || !options.clinicId) return { applied: false };

  const db = getAdminDb();
  const userRef = db.collection("users").doc(options.uid);
  const query = db
    .collection("preApprovals")
    .where("clinicId", "==", options.clinicId)
    .where("email", "==", email)
    .limit(20);

  const consumedAt = new Date().toISOString();
  const snapshot = await query.get();
  const candidate = snapshot.docs.find((d) => isPendingUnexpired(d.data(), Date.now()));
  if (!candidate) return { applied: false };

  const result = await db.runTransaction(async (tx) => {
    const userSnap = await tx.get(userRef);
    if (!userSnap.exists) return { applied: false as const };
    const fresh = await tx.get(candidate.ref);
    if (!fresh.exists) return { applied: false as const };
    const data = fresh.data() || {};
    const now = Date.now();
    if (!isPendingUnexpired(data, now)) return { applied: false as const };

    const role = String(data.role || "");
    if (!isAssignableRole(role)) return { applied: false as const };
    if (roleRequiresShift(role) && !isShift(asString(data.shift))) return { applied: false as const };
    const expires = Date.parse(String(data.expiresAt || ""));
    if (!Number.isFinite(expires) || expires <= now) return { applied: false as const };

    const shiftRaw = asString(data.shift);
    const shift = isShift(shiftRaw) ? shiftRaw : null;
    const stamp = {
      approvedByUid: asString(data.createdByUid),
      approvedByUsername: asString(data.createdByUsername),
      approvedByEmail: asString(data.createdByEmail),
      approvedAt: consumedAt,
    };
    tx.set(
      userRef,
      {
        clinicId: options.clinicId,
        activeClinicId: options.clinicId,
        role,
        status: "approved",
        clinicIds: FieldValue.arrayUnion(options.clinicId),
        [`clinicRoles.${options.clinicId}`]: {
          role,
          status: "approved",
          shift,
          createdAt: asString(data.createdAt) || consumedAt,
          ...stamp,
        },
        approvedBy: stamp.approvedByEmail,
        approvedByUid: stamp.approvedByUid,
        approvedByUsername: stamp.approvedByUsername,
        approvedAt: consumedAt,
      },
      { merge: true }
    );
    tx.update(fresh.ref, {
      status: "consumed",
      consumedByUid: options.uid,
      consumedAt,
    });
    return {
      applied: true as const,
      role,
      shift,
      preId: fresh.id,
      createdByUid: stamp.approvedByUid,
      createdByEmail: stamp.approvedByEmail,
    };
  });

  if (result.applied) {
    try {
      const userSnap = await userRef.get();
      const identity = resolveIdentity(userSnap.data() as Record<string, unknown> | undefined);
      await logAudit({
        clinicId: options.clinicId,
        actor: actorFromIdentity(options.uid, identity),
        action: "preApproval.consume",
        targetCollection: "preApprovals",
        targetId: result.preId || options.uid,
        targetLabel: email,
        detail: {
          role: result.role,
          shift: result.shift ?? null,
          createdByUid: result.createdByUid,
          createdByEmail: result.createdByEmail,
        },
      });
    } catch (err) {
      console.error(err);
    }
  }

  return { applied: result.applied, role: result.role };
}

export async function lapseExpiredPreApprovals(now = new Date()) {
  const nowIso = now.toISOString();
  const db = getAdminDb();
  const snapshot = await db
    .collection("preApprovals")
    .where("status", "==", "pending")
    .where("expiresAt", "<=", nowIso)
    .get();

  let lapsed = 0;
  const actor = {
    uid: "system",
    email: null,
    role: "system",
    shift: null,
    actingAsOwner: false,
  } as const;

  for (const docSnap of snapshot.docs) {
    const data = docSnap.data();
    if (data.consumedAt || data.consumedByUid || data.usedAt) continue;
    await docSnap.ref.update({ status: "lapsed" });
    lapsed += 1;
    try {
      await logAudit({
        clinicId: asString(data.clinicId),
        actor,
        action: "preApproval.lapse",
        targetCollection: "preApprovals",
        targetId: docSnap.id,
        targetLabel: normalizeStaffEmail(String(data.email || "")),
        detail: { expiresAt: data.expiresAt || null },
      });
    } catch (err) {
      console.error(err);
    }
  }
  return { lapsed };
}

export { actorFromIdentity };
