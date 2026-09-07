import { ACCEPTABLE_USE, isAcceptedTermsCurrent, compareTermsVersions } from "./acceptableUse";
import type { TermsAcceptanceRecord } from "./termsAcceptance";

/**
 * Decision: the owner is the processor, not clinic staff.
 * These acceptable-use terms are clinic staff terms and do not apply to the
 * owner. The owner is exempt from the acceptance gate and cannot create an
 * acceptance (clinicId is null). This is intentional, not an oversight.
 */
export const OWNER_EXEMPT_FROM_STAFF_TERMS = true;

export function isOwnerExemptFromStaffTerms(role: string | null | undefined): boolean {
  return OWNER_EXEMPT_FROM_STAFF_TERMS && role === "owner";
}

export const TERMS_PATH = "/terms";
export const TERMS_READ_PATH = "/legal/acceptable-use";
export const PRIVACY_PATH = "/legal/privacy";
export const SUPPORT_PATH = "/legal/support";

export const TERMS_DECLINE_MESSAGE =
  "You cannot use LabFlow without accepting these terms. Speak to your clinic administrator if you have questions.";

export const TERMS_DECLINE_STORAGE_KEY = "labflow.termsDecline";

export const TERMS_ACCEPT_CHECKBOX_LABEL =
  "I have read and accept the LabFlow acceptable-use terms";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
] as const;

/** Calendar date from `YYYY-MM-DD` — no timezone shift. */
export function formatTermsEffectiveDate(isoDate: string): string {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(isoDate);
  if (!match) return isoDate;
  const month = Number(match[2]);
  const day = Number(match[3]);
  const monthName = MONTHS[month - 1];
  if (!monthName || day < 1) return isoDate;
  return `${day} ${monthName} ${match[1]}`;
}

export function formatTermsUpdateNotice(
  document: { effectiveFrom: string; whatChanged: string } = ACCEPTABLE_USE
): string {
  return `These terms were updated on ${formatTermsEffectiveDate(document.effectiveFrom)}. What changed: ${document.whatChanged}`;
}

export function termsRecordedCaption(version: string = ACCEPTABLE_USE.version): string {
  return `TERMS v${version} · RECORDED WITH YOUR ACCOUNT AND THE TIME`;
}

export function staffHasCurrentTerms(
  acceptedVersion: string | null | undefined,
  currentVersion: string = ACCEPTABLE_USE.version
): boolean {
  if (!acceptedVersion) return false;
  return isAcceptedTermsCurrent(acceptedVersion, currentVersion);
}

export function newestAcceptedVersion(
  records: readonly TermsAcceptanceRecord[],
  documentId: string = ACCEPTABLE_USE.id
): string | null {
  let newest: string | null = null;
  for (const row of records) {
    if (row.documentId !== documentId) continue;
    if (newest == null || compareTermsVersions(row.version, newest) > 0) {
      newest = row.version;
    }
  }
  return newest;
}

export function acceptedVersionForUid(
  records: readonly TermsAcceptanceRecord[],
  uid: string,
  documentId: string = ACCEPTABLE_USE.id
): string | null {
  return newestAcceptedVersion(
    records.filter((row) => row.uid === uid),
    documentId
  );
}

export type StaffTermsIndicator = "accepted" | "not_accepted" | "not_required" | "unavailable";

export function staffTermsIndicator(input: {
  uid: string | null;
  state: string;
  isOwnerAccount?: boolean;
  acceptedVersion: string | null;
  currentVersion?: string;
}): StaffTermsIndicator {
  // Owner accounts are the processor, not clinic staff — terms do not apply.
  if (input.isOwnerAccount) return "not_required";
  if (!input.uid || input.state !== "approved") return "unavailable";
  if (staffHasCurrentTerms(input.acceptedVersion, input.currentVersion)) return "accepted";
  return "not_accepted";
}

export function staffTermsIndicatorLabel(status: StaffTermsIndicator): string {
  if (status === "accepted") return "Accepted";
  if (status === "not_accepted") return "Not accepted";
  if (status === "not_required") return "Not required";
  return "—";
}

export function isTermsReadablePath(pathname: string): boolean {
  return (
    pathname === TERMS_PATH ||
    pathname === TERMS_READ_PATH ||
    pathname === PRIVACY_PATH ||
    pathname === SUPPORT_PATH
  );
}

export function persistTermsDeclineNotice(): void {
  if (typeof sessionStorage === "undefined") return;
  try {
    sessionStorage.setItem(TERMS_DECLINE_STORAGE_KEY, TERMS_DECLINE_MESSAGE);
  } catch {
    // Private mode — login still works; the decline copy may not survive.
  }
}

export function consumeTermsDeclineNotice(): string | null {
  if (typeof sessionStorage === "undefined") return null;
  try {
    const value = sessionStorage.getItem(TERMS_DECLINE_STORAGE_KEY);
    if (value) sessionStorage.removeItem(TERMS_DECLINE_STORAGE_KEY);
    return value;
  } catch {
    return null;
  }
}
