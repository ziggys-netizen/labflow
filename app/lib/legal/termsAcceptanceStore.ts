import { collection, doc, getDoc, getDocs, query, where } from "firebase/firestore";
import { safeLogAudit } from "../audit";
import type { AuditActor } from "../auditTypes";
import { db } from "../firebase";
import { trackedSetDoc } from "../trackedWrites";
import { ACCEPTABLE_USE } from "./acceptableUse";
import {
  TERMS_ACCEPTANCES,
  parseTermsAcceptance,
  termsAcceptAuditWrite,
  termsAcceptanceDocId,
  termsAcceptancePayload,
  type TermsAcceptanceRecord,
} from "./termsAcceptance";

export async function getTermsAcceptance(
  uid: string,
  documentId: string = ACCEPTABLE_USE.id,
  version: string = ACCEPTABLE_USE.version
): Promise<TermsAcceptanceRecord | null> {
  const id = termsAcceptanceDocId(uid, documentId, version);
  const snap = await getDoc(doc(db, TERMS_ACCEPTANCES, id));
  if (!snap.exists()) return null;
  return parseTermsAcceptance(snap.id, snap.data() as Record<string, unknown>);
}

export async function hasAcceptedTerms(
  uid: string,
  documentId: string = ACCEPTABLE_USE.id,
  version: string = ACCEPTABLE_USE.version
): Promise<boolean> {
  return (await getTermsAcceptance(uid, documentId, version)) != null;
}

/** Clinic-scoped list. Caller must be owner or that clinic's admin (rules). */
export async function loadClinicTermsAcceptances(clinicId: string): Promise<TermsAcceptanceRecord[]> {
  if (!clinicId) return [];
  const snap = await getDocs(
    query(collection(db, TERMS_ACCEPTANCES), where("clinicId", "==", clinicId))
  );
  const rows: TermsAcceptanceRecord[] = [];
  for (const d of snap.docs) {
    const row = parseTermsAcceptance(d.id, d.data() as Record<string, unknown>);
    if (row) rows.push(row);
  }
  return rows.sort((a, b) => (a.recordedAt || "").localeCompare(b.recordedAt || ""));
}

/**
 * Create-only write. Same `{uid}_{documentId}_{version}` is a no-op.
 * Queued through the offline write log, like other create-only collections.
 * Audit is written only when a new acceptance is created.
 */
export async function recordTermsAcceptance(input: {
  uid: string;
  clinicId: string;
  actor: AuditActor;
  documentId?: string;
  version?: string;
  recordedAt?: string;
}): Promise<{ id: string; created: boolean }> {
  const documentId = input.documentId ?? ACCEPTABLE_USE.id;
  const version = input.version ?? ACCEPTABLE_USE.version;
  const id = termsAcceptanceDocId(input.uid, documentId, version);
  const existing = await getDoc(doc(db, TERMS_ACCEPTANCES, id));
  if (existing.exists()) {
    return { id, created: false };
  }

  const payload = termsAcceptancePayload({
    uid: input.uid,
    clinicId: input.clinicId,
    documentId,
    version,
    recordedAt: input.recordedAt,
  });

  await trackedSetDoc(doc(db, TERMS_ACCEPTANCES, id), payload, undefined, {
    operation: "create",
    summary: `Accepted ${documentId} ${version}`,
    actorUid: input.actor.uid,
    actorLabel: input.actor.email || input.actor.uid,
    clinicId: input.clinicId,
  });

  safeLogAudit(
    termsAcceptAuditWrite({
      clinicId: input.clinicId,
      actor: input.actor,
      documentId,
      version,
    })
  );

  return { id, created: true };
}
