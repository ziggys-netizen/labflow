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

/** Audit must not fail the clinical write. */
export async function safeLogAudit(entry: AuditLogWrite) {
  try {
    await logAudit(entry);
  } catch (err) {
    console.error(err);
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
