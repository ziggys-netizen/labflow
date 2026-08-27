import {
  addDoc,
  collection,
  getDocs,
  limit,
  orderBy,
  query,
  startAfter,
  where,
  type QueryConstraint,
  type QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";
import {
  auditLogPayload,
  parseAuditLog,
  type AuditLogRecord,
  type AuditLogWrite,
} from "./auditTypes";
import {
  auditFailureSummary,
  auditRejectionReason,
  scheduleSafeAudit,
} from "./auditSafety";
import { lastKnownOnline } from "./firestoreConnectivity";
import { enqueuePending, markRejected } from "./writeQueue";

export type { AuditActor, AuditLogRecord, AuditLogWrite } from "./auditTypes";
export {
  AUDIT_ACTIONS,
  AUDIT_CSV_COLUMNS,
  actorFromAuth,
  auditLogsToCsv,
  auditTargetLabel,
  defaultAuditDateFrom,
  defaultAuditDateTo,
  filterAuditLogs,
  localDayEndIso,
  localDayStartIso,
  parseAuditLog,
} from "./auditTypes";

/**
 * Client audit write. Shape is `auditLogPayload` (clinicId, actor*, actingAsOwner,
 * action, target*, at, detail). Viewer: `/owner/clinics/[clinicId]/audit`.
 */
export async function logAudit(entry: AuditLogWrite) {
  await addDoc(collection(db, "auditLogs"), auditLogPayload(entry));
}

/**
 * Fire-and-forget client audit. Never await this on a clinical path — a denied
 * or hung audit must not take down print, release, collection, or amendment.
 * Failures land in Sync problems.
 */
export function safeLogAudit(entry: AuditLogWrite): void {
  scheduleSafeAudit(
    () => logAudit(entry),
    (err) => {
      console.error(err);
      void surfaceAuditFailure(entry, err);
    }
  );
}

async function surfaceAuditFailure(entry: AuditLogWrite, err: unknown) {
  try {
    const queued = await enqueuePending({
      operation: "create",
      collection: "auditLogs",
      documentId: `${entry.action}:${entry.targetId}`,
      actorUid: entry.actor.uid,
      actorLabel: entry.actor.email || entry.actor.uid,
      clinicId: entry.clinicId,
      orderId: entry.targetCollection === "orders" ? entry.targetId : null,
      patientLabId: null,
      summary: auditFailureSummary(entry.action),
      expected: null,
      wroteWhileOffline: !lastKnownOnline(),
    });
    await markRejected(queued.id, auditRejectionReason(err), false);
  } catch (queueErr) {
    console.error(queueErr);
  }
}

const FETCH_PAGE = 400;
const FETCH_CAP = 10000;

/** Clinic-scoped reads. Newest first. Date range is inclusive local days as ISO. */
export async function loadClinicAuditLogs(
  clinicId: string,
  options: { startAt?: string; endAt?: string } = {}
): Promise<AuditLogRecord[]> {
  if (!clinicId) return [];
  const rows: AuditLogRecord[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  while (rows.length < FETCH_CAP) {
    const constraints: QueryConstraint[] = [where("clinicId", "==", clinicId)];
    if (options.startAt) constraints.push(where("at", ">=", options.startAt));
    if (options.endAt) constraints.push(where("at", "<=", options.endAt));
    constraints.push(orderBy("at", "desc"));
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(FETCH_PAGE));
    const snap = await getDocs(query(collection(db, "auditLogs"), ...constraints));
    if (snap.empty) break;
    for (const d of snap.docs) {
      rows.push(parseAuditLog(d.id, d.data() as Record<string, unknown>));
    }
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < FETCH_PAGE) break;
  }
  return rows;
}
