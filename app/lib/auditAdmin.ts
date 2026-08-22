import { getAdminDb } from "./firebaseAdmin";
import { auditLogPayload, type AuditActor, type AuditLogWrite } from "./auditTypes";

export type { AuditActor, AuditLogWrite };

/** Same payload as client `logAudit` in `audit.ts` — Admin SDK, for route handlers. */
export async function logAudit(entry: AuditLogWrite) {
  await getAdminDb().collection("auditLogs").add(auditLogPayload(entry));
}
