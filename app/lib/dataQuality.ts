import { parseSampleCollections, type CollectionOrderInput } from "./sampleCollection";

export const AUDIT_CLEAR_COLLECTION_TIME = "dataQuality.clearCollectionTime";

export const IDENTICAL_TIMESTAMP_MIN_ORDERS = 2;

export const COLLECTION_TIME_FIELDS_TO_DELETE = [
  "sampleCollectedAt",
  "sampleCollectedBy",
  "sampleCollectedSource",
  "sampleCollectionQuickAction",
  "legacySingleCollection",
] as const;

export type CollectionSuspicionReason = "identicalTimestamp" | "beforeCreatedAt" | "afterReviewedAt";

export const COLLECTION_SUSPICION_LABELS: Record<CollectionSuspicionReason, string> = {
  identicalTimestamp: "Same collection second as other orders",
  beforeCreatedAt: "Collection earlier than created time",
  afterReviewedAt: "Collection after approval (impossible turnaround)",
};

export interface CollectionQualityOrder extends CollectionOrderInput {
  id: string;
  patientName?: string | null;
  patientLabId?: string | null;
  createdAt?: string | null;
  reviewedAt?: string | null;
}

export interface SuspiciousCollectionOrder {
  id: string;
  patientName: string;
  patientLabId: string;
  createdAt: string;
  reviewedAt: string | null;
  stampedTimes: string[];
  reasons: CollectionSuspicionReason[];
}

function parseMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/** Floor to the Unix second so millisecond-identical bulk stamps still match. */
export function timestampSecondKey(iso: string): number | null {
  const t = parseMs(iso);
  return t === null ? null : Math.floor(t / 1000);
}

/** Every stamped collection time on the order — legacy field and per-specimen map. */
export function listCollectionTimestamps(order: CollectionOrderInput): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  function add(value: string | null | undefined) {
    if (!value || parseMs(value) === null || seen.has(value)) return;
    seen.add(value);
    out.push(value);
  }
  add(typeof order.sampleCollectedAt === "string" ? order.sampleCollectedAt : null);
  const collections = parseSampleCollections(order.sampleCollections);
  for (const record of Object.values(collections)) {
    if (record) add(record.collectedAt);
  }
  out.sort();
  return out;
}

export function collectionClearExpected(): { sampleCollections: Record<string, never> } {
  return { sampleCollections: {} };
}

export function findSuspiciousCollectionOrders(
  orders: CollectionQualityOrder[]
): SuspiciousCollectionOrder[] {
  const withTimes = orders.map((order) => ({
    order,
    stampedTimes: listCollectionTimestamps(order),
  }));

  const ordersBySecond = new Map<number, Set<string>>();
  for (const row of withTimes) {
    const keys = new Set<number>();
    for (const iso of row.stampedTimes) {
      const key = timestampSecondKey(iso);
      if (key === null) continue;
      keys.add(key);
    }
    for (const key of keys) {
      const bucket = ordersBySecond.get(key) ?? new Set<string>();
      bucket.add(row.order.id);
      ordersBySecond.set(key, bucket);
    }
  }

  const identicalSeconds = new Set<number>();
  for (const [key, ids] of ordersBySecond) {
    if (ids.size >= IDENTICAL_TIMESTAMP_MIN_ORDERS) identicalSeconds.add(key);
  }

  const flagged: SuspiciousCollectionOrder[] = [];
  for (const row of withTimes) {
    if (row.stampedTimes.length === 0) continue;
    const reasons: CollectionSuspicionReason[] = [];
    const createdMs = parseMs(row.order.createdAt);
    const reviewedMs = parseMs(row.order.reviewedAt);

    for (const iso of row.stampedTimes) {
      const collectedMs = parseMs(iso);
      if (collectedMs === null) continue;
      const second = timestampSecondKey(iso);
      if (second !== null && identicalSeconds.has(second) && !reasons.includes("identicalTimestamp")) {
        reasons.push("identicalTimestamp");
      }
      if (createdMs !== null && collectedMs < createdMs && !reasons.includes("beforeCreatedAt")) {
        reasons.push("beforeCreatedAt");
      }
      if (reviewedMs !== null && collectedMs > reviewedMs && !reasons.includes("afterReviewedAt")) {
        reasons.push("afterReviewedAt");
      }
    }

    if (reasons.length === 0) continue;
    flagged.push({
      id: row.order.id,
      patientName: row.order.patientName || "—",
      patientLabId: row.order.patientLabId || "—",
      createdAt: row.order.createdAt || "",
      reviewedAt: row.order.reviewedAt || null,
      stampedTimes: row.stampedTimes,
      reasons,
    });
  }

  flagged.sort((a, b) => {
    if (a.createdAt === b.createdAt) return a.id.localeCompare(b.id);
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return a.createdAt < b.createdAt ? -1 : 1;
  });
  return flagged;
}

export function migrationHistoryClearCollectionEntry(params: {
  clinicId: string;
  clinicName: string;
  orderId: string;
  patientName: string;
  patientLabId: string;
  createdAt: string;
  clearedTimes: string[];
  reasons: CollectionSuspicionReason[];
  actorEmail: string | null;
  actorUid: string;
  at?: string;
}) {
  const createdAt = params.at || new Date().toISOString();
  return {
    clinicId: params.clinicId,
    clinicName: params.clinicName,
    dataType: "data_quality_clear_collection",
    fileName: null,
    totalRows: 1,
    readyCount: 0,
    duplicateCount: 0,
    attentionCount: 0,
    skippedCount: 0,
    importedCount: 0,
    updatedCount: 1,
    failedCount: 0,
    status: "completed" as const,
    createdAt,
    createdByEmail: params.actorEmail,
    createdByUid: params.actorUid,
    collectionCounts: { orders: 1 },
    clearedOrderId: params.orderId,
    patientName: params.patientName,
    patientLabId: params.patientLabId,
    orderCreatedAt: params.createdAt,
    clearedTimes: params.clearedTimes,
    reasons: params.reasons,
  };
}
