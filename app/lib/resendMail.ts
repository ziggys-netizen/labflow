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
