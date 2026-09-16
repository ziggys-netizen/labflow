import { getAdminDb } from "./firebaseAdmin";
import { logAudit } from "./auditAdmin";
import { resolveIdentity } from "./membership";
import { batchFromData, itemFromData, movementFromData } from "./inventory";
import { usableOnHandByItem } from "./storekeeperBoard";
import {
  buildReorderDigest,
  decideReorderAlert,
  parseReorderAlertState,
  type ReorderAlertKind,
  type ReorderAlertRow,
  type ReorderAlertState,
} from "./lowStock";
import { describeResendFailure, getResend, resendFromAddress } from "./resendMail";

/**
 * Nightly reorder digest.
 *
 * On-hand is summed from the movements ledger with the same reader and the same
 * usable-stock rule the storekeeper's board uses, so the email and the screen
 * can never disagree. Alert state is written back only after the message has
 * actually left, so a mail failure retries tomorrow instead of being swallowed.
 */

/** Who is told. The owner is not on this list; this is a clinic's own business. */
const ALERT_ROLES = ["lab_manager", "clinic_admin", "storekeeper"] as const;

const SYSTEM_ACTOR = {
  uid: "system",
  email: null,
  role: "system",
  shift: null,
  actingAsOwner: false,
} as const;

export type ClinicDigestResult = {
  clinicId: string;
  alerted: number;
  outCount: number;
  lowCount: number;
  recipients: number;
  skipped: "no-alerts" | "no-recipients" | "send-failed" | null;
};

/**
 * A decision for one item. `kind` is null when the stored cycle has to move —
 * a delivery that did not clear the minimum, or stock climbing back above it —
 * but nobody needs to be told. Those are saved without sending anything.
 */
export type PendingAlert = {
  itemId: string;
  kind: ReorderAlertKind | null;
  row: ReorderAlertRow | null;
  nextState: ReorderAlertState;
};

function docData(snap: { data: () => unknown }): Record<string, unknown> {
  return (snap.data() as Record<string, unknown>) || {};
}

function stateChanged(a: ReorderAlertState, b: ReorderAlertState): boolean {
  return a.lastAlertedOnHand !== b.lastAlertedOnHand || a.zeroAlertSent !== b.zeroAlertSent;
}

async function clinicScopedDocs(collectionName: string, clinicId: string) {
  return getAdminDb().collection(collectionName).where("clinicId", "==", clinicId).get();
}

/**
 * Staff of one clinic holding an alert role. Both the memberships map and the
 * older top-level `clinicId` shape are queried — `resolveIdentity` reconciles
 * them, but a user document written before the map existed would never be found
 * by the array query alone.
 */
export async function alertRecipients(clinicId: string): Promise<string[]> {
  const db = getAdminDb();
  const [byArray, byLegacy] = await Promise.all([
    db.collection("users").where("clinicIds", "array-contains", clinicId).get(),
    db.collection("users").where("clinicId", "==", clinicId).get(),
  ]);

  const emails = new Set<string>();
  const seen = new Set<string>();
  for (const snap of [byArray, byLegacy]) {
    for (const userDoc of snap.docs) {
      if (seen.has(userDoc.id)) continue;
      seen.add(userDoc.id);
      const identity = resolveIdentity(docData(userDoc));
      if (!identity.email) continue;
      const holdsAlertRole = identity.memberships.some(
        (membership) =>
          membership.clinicId === clinicId &&
          membership.status === "approved" &&
          (ALERT_ROLES as readonly string[]).includes(membership.role)
      );
      if (holdsAlertRole) emails.add(identity.email);
    }
  }
  return [...emails].sort();
}

/** What this clinic owes right now. Sends nothing and stores nothing. */
export async function pendingAlertsForClinic(
  clinicId: string,
  now: Date
): Promise<PendingAlert[]> {
  const [itemsSnap, batchesSnap, movementsSnap] = await Promise.all([
    clinicScopedDocs("inventoryItems", clinicId),
    clinicScopedDocs("inventoryBatches", clinicId),
    clinicScopedDocs("inventoryMovements", clinicId),
  ]);

  const items = itemsSnap.docs.map((d) => itemFromData(d.id, docData(d)));
  const batches = batchesSnap.docs.map((d) => batchFromData(d.id, docData(d)));
  const movements = movementsSnap.docs.map((d) => movementFromData(d.id, docData(d)));
  const onHandByItem = usableOnHandByItem(batches, movements, now);
  const storedState = new Map(
    itemsSnap.docs.map((d) => [d.id, parseReorderAlertState(docData(d).reorderAlert)])
  );

  const pending: PendingAlert[] = [];
  for (const item of items) {
    if (item.active === false) continue;
    const onHand = onHandByItem.get(item.id) ?? 0;
    const state = storedState.get(item.id) ?? parseReorderAlertState(undefined);
    const decision = decideReorderAlert({ onHand, minimumStock: item.minimumStock }, state);

    if (!decision.kind) {
      if (stateChanged(state, decision.nextState)) {
        pending.push({
          itemId: item.id,
          kind: null,
          row: null,
          nextState: decision.nextState,
        });
      }
      continue;
    }

    pending.push({
      itemId: item.id,
      kind: decision.kind,
      row: {
        itemId: item.id,
        name: item.name,
        department: item.department,
        packingUnit: item.packingUnit,
        onHand,
        minimumStock: item.minimumStock,
        kind: decision.kind,
      },
      nextState: decision.nextState,
    });
  }
  return pending;
}

async function storeAlertState(updates: PendingAlert[], checkedAt: string) {
  const db = getAdminDb();
  for (const update of updates) {
    await db
      .collection("inventoryItems")
      .doc(update.itemId)
      .set(
        {
          reorderAlert: {
            lastAlertedOnHand: update.nextState.lastAlertedOnHand,
            zeroAlertSent: update.nextState.zeroAlertSent,
            lastCheckedAt: checkedAt,
          },
        },
        { merge: true }
      );
  }
}

export async function runClinicReorderDigest(
  clinicId: string,
  clinicName: string,
  now: Date
): Promise<ClinicDigestResult> {
  const pending = await pendingAlertsForClinic(clinicId, now);
  const messages = pending.filter(
    (entry): entry is PendingAlert & { row: ReorderAlertRow } => entry.row !== null
  );
  const silent = pending.filter((entry) => entry.row === null);
  const checkedAt = now.toISOString();

  const digest = buildReorderDigest(
    clinicName,
    messages.map((entry) => entry.row)
  );

  if (!digest) {
    if (silent.length > 0) await storeAlertState(silent, checkedAt);
    return {
      clinicId,
      alerted: 0,
      outCount: 0,
      lowCount: 0,
      recipients: 0,
      skipped: "no-alerts",
    };
  }

  const recipients = await alertRecipients(clinicId);
  if (recipients.length === 0) {
    console.error(
      `[low-stock] ${clinicId} has ${messages.length} stock alert(s) and no approved lab manager, clinic administrator or storekeeper to send them to.`
    );
    if (silent.length > 0) await storeAlertState(silent, checkedAt);
    return {
      clinicId,
      alerted: 0,
      outCount: digest.outCount,
      lowCount: digest.lowCount,
      recipients: 0,
      skipped: "no-recipients",
    };
  }

  const sent = await getResend().emails.send({
    from: resendFromAddress(),
    to: recipients,
    subject: digest.subject,
    text: digest.text,
    html: digest.html,
  });

  if (sent.error) {
    console.error(sent.error);
    console.error(`[low-stock] ${clinicId}: ${describeResendFailure(sent.error).message}`);
    // Deliberately not storing the unsent alerts: tomorrow's run must try again.
    if (silent.length > 0) await storeAlertState(silent, checkedAt);
    return {
      clinicId,
      alerted: 0,
      outCount: digest.outCount,
      lowCount: digest.lowCount,
      recipients: recipients.length,
      skipped: "send-failed",
    };
  }

  await storeAlertState([...messages, ...silent], checkedAt);

  try {
    await logAudit({
      clinicId,
      actor: SYSTEM_ACTOR,
      action: "inventory.lowStockAlert",
      targetCollection: "inventoryItems",
      targetId: clinicId,
      targetLabel: `${messages.length} stock alert${messages.length === 1 ? "" : "s"}`,
      detail: {
        outCount: digest.outCount,
        lowCount: digest.lowCount,
        recipients: recipients.length,
        items: messages.map((entry) => entry.row.name),
      },
    });
  } catch (err) {
    console.error(err);
  }

  return {
    clinicId,
    alerted: messages.length,
    outCount: digest.outCount,
    lowCount: digest.lowCount,
    recipients: recipients.length,
    skipped: null,
  };
}

/**
 * One clinic failing must not stop the rest, so each is caught on its own and
 * logged with its clinic before the run continues.
 */
export async function runReorderDigest(now = new Date()) {
  const clinics = await getAdminDb().collection("clinics").get();
  const results: ClinicDigestResult[] = [];
  for (const clinic of clinics.docs) {
    const data = docData(clinic);
    const name = typeof data.name === "string" && data.name.trim() ? data.name : clinic.id;
    try {
      results.push(await runClinicReorderDigest(clinic.id, name, now));
    } catch (err) {
      console.error(`[low-stock] ${clinic.id} failed`, err);
    }
  }
  return {
    clinics: results.length,
    alerted: results.reduce((total, row) => total + row.alerted, 0),
    results,
  };
}
