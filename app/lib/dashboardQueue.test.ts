import { describe, expect, it } from "vitest";
import {
  compareDashboardQueueLongestFirst,
  countAllDashboardQueues,
  dashboardQueueAllHref,
  dashboardQueuePanelHref,
  dashboardQueueTileCountClass,
  dashboardQueueTileStripeClass,
  dashboardQueueTileTone,
  dashboardQueueWaitStartedAt,
  filterDashboardQueue,
  formatDashboardQueueTestLabel,
  orderMatchesDashboardQueue,
  parseDashboardQueueSlug,
  type DashboardQueueOrder,
  type DashboardQueueSlug,
} from "./dashboardQueue";

function order(partial: Partial<DashboardQueueOrder> & Pick<DashboardQueueOrder, "id">): DashboardQueueOrder {
  return {
    status: "pending",
    createdAt: "2026-09-01T10:00:00.000Z",
    tests: [{ code: "FBC", name: "Full blood count" }],
    sampleCollectedAt: null,
    sampleCollections: null,
    ...partial,
  };
}

describe("dashboardQueue", () => {
  it("parses known slugs only", () => {
    expect(parseDashboardQueueSlug("pending-tests")).toBe("pending-tests");
    expect(parseDashboardQueueSlug("not-a-queue")).toBeNull();
    expect(parseDashboardQueueSlug(null)).toBeNull();
  });

  it("matches the same predicates the dashboard counts use", () => {
    expect(orderMatchesDashboardQueue(order({ id: "1", status: "pending" }), "pending-tests", [])).toBe(
      true
    );
    expect(
      orderMatchesDashboardQueue(order({ id: "2", status: "results_entered" }), "awaiting-review", [])
    ).toBe(true);
    expect(
      orderMatchesDashboardQueue(order({ id: "3", status: "needs_correction" }), "returned-for-correction", [])
    ).toBe(true);
    expect(
      orderMatchesDashboardQueue(
        order({
          id: "4",
          status: "pending",
          sampleCollectedAt: null,
          sampleCollections: {},
        }),
        "awaiting-sample",
        []
      )
    ).toBe(true);
    expect(
      orderMatchesDashboardQueue(order({ id: "5", needsFinalReprint: true }), "pending-final-reprints", [])
    ).toBe(true);
  });

  it("sorts longest wait first and formats panel/all hrefs", () => {
    const rows = filterDashboardQueue(
      [
        order({ id: "new", createdAt: "2026-09-08T10:00:00.000Z" }),
        order({ id: "old", createdAt: "2026-09-01T10:00:00.000Z" }),
      ],
      "pending-tests",
      [],
      Date.parse("2026-09-08T12:00:00.000Z")
    );
    expect(rows.map((row) => row.id)).toEqual(["old", "new"]);
    expect(dashboardQueuePanelHref("awaiting-review")).toBe("/dashboard?queue=awaiting-review");
    expect(dashboardQueueAllHref("awaiting-sample")).toBe("/dashboard/queues/awaiting-sample");
  });

  it("picks wait-start timestamps per tile", () => {
    const row = order({
      id: "r",
      status: "needs_correction",
      createdAt: "2026-09-01T00:00:00.000Z",
      resultsEnteredAt: "2026-09-02T00:00:00.000Z",
      reviewedAt: "2026-09-03T00:00:00.000Z",
      provisionalPrintedAt: "2026-09-04T00:00:00.000Z",
    });
    expect(dashboardQueueWaitStartedAt(row, "returned-for-correction")).toBe("2026-09-03T00:00:00.000Z");
    expect(dashboardQueueWaitStartedAt(row, "pending-final-reprints")).toBe("2026-09-04T00:00:00.000Z");
    expect(formatDashboardQueueTestLabel(row.tests)).toBe("Full blood count");
  });

  it("counts every slug from one shared path", () => {
    const counts = countAllDashboardQueues(
      [
        order({ id: "a", status: "pending" }),
        order({ id: "b", status: "results_entered" }),
        order({ id: "c", status: "needs_correction" }),
        order({ id: "d", needsFinalReprint: true, status: "approved" }),
      ],
      []
    );
    expect(counts["pending-tests"]).toBe(1);
    expect(counts["awaiting-review"]).toBe(1);
    expect(counts["returned-for-correction"]).toBe(1);
    expect(counts["pending-final-reprints"]).toBe(1);
  });

  it("ties break on id for stable longest-first order", () => {
    expect(
      compareDashboardQueueLongestFirst(
        { waitStartedAt: "2026-09-01T00:00:00.000Z", id: "b" },
        { waitStartedAt: "2026-09-01T00:00:00.000Z", id: "a" }
      )
    ).toBeGreaterThan(0);
  });

  it("colours tiles only when count is above zero", () => {
    const cases: Array<[DashboardQueueSlug, "neutral" | "warn" | "crit"]> = [
      ["pending-tests", "neutral"],
      ["awaiting-review", "warn"],
      ["returned-for-correction", "warn"],
      ["awaiting-sample", "warn"],
      ["critical-awaiting-communication", "crit"],
      ["pending-final-reprints", "neutral"],
    ];
    for (const [slug, active] of cases) {
      expect(dashboardQueueTileTone(slug, 0)).toBe("idle");
      expect(dashboardQueueTileTone(slug, 1)).toBe(active);
    }
    expect(dashboardQueueTileStripeClass("idle")).toBe("");
    expect(dashboardQueueTileCountClass("idle")).toContain("text-lf-ink-3");
    expect(dashboardQueueTileStripeClass("crit")).toContain("border-lf-crit");
    expect(dashboardQueueTileCountClass("crit")).toContain("text-lf-crit");
    expect(dashboardQueueTileStripeClass("warn")).toContain("border-lf-warn");
    expect(dashboardQueueTileCountClass("warn")).toContain("text-lf-warn");
    expect(dashboardQueueTileStripeClass("neutral")).toContain("border-lf-line-strong");
    expect(dashboardQueueTileCountClass("neutral")).toContain("text-lf-ink");
  });
});
