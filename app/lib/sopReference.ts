/**
 * SOP *reference* on a clinic catalogue test — identifiers a manager types,
 * not procedure text.
 *
 * Grandfather rule: only tests stamped `sopRequired: true` (Settings → Add
 * New Test, from this gate onward) must have a complete reference to save or
 * to order. Seeded, imported, and already-live rows omit the flag so an
 * upgrade morning does not disable the existing menu.
 */

export const SOP_MAX_FILE_BYTES = 10 * 1024 * 1024;

export const SOP_ALLOWED_CONTENT_TYPES = [
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
] as const;

const SOP_ALLOWED_EXTENSIONS = [".pdf", ".doc", ".docx"] as const;

export const SOP_FIELD_MAX = {
  documentId: 40,
  title: 80,
  version: 20,
  author: 60,
} as const;

export type SopFileRef = {
  storagePath: string;
  fileName: string;
  contentType: string;
  size: number;
  uploadedAt: string;
};

export type SopDraft = {
  documentId: string;
  title: string;
  version: string;
  effectiveDate: string;
  author: string;
  reviewDate: string;
};

export type SopReference = SopDraft & {
  file?: SopFileRef | null;
};

export type CatalogSopView = {
  code?: string;
  name?: string;
  sopRequired?: boolean;
  sop?: unknown;
};

export function emptySopDraft(): SopDraft {
  return {
    documentId: "",
    title: "",
    version: "",
    effectiveDate: "",
    author: "",
    reviewDate: "",
  };
}

function asTrimmed(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value: string): boolean {
  if (!ISO_DATE.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const dt = new Date(Date.UTC(year, month - 1, day));
  return (
    dt.getUTCFullYear() === year && dt.getUTCMonth() === month - 1 && dt.getUTCDate() === day
  );
}

export function parseSopFile(value: unknown): SopFileRef | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const row = value as Record<string, unknown>;
  const storagePath = asTrimmed(row.storagePath);
  const fileName = asTrimmed(row.fileName);
  const contentType = asTrimmed(row.contentType);
  const uploadedAt = asTrimmed(row.uploadedAt);
  const size = typeof row.size === "number" && Number.isFinite(row.size) ? row.size : NaN;
  if (!storagePath || !fileName || !contentType || !uploadedAt || !Number.isFinite(size) || size < 0) {
    return null;
  }
  return { storagePath, fileName, contentType, size, uploadedAt };
}

export function parseSopDraft(value: unknown): SopDraft {
  if (!value || typeof value !== "object" || Array.isArray(value)) return emptySopDraft();
  const row = value as Record<string, unknown>;
  return {
    documentId: asTrimmed(row.documentId),
    title: asTrimmed(row.title),
    version: asTrimmed(row.version),
    effectiveDate: asTrimmed(row.effectiveDate),
    author: asTrimmed(row.author),
    reviewDate: asTrimmed(row.reviewDate),
  };
}

export function parseSopReference(value: unknown): SopReference | null {
  const draft = parseSopDraft(value);
  if (sopDraftIsEmpty(draft)) {
    if (!value || typeof value !== "object" || Array.isArray(value)) return null;
    const file = parseSopFile((value as Record<string, unknown>).file);
    return file ? { ...emptySopDraft(), file } : null;
  }
  const file =
    value && typeof value === "object" && !Array.isArray(value)
      ? parseSopFile((value as Record<string, unknown>).file)
      : null;
  return file ? { ...draft, file } : { ...draft };
}

export function sopDraftIsEmpty(draft: SopDraft): boolean {
  return (
    !draft.documentId &&
    !draft.title &&
    !draft.version &&
    !draft.effectiveDate &&
    !draft.author &&
    !draft.reviewDate
  );
}

function tooLong(value: string, max: number): boolean {
  return value.length > max;
}

/** SLIPTA periodic review: a version with no review date is a finding. */
export const SOP_REVIEW_DATE_REQUIRED = "SOP review date is required.";

export function sopDraftIssues(draft: SopDraft): string[] {
  const issues: string[] = [];
  if (!draft.documentId) issues.push("SOP document ID is required.");
  else if (tooLong(draft.documentId, SOP_FIELD_MAX.documentId)) {
    issues.push("SOP document ID is too long.");
  }
  if (!draft.title) issues.push("SOP title is required.");
  else if (tooLong(draft.title, SOP_FIELD_MAX.title)) issues.push("SOP title is too long.");
  if (!draft.version) issues.push("SOP version is required.");
  else if (tooLong(draft.version, SOP_FIELD_MAX.version)) issues.push("SOP version is too long.");
  if (!draft.effectiveDate) issues.push("SOP effective date is required.");
  else if (!isCalendarDate(draft.effectiveDate)) {
    issues.push("SOP effective date must be a calendar date.");
  }
  if (!draft.author) issues.push("SOP author is required.");
  else if (tooLong(draft.author, SOP_FIELD_MAX.author)) issues.push("SOP author is too long.");
  if (!draft.reviewDate) issues.push(SOP_REVIEW_DATE_REQUIRED);
  else if (!isCalendarDate(draft.reviewDate)) {
    issues.push("SOP review date must be a calendar date.");
  }
  return issues;
}

export function sopDraftIsComplete(draft: SopDraft): boolean {
  return sopDraftIssues(draft).length === 0;
}

export function catalogTestIsGrandfathered(
  test: { sopRequired?: boolean } | null | undefined
): boolean {
  return test?.sopRequired !== true;
}

export function catalogTestSaveError(
  test: CatalogSopView,
  options: { creating: boolean; hasFile?: boolean }
): string | null {
  const draft = parseSopDraft(test.sop);
  const requireComplete =
    options.creating ||
    test.sopRequired === true ||
    Boolean(options.hasFile) ||
    !sopDraftIsEmpty(draft);
  if (!requireComplete) return null;
  return sopDraftIssues(draft)[0] ?? null;
}

export const SOP_ORDER_BLOCKED =
  "This test has no SOP reference and cannot be ordered. Add the document ID, title, version, dates, and author in Clinic Settings.";

export function catalogTestMayBeOrdered(test: CatalogSopView): { ok: true } | { ok: false; reason: string } {
  if (catalogTestIsGrandfathered(test)) return { ok: true };
  const draft = parseSopDraft(test.sop);
  if (sopDraftIsComplete(draft)) return { ok: true };
  return { ok: false, reason: SOP_ORDER_BLOCKED };
}

export function testsBlockedFromOrder<T extends CatalogSopView>(tests: T[]): T[] {
  return tests.filter((test) => !catalogTestMayBeOrdered(test).ok);
}

export function orderSopBlockMessage(tests: CatalogSopView[]): string | null {
  const blocked = testsBlockedFromOrder(tests);
  if (blocked.length === 0) return null;
  const names = blocked.map((t) => t.name || t.code || "test").join(", ");
  return `Cannot order without an SOP reference: ${names}.`;
}

export function toSopReference(draft: SopDraft, file?: SopFileRef | null): SopReference {
  const next: SopReference = {
    documentId: draft.documentId.trim(),
    title: draft.title.trim(),
    version: draft.version.trim(),
    effectiveDate: draft.effectiveDate.trim(),
    author: draft.author.trim(),
    reviewDate: draft.reviewDate.trim(),
  };
  if (file) next.file = file;
  return next;
}

export function sanitizeSopFileName(name: string): string {
  const base = name.split(/[/\\]/).pop() || "sop";
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/_+/g, "_").slice(0, 80);
  return cleaned.replace(/^\.+/, "") || "sop";
}

export function sopStoragePath(clinicId: string, testCode: string, fileName: string): string {
  const clinic = clinicId.replace(/[^a-zA-Z0-9_-]/g, "_");
  const code = testCode.replace(/[^a-zA-Z0-9_-]/g, "_");
  return `clinics/${clinic}/sops/${code}/${sanitizeSopFileName(fileName)}`;
}

export function sopFileClientError(file: File): string | null {
  if (file.size > SOP_MAX_FILE_BYTES) return "SOP file must be 10 MB or smaller.";
  const lower = file.name.toLowerCase();
  const extOk = SOP_ALLOWED_EXTENSIONS.some((ext) => lower.endsWith(ext));
  const typeOk =
    !file.type ||
    (SOP_ALLOWED_CONTENT_TYPES as readonly string[]).includes(file.type);
  if (!extOk || !typeOk) return "SOP file must be a PDF or Word document.";
  return null;
}
