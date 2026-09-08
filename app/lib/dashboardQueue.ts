/**
 * G1 — Current queue tile sets on /dashboard.
 * Count predicates and list filters share these helpers so a tile and its panel
 * cannot drift apart. Predicates match the pre-G1 dashboard metric filters
 * (status / collection / critical / reprint) so list rows are exactly what
 * each tile counted.
 */

import { criticalAwaitingCommunication } from "./criticalResults";
import { orderHasCriticalResults } from "./resultFlag";
import { formatHours, hoursSince } from "./reviewQueue";
import { isReleasedResultStatus } from "./resultAmendment";
import {
  interpretCollection,
  type CollectionOrderInput,
  type OrderTestRef,
} from "./sampleCollection";
import type { LabTest } from "./testCatalog";
import { resolveSpecimenCap, type SpecimenCap } from "./specimenCap";

export const DASHBOARD_QUEUE_SLUGS = [
  "pending-tests",
  "awaiting-review",
  "returned-for-correction",
  "awaiting-sample",
  "critical-awaiting-communication",
  "pending-final-reprints",
] as const;

export type DashboardQueueSlug = (typeof DASHBOARD_QUEUE_SLUGS)[number];

export const DASHBOARD_QUEUE_PANEL_LIMIT = 10;

export type DashboardQueueTile = {
  slug: DashboardQueueSlug;
  label: string;
  hint: string;
};

export const DASHBOARD_QUEUE_TILES: DashboardQueueTile[] = [
  {
    slug: "pending-tests",
    label: "Pending tests",
    hint: "Ordered, results not entered",
  },
  {
    slug: "awaiting-review",
    label: "Awaiting review",
    hint: "Entered, not yet approved",
  },
  {
    slug: "returned-for-correction",
    label: "Returned for correction",
    hint: "Sent back by the lab manager",
  },
  {
    slug: "awaiting-sample",
    label: "Awaiting sample",
    hint: "A required specimen has no collection time",
  },
  {
    slug: "critical-awaiting-communication",
    label: "Critical results awaiting communication",
    hint: "Released, named person not yet recorded as told",
  },
  {
    slug: "pending-final-reprints",
    label: "Pending final reprints",
    hint: "Provisional reports waiting for a confirmed copy",
  },
];

export type DashboardQueueOrder = CollectionOrderInput & {
  id: string;
  status: string;
  createdAt: string | null;
  resultsEnteredAt?: string | null;
  reviewedAt?: string | null;
  lastAmendedAt?: string | null;
  needsFinalReprint?: boolean;
  provisionalPrintedAt?: string | null;
  criticalNotification?: unknown;
  results?: Record<string, Record<string, string>> | null;
  tests: OrderTestRef[];
  patientId?: string | null;
  patientLabId?: string | null;
  patientSex?: string | null;
  notYetSynced?: boolean;
  recollectionOfOrderId?: string | null;
};

export function isDashboardQueueSlug(value: string | null | undefined): value is DashboardQueueSlug {
  return DASHBOARD_QUEUE_SLUGS.includes(value as DashboardQueueSlug);
}

export function parseDashboardQueueSlug(value: string | null | undefined): DashboardQueueSlug | null {
  if (!value) return null;
  return isDashboardQueueSlug(value) ? value : null;
}

export function dashboardQueueTile(slug: DashboardQueueSlug): DashboardQueueTile {
  return DASHBOARD_QUEUE_TILES.find((tile) => tile.slug === slug)!;
}

/**
 * G2 — tile colour when there is work. Zero stays grey (idle).
 * Neutral = line-strong edge + ink number; warn/crit colour both edge and count.
 */
export type DashboardQueueTileTone = "idle" | "neutral" | "warn" | "crit";

export function dashboardQueueTileTone(
  slug: DashboardQueueSlug,
  count: number
): DashboardQueueTileTone {
  if (count <= 0) return "idle";
  switch (slug) {
    case "critical-awaiting-communication":
      return "crit";
    case "awaiting-review":
    case "returned-for-correction":
    case "awaiting-sample":
      return "warn";
    case "pending-tests":
    case "pending-final-reprints":
      return "neutral";
    default:
      return "idle";
  }
}

/** 3px left edge — only when count > 0. No filled backgrounds. */
export function dashboardQueueTileStripeClass(tone: DashboardQueueTileTone): string {
  switch (tone) {
    case "crit":
      return "lf-op-stripe border-lf-crit";
    case "warn":
      return "lf-op-stripe border-lf-warn";
    case "neutral":
      return "lf-op-stripe border-lf-line-strong";
    default:
      return "";
  }
}

/** Count colour at 24px mono / 600 — grey when idle. */
export function dashboardQueueTileCountClass(tone: DashboardQueueTileTone): string {
  switch (tone) {
    case "crit":
      return "lf-num text-[24px] font-semibold text-lf-crit";
    case "warn":
      return "lf-num text-[24px] font-semibold text-lf-warn";
    case "neutral":
      return "lf-num text-[24px] font-semibold text-lf-ink";
    default:
      return "lf-num text-[24px] font-semibold text-lf-ink-3";
  }
}

export function dashboardQueuePanelHref(slug: DashboardQueueSlug): string {
  return `/dashboard?queue=${slug}`;
}

export function dashboardQueueAllHref(slug: DashboardQueueSlug): string {
  return `/dashboard/queues/${slug}`;
}

export function orderMatchesDashboardQueue(
  order: DashboardQueueOrder,
  slug: DashboardQueueSlug,
  catalog: LabTest[]
): boolean {
  switch (slug) {
    case "pending-tests":
      return order.status === "pending";
    case "awaiting-review":
      return order.status === "results_entered";
    case "returned-for-correction":
      return order.status === "needs_correction";
    case "awaiting-sample":
      return !isReleasedResultStatus(order.status) && !interpretCollection(order).allCollected;
    case "critical-awaiting-communication":
      return criticalAwaitingCommunication({
        status: order.status,
        hasCritical: orderHasCriticalResults(order.tests, order.results, catalog, null),
        criticalNotification: order.criticalNotification,
      });
    case "pending-final-reprints":
      return order.needsFinalReprint === true;
    default:
      return false;
  }
}

/** When this order entered the tile's set — used for "time in this state". */
export function dashboardQueueWaitStartedAt(
  order: DashboardQueueOrder,
  slug: DashboardQueueSlug
): string | null {
  switch (slug) {
    case "pending-tests":
      return order.createdAt || null;
    case "awaiting-review":
      return order.resultsEnteredAt || order.createdAt || null;
    case "returned-for-correction":
      return order.reviewedAt || order.resultsEnteredAt || order.createdAt || null;
    case "awaiting-sample":
      return order.createdAt || null;
    case "critical-awaiting-communication":
      return order.reviewedAt || order.createdAt || null;
    case "pending-final-reprints":
      return order.provisionalPrintedAt || order.reviewedAt || order.createdAt || null;
    default:
      return null;
  }
}

export function compareDashboardQueueLongestFirst(
  a: { waitStartedAt: string | null; id: string },
  b: { waitStartedAt: string | null; id: string }
): number {
  if (a.waitStartedAt === b.waitStartedAt) return a.id.localeCompare(b.id);
  if (!a.waitStartedAt) return 1;
  if (!b.waitStartedAt) return -1;
  return a.waitStartedAt < b.waitStartedAt ? -1 : 1;
}

export function formatDashboardQueueWait(iso: string | null | undefined, nowMs: number = Date.now()): string {
  return formatHours(hoursSince(iso, nowMs));
}

export function formatDashboardQueueTestLabel(tests: OrderTestRef[]): string {
  if (!tests.length) return "—";
  return tests.map((test) => test.name || test.code || "—").filter(Boolean).join(", ");
}

export type DashboardQueueTestItem = {
  label: string;
  cap: SpecimenCap | null;
};

/** Per-test labels with D6 tube-cap colours for the expanded queue panel. */
export function formatDashboardQueueTestItems(
  tests: OrderTestRef[],
  catalog: { code: string; specimenCap?: unknown }[] = []
): DashboardQueueTestItem[] {
  if (!tests.length) return [{ label: "—", cap: null }];
  return tests.map((test) => ({
    label: test.name || test.code || "—",
    cap: resolveSpecimenCap(
      (test as { specimenCap?: unknown }).specimenCap,
      test.code,
      catalog
    ),
  }));
}

export function filterDashboardQueue(
  orders: DashboardQueueOrder[],
  slug: DashboardQueueSlug,
  catalog: LabTest[],
  nowMs: number = Date.now()
): Array<DashboardQueueOrder & { waitStartedAt: string | null; timeInState: string }> {
  return orders
    .filter((order) => orderMatchesDashboardQueue(order, slug, catalog))
    .map((order) => {
      const waitStartedAt = dashboardQueueWaitStartedAt(order, slug);
      return {
        ...order,
        waitStartedAt,
        timeInState: formatDashboardQueueWait(waitStartedAt, nowMs),
      };
    })
    .sort(compareDashboardQueueLongestFirst);
}

export function countDashboardQueue(
  orders: DashboardQueueOrder[],
  slug: DashboardQueueSlug,
  catalog: LabTest[]
): number {
  return orders.filter((order) => orderMatchesDashboardQueue(order, slug, catalog)).length;
}

export function countAllDashboardQueues(
  orders: DashboardQueueOrder[],
  catalog: LabTest[]
): Record<DashboardQueueSlug, number> {
  const counts = {} as Record<DashboardQueueSlug, number>;
  for (const slug of DASHBOARD_QUEUE_SLUGS) {
    counts[slug] = countDashboardQueue(orders, slug, catalog);
  }
  return counts;
}
