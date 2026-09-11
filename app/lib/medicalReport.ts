/**
 * Medical report — a structured clinical document (SOAP-style) for a
 * patient, separate from lab results. A draft is freely editable by its
 * author. Finalizing locks it and creates version 1; any further edit
 * appends a new version with a reason code, mirroring the order
 * result-amendment model in resultAmendment.ts.
 */

import { formatJustification, justificationReady, REPORT_AMENDMENT_CODES } from "./reasonCodes";

export type MedicalReportStatus = "draft" | "final";

export type MedicalReportContent = {
  chiefComplaint: string;
  findings: string;
  assessment: string;
  plan: string;
};

export const MEDICAL_REPORT_FIELDS = ["chiefComplaint", "findings", "assessment", "plan"] as const;

export const MEDICAL_REPORT_FIELD_LABELS: Record<(typeof MEDICAL_REPORT_FIELDS)[number], string> = {
  chiefComplaint: "Chief complaint",
  findings: "Findings",
  assessment: "Assessment",
  plan: "Plan",
};

export type MedicalReportActor = {
  uid: string;
  email: string | null;
  role: string | null;
  shift: string | null;
};

export type MedicalReportVersion = {
  version: number;
  content: MedicalReportContent;
  authorEmail: string | null;
  authorUid: string | null;
  authorRole: string | null;
  authorShift: string | null;
  at: string;
  reasonCode: string | null;
  reasonNote: string | null;
};

export const REPORT_INCOMPLETE_MESSAGE =
  "Fill in chief complaint, findings, assessment, and plan before finalizing.";
export const REPORT_NOT_FINAL_MESSAGE = "Only a finalized report can be amended.";
export const REPORT_NO_CHANGE_MESSAGE = "Change at least one field before amending.";
export const REPORT_AMENDMENT_REASON_MESSAGE = "Choose a reason to amend a finalized report.";

export function emptyReportContent(): MedicalReportContent {
  return { chiefComplaint: "", findings: "", assessment: "", plan: "" };
}

export function cloneReportContent(
  value: Partial<MedicalReportContent> | null | undefined
): MedicalReportContent {
  const empty = emptyReportContent();
  if (!value || typeof value !== "object") return empty;
  const out = { ...empty };
  for (const field of MEDICAL_REPORT_FIELDS) {
    const raw = (value as Record<string, unknown>)[field];
    if (typeof raw === "string") out[field] = raw;
  }
  return out;
}

export function reportContentComplete(content: MedicalReportContent): boolean {
  return MEDICAL_REPORT_FIELDS.every((field) => content[field].trim().length > 0);
}

export function reportContentChanged(a: MedicalReportContent, b: MedicalReportContent): boolean {
  return MEDICAL_REPORT_FIELDS.some((field) => a[field].trim() !== b[field].trim());
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export function parseMedicalReportVersions(value: unknown): MedicalReportVersion[] {
  if (!Array.isArray(value)) return [];
  const versions: MedicalReportVersion[] = [];
  for (const item of value) {
    const rec = asRecord(item);
    if (!rec) continue;
    const version = typeof rec.version === "number" ? rec.version : Number(rec.version);
    if (!Number.isInteger(version) || version < 1) continue;
    const at = asString(rec.at);
    if (!at) continue;
    versions.push({
      version,
      content: cloneReportContent(rec.content as MedicalReportContent),
      authorEmail: asString(rec.authorEmail),
      authorUid: asString(rec.authorUid),
      authorRole: asString(rec.authorRole),
      authorShift: asString(rec.authorShift),
      at,
      reasonCode: asString(rec.reasonCode),
      reasonNote: asString(rec.reasonNote),
    });
  }
  return versions.sort((a, b) => a.version - b.version);
}

export function currentMedicalReportVersion(versions: unknown): MedicalReportVersion | null {
  const parsed = parseMedicalReportVersions(versions);
  return parsed[parsed.length - 1] ?? null;
}

export type FinalizeReportResult =
  | { ok: false; error: string }
  | { ok: true; updates: Record<string, unknown>; version: MedicalReportVersion };

export function finalizeReport(input: {
  content: MedicalReportContent;
  actor: MedicalReportActor;
  now?: string;
}): FinalizeReportResult {
  const content = cloneReportContent(input.content);
  if (!reportContentComplete(content)) {
    return { ok: false, error: REPORT_INCOMPLETE_MESSAGE };
  }
  const at = input.now || new Date().toISOString();
  const version: MedicalReportVersion = {
    version: 1,
    content,
    authorEmail: input.actor.email,
    authorUid: input.actor.uid,
    authorRole: input.actor.role,
    authorShift: input.actor.shift,
    at,
    reasonCode: null,
    reasonNote: null,
  };
  return {
    ok: true,
    version,
    updates: {
      ...content,
      status: "final",
      currentVersion: 1,
      versions: [version],
      finalizedBy: input.actor.email,
      finalizedByUid: input.actor.uid,
      finalizedByRole: input.actor.role,
      finalizedAt: at,
    },
  };
}

export type AmendReportResult =
  | { ok: false; error: string }
  | { ok: true; updates: Record<string, unknown>; previousVersion: number; newVersion: number };

export function amendReport(input: {
  status: MedicalReportStatus | string | null | undefined;
  versions: unknown;
  currentContent: MedicalReportContent;
  newContent: MedicalReportContent;
  reasonCode: string | null | undefined;
  reasonNote?: string | null;
  actor: MedicalReportActor;
  now?: string;
}): AmendReportResult {
  if (input.status !== "final") {
    return { ok: false, error: REPORT_NOT_FINAL_MESSAGE };
  }
  if (!reportContentChanged(input.currentContent, input.newContent)) {
    return { ok: false, error: REPORT_NO_CHANGE_MESSAGE };
  }
  if (!justificationReady(REPORT_AMENDMENT_CODES, input.reasonCode, input.reasonNote)) {
    return { ok: false, error: REPORT_AMENDMENT_REASON_MESSAGE };
  }
  const reasonText = formatJustification(REPORT_AMENDMENT_CODES, input.reasonCode, input.reasonNote);
  const versions = parseMedicalReportVersions(input.versions);
  const previousVersion = versions[versions.length - 1]?.version ?? 1;
  const at = input.now || new Date().toISOString();
  const content = cloneReportContent(input.newContent);
  const nextVersion: MedicalReportVersion = {
    version: previousVersion + 1,
    content,
    authorEmail: input.actor.email,
    authorUid: input.actor.uid,
    authorRole: input.actor.role,
    authorShift: input.actor.shift,
    at,
    reasonCode: input.reasonCode ?? null,
    reasonNote: reasonText,
  };
  return {
    ok: true,
    previousVersion,
    newVersion: nextVersion.version,
    updates: {
      ...content,
      versions: [...versions, nextVersion],
      currentVersion: nextVersion.version,
      lastAmendedAt: at,
      lastAmendedBy: input.actor.email,
      lastAmendedByUid: input.actor.uid,
      lastAmendedByRole: input.actor.role,
    },
  };
}

export function medicalReportHref(patientId: string): string {
  return `/patients/${patientId}/report`;
}
