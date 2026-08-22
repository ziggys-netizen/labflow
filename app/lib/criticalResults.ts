import { CRITICAL_NOTIFY_MEANS, CRITICAL_NOTIFY_OUTCOMES } from "./reasonCodes";
import { orderHasCriticalResults } from "./resultFlag";
import type { TestParameter } from "./resultModel";

export const CRITICAL_NOTIFY_WINDOW_MINUTES = 30;

export type CriticalNotifyMeans = (typeof CRITICAL_NOTIFY_MEANS)[number]["code"];
export type CriticalNotifyOutcome = (typeof CRITICAL_NOTIFY_OUTCOMES)[number]["code"];

export type CriticalNotification = {
  notifiedName: string;
  means: CriticalNotifyMeans;
  outcome: CriticalNotifyOutcome;
  notifiedByUid: string;
  notifiedBy: string | null;
  at: string;
  readBack: boolean;
};

export function parseCriticalNotification(value: unknown): CriticalNotification | null {
  if (!value || typeof value !== "object") return null;
  const rec = value as Record<string, unknown>;
  const means = CRITICAL_NOTIFY_MEANS.find((item) => item.code === rec.means)?.code;
  const outcome = CRITICAL_NOTIFY_OUTCOMES.find((item) => item.code === rec.outcome)?.code;
  if (!means || !outcome) return null;
  if (typeof rec.notifiedName !== "string" || !rec.notifiedName.trim()) return null;
  if (typeof rec.notifiedByUid !== "string" || !rec.notifiedByUid) return null;
  if (typeof rec.at !== "string" || !rec.at) return null;
  return {
    notifiedName: rec.notifiedName.trim(),
    means,
    outcome,
    notifiedByUid: rec.notifiedByUid,
    notifiedBy: typeof rec.notifiedBy === "string" ? rec.notifiedBy : null,
    at: rec.at,
    readBack: rec.readBack === true || outcome === "read_back_ok",
  };
}

export function criticalNotificationReady(input: {
  notifiedName: string;
  means: string;
  outcome: string;
}): boolean {
  return (
    input.notifiedName.trim().length > 0 &&
    CRITICAL_NOTIFY_MEANS.some((item) => item.code === input.means) &&
    CRITICAL_NOTIFY_OUTCOMES.some((item) => item.code === input.outcome)
  );
}

export function criticalAwaitingCommunication(order: {
  status?: string | null;
  hasCritical: boolean;
  criticalNotification?: unknown;
}): boolean {
  if (!order.hasCritical) return false;
  if (order.status !== "approved" && order.status !== "amended") return false;
  const notification = parseCriticalNotification(order.criticalNotification);
  if (notification && notification.outcome !== "could_not_reach" && notification.outcome !== "no_answer") {
    return false;
  }
  return true;
}

export function orderNeedsCriticalRecord(
  tests: { code: string }[],
  results: Record<string, Record<string, string>> | null | undefined,
  catalog: { code: string; parameters: TestParameter[] }[],
  sex?: string | null,
  existing?: unknown
): boolean {
  if (!orderHasCriticalResults(tests, results, catalog, sex)) return false;
  return !parseCriticalNotification(existing);
}
