import { AMENDMENT_CODES, formatJustification, justificationReady } from "./reasonCodes";

function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/** Released results can be amended again. Only rejected/cancelled are terminal. */
export const RELEASED_RESULT_STATUSES = ["approved", "amended"] as const;

export const AMENDMENT_REASON_MESSAGE = "Choose a reason to amend a released result.";
export const SELF_AMEND_MESSAGE =
  "A second approver must confirm this amendment because you released the original result.";
export const SECOND_APPROVER_WAITING_MESSAGE =
  "This amendment is waiting for a second approver to confirm.";
export const CANNOT_CONFIRM_OWN_AMENDMENT_MESSAGE =
  "You cannot confirm your own amendment. Another approver must confirm it.";
export const AMENDMENT_NO_CHANGE_MESSAGE = "Change at least one result value before amending.";
export const AMENDMENT_NOT_RELEASED_MESSAGE = "Only an approved or amended result can be amended.";
export const AMENDMENT_PENDING_EXISTS_MESSAGE =
  "An amendment is already waiting for a second approver.";
export const AMENDMENT_NO_PENDING_MESSAGE = "There is no amendment waiting for confirmation.";

export type ResultValues = Record<string, Record<string, string>>;

export type AmendmentActor = {
  uid: string;
  email: string | null;
  role: string | null;
  shift: string | null;
};

export type ResultVersion = {
  version: number;
  values: ResultValues;
  releasedBy: string | null;
  releasedByUid: string | null;
  releasedAt: string;
  amendmentReason: string | null;
  amendedBy: string | null;
  amendedByUid: string | null;
  amendedByRole: string | null;
  amendedByShift: string | null;
  confirmedBy: string | null;
  confirmedByUid: string | null;
  confirmedByRole: string | null;
};

export type PendingAmendment = {
  values: ResultValues;
  amendmentReason: string;
  amendmentReasonCode?: string | null;
  initiatedBy: string | null;
  initiatedByUid: string | null;
  initiatedByRole: string | null;
  initiatedByShift: string | null;
  initiatedAt: string;
  fromVersion: number;
};

export type AmendmentOrderInput = {
  status?: string | null;
  results?: ResultValues | null;
  resultVersions?: unknown;
  pendingAmendment?: unknown;
  reviewedBy?: string | null;
  reviewedByUid?: string | null;
  reviewedAt?: string | null;
  lastAmendedAt?: string | null;
};

export type ResultChange = {
  testCode: string;
  parameter: string;
  previous: string;
  current: string;
};

export type StartAmendmentResult =
  | { ok: false; error: string }
  | { ok: true; mode: "pending"; updates: Record<string, unknown> }
  | {
      ok: true;
      mode: "applied";
      updates: Record<string, unknown>;
      previousVersion: number;
      newVersion: number;
    };

export type ConfirmAmendmentResult =
  | { ok: false; error: string }
  | {
      ok: true;
      updates: Record<string, unknown>;
      previousVersion: number;
      newVersion: number;
      amender: AmendmentActor;
    };

export function isReleasedResultStatus(status: string | null | undefined): boolean {
  return status === "approved" || status === "amended";
}

export function amendmentBlockedOffline(isOnline: boolean): boolean {
  return !isOnline;
}

export function amendmentReasonReady(
  reasonCode: string | null | undefined,
  reasonNote?: string | null
): boolean {
  return justificationReady(AMENDMENT_CODES, reasonCode, reasonNote);
}

export function cloneResultValues(values: ResultValues | null | undefined): ResultValues {
  const out: ResultValues = {};
  if (!values || typeof values !== "object") return out;
  for (const [testCode, params] of Object.entries(values)) {
    if (!params || typeof params !== "object" || Array.isArray(params)) continue;
    const next: Record<string, string> = {};
    for (const [name, value] of Object.entries(params)) {
      if (typeof value === "string") next[name] = value;
    }
    out[testCode] = next;
  }
  return out;
}

export function changedResultValues(
  previous: ResultValues | null | undefined,
  current: ResultValues | null | undefined
): ResultChange[] {
  const prev = cloneResultValues(previous);
  const next = cloneResultValues(current);
  const tests = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const changes: ResultChange[] = [];
  for (const testCode of tests) {
    const prevParams = prev[testCode] || {};
    const nextParams = next[testCode] || {};
    const params = new Set([...Object.keys(prevParams), ...Object.keys(nextParams)]);
    for (const parameter of params) {
      const from = prevParams[parameter] ?? "";
      const to = nextParams[parameter] ?? "";
      if (from !== to) {
        changes.push({ testCode, parameter, previous: from, current: to });
      }
    }
  }
  return changes.sort(
    (a, b) => a.testCode.localeCompare(b.testCode) || a.parameter.localeCompare(b.parameter)
  );
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export function parseResultVersions(value: unknown): ResultVersion[] {
  if (!Array.isArray(value)) return [];
  const versions: ResultVersion[] = [];
  for (const item of value) {
    const rec = asRecord(item);
    if (!rec) continue;
    const version = typeof rec.version === "number" ? rec.version : Number(rec.version);
    if (!Number.isInteger(version) || version < 1) continue;
    const releasedAt = asString(rec.releasedAt);
    if (!releasedAt) continue;
    versions.push({
      version,
      values: cloneResultValues(rec.values as ResultValues),
      releasedBy: asString(rec.releasedBy),
      releasedByUid: asString(rec.releasedByUid),
      releasedAt,
      amendmentReason: asString(rec.amendmentReason),
      amendedBy: asString(rec.amendedBy),
      amendedByUid: asString(rec.amendedByUid),
      amendedByRole: asString(rec.amendedByRole),
      amendedByShift: asString(rec.amendedByShift),
      confirmedBy: asString(rec.confirmedBy),
      confirmedByUid: asString(rec.confirmedByUid),
      confirmedByRole: asString(rec.confirmedByRole),
    });
  }
  return versions.sort((a, b) => a.version - b.version);
}

export function parsePendingAmendment(value: unknown): PendingAmendment | null {
  const rec = asRecord(value);
  if (!rec) return null;
  const amendmentReason = asString(rec.amendmentReason);
  const initiatedAt = asString(rec.initiatedAt);
  const fromVersion = typeof rec.fromVersion === "number" ? rec.fromVersion : Number(rec.fromVersion);
  if (!amendmentReason || !initiatedAt || !Number.isInteger(fromVersion) || fromVersion < 1) {
    return null;
  }
  return {
    values: cloneResultValues(rec.values as ResultValues),
    amendmentReason,
    amendmentReasonCode: asString(rec.amendmentReasonCode),
    initiatedBy: asString(rec.initiatedBy),
    initiatedByUid: asString(rec.initiatedByUid),
    initiatedByRole: asString(rec.initiatedByRole),
    initiatedByShift: asString(rec.initiatedByShift),
    initiatedAt,
    fromVersion,
  };
}

export function firstReleaseVersion(input: {
  values: ResultValues | null | undefined;
  releasedBy: string | null;
  releasedByUid: string | null;
  releasedAt: string;
}): ResultVersion {
  return {
    version: 1,
    values: cloneResultValues(input.values),
    releasedBy: input.releasedBy,
    releasedByUid: input.releasedByUid,
    releasedAt: input.releasedAt,
    amendmentReason: null,
    amendedBy: null,
    amendedByUid: null,
    amendedByRole: null,
    amendedByShift: null,
    confirmedBy: null,
    confirmedByUid: null,
    confirmedByRole: null,
  };
}

export function ensureResultVersions(order: AmendmentOrderInput): ResultVersion[] {
  const parsed = parseResultVersions(order.resultVersions);
  if (parsed.length > 0) return parsed.map((row) => ({ ...row, values: cloneResultValues(row.values) }));
  if (!isReleasedResultStatus(order.status)) return [];
  return [
    firstReleaseVersion({
      values: order.results,
      releasedBy: order.reviewedBy ?? null,
      releasedByUid: order.reviewedByUid ?? null,
      releasedAt: order.reviewedAt || new Date().toISOString(),
    }),
  ];
}

export function originalResultVersion(order: AmendmentOrderInput): ResultVersion | null {
  const versions = ensureResultVersions(order);
  return versions.find((row) => row.version === 1) ?? versions[0] ?? null;
}

export function currentResultVersion(order: AmendmentOrderInput): ResultVersion | null {
  const versions = ensureResultVersions(order);
  return versions[versions.length - 1] ?? null;
}

export function originalReleasedAt(order: AmendmentOrderInput): string | null {
  return originalResultVersion(order)?.releasedAt || order.reviewedAt || null;
}

export function latestAmendmentAt(order: AmendmentOrderInput): string | null {
  const versions = parseResultVersions(order.resultVersions);
  const amended = versions.filter((row) => row.version > 1);
  if (amended.length > 0) return amended[amended.length - 1].releasedAt;
  return order.lastAmendedAt || null;
}

export function actorIsOriginalReleaser(
  order: AmendmentOrderInput,
  actor: { uid?: string | null; email?: string | null }
): boolean {
  const original = originalResultVersion(order);
  const uid = original?.releasedByUid || order.reviewedByUid || null;
  if (uid && actor.uid) return uid === actor.uid;
  return emailsMatch(original?.releasedBy || order.reviewedBy, actor.email);
}

export function actorIsPendingInitiator(
  pending: PendingAmendment | null,
  actor: { uid?: string | null; email?: string | null }
): boolean {
  if (!pending) return false;
  if (pending.initiatedByUid && actor.uid) return pending.initiatedByUid === actor.uid;
  return emailsMatch(pending.initiatedBy, actor.email);
}

export function amendmentTimestamps(order: AmendmentOrderInput): string[] {
  const versions = parseResultVersions(order.resultVersions);
  const times = versions.filter((row) => row.version > 1).map((row) => row.releasedAt);
  if (times.length === 0 && order.status === "amended" && order.lastAmendedAt) {
    return [order.lastAmendedAt];
  }
  return times;
}

export function countAmendmentsInWindow(
  orders: AmendmentOrderInput[],
  inWindow: (iso: string | null | undefined) => boolean
): number {
  let count = 0;
  for (const order of orders) {
    for (const iso of amendmentTimestamps(order)) {
      if (inWindow(iso)) count += 1;
    }
  }
  return count;
}

function appliedPayload(
  order: AmendmentOrderInput,
  newValues: ResultValues,
  reason: string,
  amender: AmendmentActor,
  confirmer: AmendmentActor | null,
  now: string
): { updates: Record<string, unknown>; previousVersion: number; newVersion: number } {
  const versions = ensureResultVersions(order);
  const previous = versions[versions.length - 1];
  const previousVersion = previous?.version ?? 1;
  const next: ResultVersion = {
    version: previousVersion + 1,
    values: cloneResultValues(newValues),
    releasedBy: amender.email,
    releasedByUid: amender.uid,
    releasedAt: now,
    amendmentReason: reason.trim(),
    amendedBy: amender.email,
    amendedByUid: amender.uid,
    amendedByRole: amender.role,
    amendedByShift: amender.shift,
    confirmedBy: confirmer?.email ?? amender.email,
    confirmedByUid: confirmer?.uid ?? amender.uid,
    confirmedByRole: confirmer?.role ?? amender.role,
  };
  return {
    previousVersion,
    newVersion: next.version,
    updates: {
      results: next.values,
      status: "amended",
      resultVersions: [...versions, next],
      currentResultVersion: next.version,
      pendingAmendment: null,
      pendingAmendmentAt: null,
      lastAmendedAt: now,
      lastAmendedBy: amender.email,
      lastAmendedByUid: amender.uid,
      lastAmendedByRole: amender.role,
      lastAmendedByShift: amender.shift,
      amendmentConfirmedBy: confirmer?.email ?? amender.email,
      amendmentConfirmedByUid: confirmer?.uid ?? amender.uid,
    },
  };
}

export function startAmendment(input: {
  order: AmendmentOrderInput;
  newValues: ResultValues;
  reason: string;
  reasonNote?: string | null;
  actor: AmendmentActor;
  now?: string;
}): StartAmendmentResult {
  if (!isReleasedResultStatus(input.order.status)) {
    return { ok: false, error: AMENDMENT_NOT_RELEASED_MESSAGE };
  }
  if (!amendmentReasonReady(input.reason, input.reasonNote)) {
    return { ok: false, error: AMENDMENT_REASON_MESSAGE };
  }
  const reasonText = formatJustification(AMENDMENT_CODES, input.reason, input.reasonNote);
  if (parsePendingAmendment(input.order.pendingAmendment)) {
    return { ok: false, error: AMENDMENT_PENDING_EXISTS_MESSAGE };
  }
  const current = input.order.results || currentResultVersion(input.order)?.values || {};
  if (changedResultValues(current, input.newValues).length === 0) {
    return { ok: false, error: AMENDMENT_NO_CHANGE_MESSAGE };
  }
  const now = input.now || new Date().toISOString();
  if (actorIsOriginalReleaser(input.order, input.actor)) {
    const versions = ensureResultVersions(input.order);
    const fromVersion = versions[versions.length - 1]?.version ?? 1;
    const pending: PendingAmendment = {
      values: cloneResultValues(input.newValues),
      amendmentReason: reasonText,
      amendmentReasonCode: input.reason,
      initiatedBy: input.actor.email,
      initiatedByUid: input.actor.uid,
      initiatedByRole: input.actor.role,
      initiatedByShift: input.actor.shift,
      initiatedAt: now,
      fromVersion,
    };
    return { ok: true, mode: "pending", updates: { pendingAmendment: pending, pendingAmendmentAt: now } };
  }
  const applied = appliedPayload(input.order, input.newValues, reasonText, input.actor, null, now);
  return { ok: true, mode: "applied", ...applied };
}

export function confirmAmendment(input: {
  order: AmendmentOrderInput;
  confirmer: AmendmentActor;
  now?: string;
}): ConfirmAmendmentResult {
  const pending = parsePendingAmendment(input.order.pendingAmendment);
  if (!pending) return { ok: false, error: AMENDMENT_NO_PENDING_MESSAGE };
  if (actorIsPendingInitiator(pending, input.confirmer)) {
    return { ok: false, error: CANNOT_CONFIRM_OWN_AMENDMENT_MESSAGE };
  }
  const amender: AmendmentActor = {
    uid: pending.initiatedByUid || "",
    email: pending.initiatedBy,
    role: pending.initiatedByRole,
    shift: pending.initiatedByShift,
  };
  const now = input.now || new Date().toISOString();
  const applied = appliedPayload(
    input.order,
    pending.values,
    pending.amendmentReason,
    amender,
    input.confirmer,
    now
  );
  return { ok: true, amender, ...applied };
}

export function cancelPendingAmendmentUpdates(): Record<string, unknown> {
  return { pendingAmendment: null, pendingAmendmentAt: null };
}

export function amendmentAuditDetail(input: {
  reason: string;
  previousVersion: number;
  newVersion: number;
  amender: AmendmentActor;
  confirmer: AmendmentActor | null;
  secondApprover: boolean;
}): Record<string, unknown> {
  return {
    reason: input.reason.trim(),
    previousVersion: input.previousVersion,
    newVersion: input.newVersion,
    amendedBy: input.amender.email,
    amendedByRole: input.amender.role,
    amendedByShift: input.amender.shift,
    confirmedBy: (input.confirmer ?? input.amender).email,
    confirmedByRole: (input.confirmer ?? input.amender).role,
    secondApprover: input.secondApprover,
  };
}
