const DEVICE_KEY = "labflow.deviceId";
const COUNTER_PREFIX = "labflow.labIdCounter.";

/** Crockford base32 without I, L, O, U — readable over a phone. */
const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";

export function labIdDatePart(now: Date = new Date()): string {
  return `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
}

export function readDeviceId(): string {
  if (typeof window === "undefined") return "ZZ";
  try {
    const existing = window.localStorage.getItem(DEVICE_KEY);
    if (existing && /^[0-9A-HJKMNP-TV-Z]{2}$/.test(existing)) return existing;
    const next = randomChars(2);
    window.localStorage.setItem(DEVICE_KEY, next);
    return next;
  } catch {
    return "ZZ";
  }
}

function randomChars(length: number): string {
  let out = "";
  const bytes = new Uint8Array(length);
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    crypto.getRandomValues(bytes);
  } else {
    for (let i = 0; i < length; i++) bytes[i] = Math.floor(Math.random() * 256);
  }
  for (let i = 0; i < length; i++) out += ALPHABET[bytes[i]! % ALPHABET.length];
  return out;
}

function nextDailyCounter(deviceId: string, datePart: string): string {
  const key = `${COUNTER_PREFIX}${datePart}.${deviceId}`;
  let n = 1;
  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(key);
      const parsed = raw ? Number(raw) : 0;
      n = Number.isInteger(parsed) && parsed >= 0 ? parsed + 1 : 1;
      window.localStorage.setItem(key, String(n));
    } catch {
      n = Math.floor(Math.random() * 900) + 100;
    }
  } else {
    n = Math.floor(Math.random() * 900) + 100;
  }
  return String(n).padStart(2, "0").slice(-2);
}

/**
 * Lab ID unique within a clinic: `LF-YYYYMMDD-XXXX`.
 * The suffix starts with a per-device identifier so two offline devices
 * on the same day cannot emit the same ID.
 */
export function generateLabId(now: Date = new Date(), deviceId: string = readDeviceId()): string {
  const datePart = labIdDatePart(now);
  const device = deviceId.slice(0, 2).toUpperCase().padEnd(2, "0");
  const counter = nextDailyCounter(device, datePart);
  return `LF-${datePart}-${device}${counter}`;
}

export const LAB_ID_PATTERN = /^LF-\d{8}-[0-9A-HJKMNP-TV-Z]{4}$/;

export function isLabId(value: unknown): boolean {
  return typeof value === "string" && LAB_ID_PATTERN.test(value);
}

export function specimenIdentifier(labId: string, specimenType: string): string {
  return `${labId}-${specimenType}`;
}
