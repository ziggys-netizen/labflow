import { Resend } from "resend";

export class ResendUnavailableError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ResendUnavailableError";
  }
}

let client: Resend | null = null;

/** Lazy. Missing env must fail at request time, never during `next build`. */
export function getResend(): Resend {
  const key = process.env.RESEND_API_KEY;
  if (!key) {
    throw new ResendUnavailableError("RESEND_API_KEY is not set.");
  }
  if (!client) client = new Resend(key);
  return client;
}

export function resendFromAddress(): string {
  const from = process.env.RESEND_FROM?.trim();
  if (!from) {
    throw new ResendUnavailableError("RESEND_FROM is not set.");
  }
  return from;
}

/**
 * Throws ResendUnavailableError when either setting is missing. Call before
 * spending anything on an email export — the hourly quota, Firestore reads,
 * building the workbook — so a mail setup that is not finished costs nothing.
 */
export function assertResendConfigured(): void {
  getResend();
  resendFromAddress();
}

export const RESEND_NOT_CONFIGURED_MESSAGE =
  "Email delivery is not configured. Set RESEND_API_KEY and RESEND_FROM (verified sending domain in Resend).";

export interface ResendFailure {
  name?: string | null;
  statusCode?: number | null;
  message?: string | null;
}

/**
 * What to tell the person when Resend refuses a message. Classified on
 * Resend's typed error name and status (resend.com/docs/api-reference/errors),
 * never on its message text. Every case is 502: the mail service, not LabFlow,
 * refused. The original error is logged by the caller before this is used.
 *
 * Resend's own message is not passed through: for a testing-domain refusal it
 * names the Resend account owner's address, which is not for every exporter.
 */
export function describeResendFailure(error: ResendFailure): { status: 502; message: string } {
  const name = error.name ?? "";
  const status = error.statusCode ?? null;

  if (name === "validation_error" && status === 403) {
    return {
      status: 502,
      message:
        "The mail service will not send from the RESEND_FROM address yet. Until that domain is verified in Resend, it only delivers to the Resend account owner's own address. Download still works.",
    };
  }
  if (
    name === "missing_api_key" ||
    name === "invalid_api_key" ||
    name === "restricted_api_key" ||
    name === "suspended_api_key"
  ) {
    return {
      status: 502,
      message:
        "The mail service rejected the RESEND_API_KEY. It needs a new sending key. Download still works.",
    };
  }
  if (name === "invalid_from_address") {
    return {
      status: 502,
      message:
        "RESEND_FROM is not a valid sender. Use the form LabFlow Reports <reports@your-verified-domain>. Download still works.",
    };
  }
  if (name === "daily_quota_exceeded" || name === "monthly_quota_exceeded" || name === "rate_limit_exceeded") {
    return {
      status: 502,
      message:
        "The mail service's sending limit has been reached. Try again later, or use Download.",
    };
  }
  return {
    status: 502,
    message: "The spreadsheet was built but email delivery failed. Try again shortly.",
  };
}
