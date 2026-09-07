/**
 * `termsAcceptances/{id}` — create-only acknowledgement that a signed-in user
 * accepted a versioned terms document. Identity is UID + clinic only.
 */

import { serverTimestamp, type FieldValue } from "firebase/firestore";
import type { AuditActor, AuditLogWrite } from "../auditTypes";
import { ACCEPTABLE_USE } from "./acceptableUse";

export const TERMS_ACCEPTANCES = "termsAcceptances";

export const TERMS_ACCEPTANCE_KEYS = [
  "uid",
  "clinicId",
  "documentId",
  "version",
  "acceptedAt",
  "recordedAt",
] as const;

export const TERMS_ACCEPTANCE_IDENTITY_KEYS = [
  "name",
  "email",
  "displayName",
  "actorEmail",
  "actorName",
] as const;

export type TermsAcceptanceWrite = {
  uid: string;
  clinicId: string;
  documentId: string;
  version: string;
  acceptedAt: FieldValue;
  recordedAt: string;
};

/** Stored shape after parse. No name, no email. */
export type TermsAcceptanceRecord = {
  id: string;
  uid: string;
  clinicId: string;
  documentId: string;
  version: string;
  acceptedAt: string | null;
  recordedAt: string | null;
};

/** `{uid}_{documentId}_{version}` — same version from the same user is one doc. */
export function termsAcceptanceDocId(uid: string, documentId: string, version: string): string {
  return `${uid}_${documentId}_${version}`;
}

export function termsAcceptanceHasIdentityFields(
  data: Record<string, unknown> | null | undefined
): boolean {
  if (!data) return false;
  const forbidden = new Set<string>(TERMS_ACCEPTANCE_IDENTITY_KEYS);
  return Object.keys(data).some((key) => forbidden.has(key));
}

export function termsAcceptancePayload(input: {
  uid: string;
  clinicId: string;
  documentId?: string;
  version?: string;
  recordedAt?: string;
}): TermsAcceptanceWrite {
  return {
    uid: input.uid,
    clinicId: input.clinicId,
    documentId: input.documentId ?? ACCEPTABLE_USE.id,
    version: input.version ?? ACCEPTABLE_USE.version,
    acceptedAt: serverTimestamp(),
    recordedAt: input.recordedAt ?? new Date().toISOString(),
  };
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function asTimestampIso(value: unknown): string | null {
  if (typeof value === "string" && value) return value;
  if (value && typeof value === "object" && "toDate" in value) {
    const toDate = (value as { toDate?: unknown }).toDate;
    if (typeof toDate === "function") {
      const date = (toDate as () => Date)();
      if (date instanceof Date && !Number.isNaN(date.getTime())) return date.toISOString();
    }
  }
  return null;
}

export function parseTermsAcceptance(
  id: string,
  data: Record<string, unknown> | undefined
): TermsAcceptanceRecord | null {
  if (!data) return null;
  const uid = asString(data.uid);
  const clinicId = asString(data.clinicId);
  const documentId = asString(data.documentId);
  const version = asString(data.version);
  if (!uid || !clinicId || !documentId || !version) return null;
  return {
    id,
    uid,
    clinicId,
    documentId,
    version,
    acceptedAt: asTimestampIso(data.acceptedAt),
    recordedAt: asString(data.recordedAt),
  };
}

/** Audit row for a successful acceptance. Targets the terms id and version. */
export function termsAcceptAuditWrite(input: {
  clinicId: string;
  actor: AuditActor;
  documentId?: string;
  version?: string;
}): AuditLogWrite {
  const documentId = input.documentId ?? ACCEPTABLE_USE.id;
  const version = input.version ?? ACCEPTABLE_USE.version;
  return {
    clinicId: input.clinicId,
    actor: input.actor,
    action: "terms.accept",
    targetCollection: TERMS_ACCEPTANCES,
    targetId: documentId,
    targetLabel: `${documentId} · ${version}`,
    detail: { documentId, version },
  };
}
