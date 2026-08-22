import { interpretCollection, type CollectionOrderInput } from "./sampleCollection";

export const ORDER_STATUSES = [
  "pending",
  "results_entered",
  "approved",
  "amended",
  "needs_correction",
  "rejected",
  "cancelled",
] as const;

export type OrderStatus = (typeof ORDER_STATUSES)[number];

export const TERMINAL_ORDER_STATUSES = ["rejected", "cancelled"] as const;

export function isOrderStatus(value: unknown): value is OrderStatus {
  return typeof value === "string" && (ORDER_STATUSES as readonly string[]).includes(value);
}

export function isTerminalOrderStatus(status: string | null | undefined): boolean {
  return status === "rejected" || status === "cancelled";
}

export function canEnterResultsForStatus(status: string | null | undefined): boolean {
  return status === "pending" || status === "results_entered" || status === "needs_correction";
}

export function canReleaseStatus(status: string | null | undefined): boolean {
  return status === "results_entered";
}

export function canRejectStatus(status: string | null | undefined): boolean {
  return status === "pending" || status === "results_entered" || status === "needs_correction";
}

export function canCancelStatus(status: string | null | undefined): boolean {
  return status === "pending";
}

export function orderDisplayLabel(
  order: CollectionOrderInput & { status?: string | null },
  catalog?: { code: string; specimenType?: unknown }[]
): { label: string; tone: "neutral" | "blue" | "amber" | "green" | "red" } {
  const collection = interpretCollection(order, catalog);
  if (
    !collection.allCollected &&
    collection.required.length > 0 &&
    !isTerminalOrderStatus(order.status)
  ) {
    return { label: collection.awaitingLabel || "Collect sample", tone: "neutral" };
  }
  switch (order.status) {
    case "pending":
      return { label: "Enter results", tone: "blue" };
    case "results_entered":
      return { label: "Ready to release", tone: "amber" };
    case "needs_correction":
      return { label: "Fix this", tone: "red" };
    case "approved":
      return { label: "Done", tone: "green" };
    case "amended":
      return { label: "Corrected", tone: "green" };
    case "rejected":
      return { label: "Cannot test", tone: "red" };
    case "cancelled":
      return { label: "Stopped", tone: "neutral" };
    default:
      return { label: (order.status || "pending").replace(/_/g, " "), tone: "neutral" };
  }
}

export function orderDisplayToneClass(tone: ReturnType<typeof orderDisplayLabel>["tone"]): string {
  switch (tone) {
    case "blue":
      return "text-blue-800 border-blue-200 bg-blue-50";
    case "amber":
      return "text-amber-900 border-amber-300 bg-amber-50";
    case "green":
      return "text-green-800 border-green-200 bg-green-50";
    case "red":
      return "text-red-800 border-red-200 bg-red-50";
    default:
      return "text-gray-600 border-gray-200";
  }
}
