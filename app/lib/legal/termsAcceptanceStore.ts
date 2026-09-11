import { collection, doc, getDoc, getDocFromCache, getDocs, getDocsFromCache, query, where } from "firebase/firestore";
import { safeLogAudit } from "../audit";
import type { AuditActor } from "../auditTypes";
import { db } from "../firebase";
import { trackedSetDoc } from "../trackedWrites";
import { ACCEPTABLE_USE } from "./acceptableUse";
import { newestAcceptedVersion, requireResolvedTermsVersion } from "./termsGate";
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

/** Own acceptances. Used to find an older version when the current doc is missing. */
export async function loadUserTermsAcceptances(uid: string): Promise<TermsAcceptanceRecord[]> {
  if (!uid) return [];
  const snap = await getDocs(query(collection(db, TERMS_ACCEPTANCES), where("uid", "==", uid)));
  const rows: TermsAcceptanceRecord[] = [];
  for (const d of snap.docs) {
    const row = parseTermsAcceptance(d.id, d.data() as Record<string, unknown>);
    if (row) rows.push(row);
  }
  return rows;
}

/**
 * Newest accepted version for this user and document.
 * Prefers the current version doc (one get); falls back to the user's list.
 */
export async function getNewestAcceptedTermsVersion(
  uid: string,
  documentId: string = ACCEPTABLE_USE.id
): Promise<string | null> {
  if (!uid) return null;
  try {
    const current = await getTermsAcceptance(uid, documentId, ACCEPTABLE_USE.version);
    if (current) return current.version;
  } catch {
    // Offline or cache miss — try the user's other acceptances.
  }
  try {
    const rows = await loadUserTermsAcceptances(uid);
    return newestAcceptedVersion(rows, documentId);
  } catch {
    return null;
  }
}

/**
 * Cache-only lookup. Fails fast when the IndexedDB persistence has nothing.
 * Used so a terms timeout can proceed under a previously accepted version.
 */
export async function getNewestAcceptedTermsVersionFromCache(
  uid: string,
  documentId: string = ACCEPTABLE_USE.id
): Promise<string | null> {
  if (!uid) return null;
  try {
    const id = termsAcceptanceDocId(uid, documentId, ACCEPTABLE_USE.version);
    const snap = await getDocFromCache(doc(db, TERMS_ACCEPTANCES, id));
    if (snap.exists()) {
      const row = parseTermsAcceptance(snap.id, snap.data() as Record<string, unknown>);
      if (row?.version) return row.version;
    }
  } catch {
    // Cold cache for the current-version doc — try the uid query cache.
  }
  try {
    const snap = await getDocsFromCache(
      query(collection(db, TERMS_ACCEPTANCES), where("uid", "==", uid))
    );
    const rows: TermsAcceptanceRecord[] = [];
    for (const d of snap.docs) {
      const row = parseTermsAcceptance(d.id, d.data() as Record<string, unknown>);
      if (row) rows.push(row);
    }
    return newestAcceptedVersion(rows, documentId);
  } catch {
    return null;
  }
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
  const version = requireResolvedTermsVersion(input.version ?? ACCEPTABLE_USE.version);
  const id = termsAcceptanceDocId(input.uid, documentId, version);
  let alreadyExists = false;
  try {
    const existing = await getDoc(doc(db, TERMS_ACCEPTANCES, id));
    alreadyExists = existing.exists();
  } catch {
    // Offline without a cached doc: queue the create. Duplicate id is a no-op
    // once the device syncs (create-only rules + same document id).
    alreadyExists = false;
  }
  if (alreadyExists) {
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
