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
  AUDIT_FETCH_CAP,
  auditRowsInRange,
  classifyReadFailure,
  finalizeClinicAuditFetch,
  type AuditLogRecord,
  type AuditLogWrite,
  type ClinicAuditLoadResult,
} from "./auditTypes";
import {
  auditFailureSummary,
  auditRejectionReason,
  scheduleSafeAudit,
} from "./auditSafety";
import { lastKnownOnline } from "./firestoreConnectivity";
import { enqueuePending, markRejected } from "./writeQueue";

export type {
  AuditActor,
  AuditLogRecord,
  AuditLogWrite,
  ClinicAuditLoadResult,
  ReadFailure,
} from "./auditTypes";
export {
  AUDIT_ACTIONS,
  AUDIT_CSV_COLUMNS,
  AUDIT_FETCH_CAP,
  actorFromAuth,
  auditLogsToCsv,
  auditTargetLabel,
  defaultAuditDateFrom,
  defaultAuditDateTo,
  filterAuditLogs,
  finalizeClinicAuditFetch,
  auditLoadFailureMessage,
  auditRowsInRange,
  classifyReadFailure,
  firestoreErrorCode,
  AUDIT_MISSING_INDEX_NOTICE,
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

/** Clinic-scoped reads. Newest first. Date range is inclusive local days as ISO. */
export async function loadClinicAuditLogs(
  clinicId: string,
  options: { startAt?: string; endAt?: string } = {}
): Promise<ClinicAuditLoadResult> {
  if (!clinicId) return { rows: [], capped: false };
  try {
    return await loadIndexedAuditLogs(clinicId, options);
  } catch (err) {
    // Only a missing index has a fallback. Anything else is the caller's to name.
    if (classifyReadFailure(err) !== "missing-index") throw err;
    console.error("auditLogs index (clinicId, at desc) is missing; using the unindexed read", err);
    const result = await loadUnindexedAuditLogs(clinicId, options);
    return { ...result, degraded: "missing-index" };
  }
}

/** The fast read: the date range and order come from the (clinicId, at) index. */
async function loadIndexedAuditLogs(
  clinicId: string,
  options: { startAt?: string; endAt?: string }
): Promise<ClinicAuditLoadResult> {
  const fetched: AuditLogRecord[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  // Fetch up to one past the cap so we can tell "exactly N" from "more than N".
  while (fetched.length <= AUDIT_FETCH_CAP) {
    const pageSize = Math.min(FETCH_PAGE, AUDIT_FETCH_CAP + 1 - fetched.length);
    const constraints: QueryConstraint[] = [where("clinicId", "==", clinicId)];
    if (options.startAt) constraints.push(where("at", ">=", options.startAt));
    if (options.endAt) constraints.push(where("at", "<=", options.endAt));
    constraints.push(orderBy("at", "desc"));
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(pageSize));
    const snap = await getDocs(query(collection(db, "auditLogs"), ...constraints));
    if (snap.empty) break;
    for (const d of snap.docs) {
      fetched.push(parseAuditLog(d.id, d.data() as Record<string, unknown>));
    }
    cursor = snap.docs[snap.docs.length - 1];
    if (snap.docs.length < pageSize) break;
  }
  return finalizeClinicAuditFetch(fetched, AUDIT_FETCH_CAP);
}

/**
 * The slow read, for when the live database lacks that index. An equality on
 * clinicId alone needs only Firestore's automatic single-field index, and it
 * is the same shape the security rules already accept for both the owner and
 * a clinic administrator. The range and the order are applied here instead.
 *
 * It reads the clinic's entries rather than just the range, so it stops after
 * AUDIT_FETCH_CAP entries read and says so, rather than reading without end.
 */
async function loadUnindexedAuditLogs(
  clinicId: string,
  options: { startAt?: string; endAt?: string }
): Promise<ClinicAuditLoadResult> {
  const read: AuditLogRecord[] = [];
  let cursor: QueryDocumentSnapshot | undefined;
  let readCapped = false;
  for (;;) {
    const constraints: QueryConstraint[] = [where("clinicId", "==", clinicId)];
    if (cursor) constraints.push(startAfter(cursor));
    constraints.push(limit(FETCH_PAGE));
    const snap = await getDocs(query(collection(db, "auditLogs"), ...constraints));
    for (const d of snap.docs) {
      read.push(parseAuditLog(d.id, d.data() as Record<string, unknown>));
    }
    if (snap.docs.length < FETCH_PAGE) break;
    if (read.length >= AUDIT_FETCH_CAP) {
      readCapped = true;
      break;
    }
    cursor = snap.docs[snap.docs.length - 1];
  }
  const inRange = auditRowsInRange(read, options.startAt, options.endAt);
  const result = finalizeClinicAuditFetch(inRange, AUDIT_FETCH_CAP);
  return { ...result, capped: result.capped || readCapped };
}
