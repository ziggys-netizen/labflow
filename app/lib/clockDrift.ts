/** Device-vs-server clock (PRD §9.3). Roster checks reuse this; they are not a tighter bound. */

export const CLOCK_DRIFT_WARN_MS = 2 * 60 * 1000;

export function clockDriftMs(deviceNow: number, serverNow: number): number {
  return Math.abs(deviceNow - serverNow);
}

export function clockDriftWarning(deviceNow: number, serverNow: number | null): string | null {
  if (serverNow == null || !Number.isFinite(serverNow)) return null;
  if (clockDriftMs(deviceNow, serverNow) <= CLOCK_DRIFT_WARN_MS) return null;
  return "This device clock disagrees with the server by more than two minutes. Roster checks use the device clock — correct the time if you can.";
}

export function parseServerNow(value: unknown): number | null {
  if (typeof value !== "string" || !value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}
