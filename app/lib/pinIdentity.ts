/** Device session + per-staff PIN (PRD v0.4 §5.2). Attribution, not authorisation. */

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 6;
export const DEFAULT_IDLE_LOCK_MINUTES = 5;
export const PIN_ALGO = "PBKDF2-SHA256";
export const PIN_ITERATIONS = 100_000;

export const SENSITIVE_PIN_ACTIONS = [
  "release",
  "amendment",
  "erasure",
  "export",
  "staff",
] as const;

export type SensitivePinAction = (typeof SENSITIVE_PIN_ACTIONS)[number];

export type PinRecord = {
  hash: string;
  salt: string;
  algo: typeof PIN_ALGO;
  iterations: number;
  setAt: string;
};

export function isPinFormat(pin: string | null | undefined): boolean {
  return typeof pin === "string" && /^\d{4,6}$/.test(pin);
}

export function pinFormatError(pin: string | null | undefined): string | null {
  if (!pin) return "Enter a 4–6 digit PIN.";
  if (!/^\d+$/.test(pin)) return "The PIN must be digits only.";
  if (pin.length < PIN_MIN_LENGTH || pin.length > PIN_MAX_LENGTH) {
    return "The PIN must be 4–6 digits.";
  }
  return null;
}

function toHex(bytes: ArrayBuffer | Uint8Array): string {
  const view = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return Array.from(view, (b) => b.toString(16).padStart(2, "0")).join("");
}

function fromHex(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) {
    out[i] = Number.parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return out;
}

export async function hashPin(pin: string, saltHex?: string): Promise<PinRecord> {
  const error = pinFormatError(pin);
  if (error) throw new Error(error);
  const salt = saltHex ? fromHex(saltHex) : crypto.getRandomValues(new Uint8Array(16));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(pin),
    "PBKDF2",
    false,
    ["deriveBits"]
  );
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", hash: "SHA-256", iterations: PIN_ITERATIONS, salt: salt.buffer as ArrayBuffer },
    key,
    256
  );
  return {
    hash: toHex(bits),
    salt: toHex(salt),
    algo: PIN_ALGO,
    iterations: PIN_ITERATIONS,
    setAt: new Date().toISOString(),
  };
}

export async function verifyPin(pin: string, record: PinRecord | null | undefined): Promise<boolean> {
  if (!record || !isPinFormat(pin)) return false;
  if (record.algo !== PIN_ALGO) return false;
  const next = await hashPin(pin, record.salt);
  return next.hash === record.hash;
}

export function parsePinRecord(value: unknown): PinRecord | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  if (typeof rec.hash !== "string" || typeof rec.salt !== "string") return null;
  if (rec.algo !== PIN_ALGO) return null;
  const iterations = typeof rec.iterations === "number" ? rec.iterations : PIN_ITERATIONS;
  const setAt = typeof rec.setAt === "string" ? rec.setAt : "";
  return { hash: rec.hash, salt: rec.salt, algo: PIN_ALGO, iterations, setAt };
}

export function idleLockMs(minutes: number | null | undefined): number {
  const n = typeof minutes === "number" && minutes > 0 ? minutes : DEFAULT_IDLE_LOCK_MINUTES;
  return n * 60 * 1000;
}

export function isIdleLocked(lastActivityAt: number | null, now: number, minutes?: number | null): boolean {
  if (!lastActivityAt) return true;
  return now - lastActivityAt > idleLockMs(minutes);
}

export type ActingStaff = {
  uid: string;
  email: string | null;
  displayName: string;
  role: string | null;
  shift: string | null;
  clinicId: string | null;
  offRoster?: boolean;
};

export function clinicPinDocId(clinicId: string, uid: string): string {
  return `${clinicId}_${uid}`;
}

export function pinResetPayload() {
  return {
    pin: null,
    pinSetAt: null,
    pinResetAt: new Date().toISOString(),
  };
}
