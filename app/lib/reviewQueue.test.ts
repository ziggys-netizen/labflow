import { describe, expect, it } from "vitest";
import { SAMPLE_COLLECTED_SOURCE } from "./sampleCollection";
import {
  compareQueueOldestFirst,
  countResultsEntered,
  formatHours,
  hoursSince,
  hoursSinceCollection,
  inActingClinic,
  isSelfRelease,
  isWaitingOver24Hours,
  queueWaitStartedAt,
  reviewNotesReady,
} from "./reviewQueue";

const NOW = Date.parse("2026-08-21T12:00:00.000Z");

describe("isSelfRelease", () => {
  it("matches emails case-insensitively and does not exempt a missing counterpart", () => {
    expect(isSelfRelease("Tech@Lab.test", "tech@lab.test")).toBe(true);
    expect(isSelfRelease("a@lab.test", "b@lab.test")).toBe(false);
    expect(isSelfRelease(null, "tech@lab.test")).toBe(false);
  });
});

describe("reviewNotesReady", () => {
  it("requires ten non-whitespace characters", () => {
    expect(reviewNotesReady("too short")).toBe(false);
    expect(reviewNotesReady("  123456789  ")).toBe(false);
    expect(reviewNotesReady("Please recheck Hb")).toBe(true);
  });
});

describe("hoursSinceCollection", () => {
  it("uses the latest specimen collection time from S5", () => {
    expect(
      hoursSinceCollection(
        {
          tests: [
            { code: "FBC", specimenType: "blood" },
            { code: "UA", specimenType: "urine" },
          ],
          sampleCollections: {
            blood: {
              collectedAt: "2026-08-21T08:00:00.000Z",
              collectedBy: "tech@lab.test",
              collectedBySource: SAMPLE_COLLECTED_SOURCE.order,
            },
            urine: {
              collectedAt: "2026-08-21T10:00:00.000Z",
              collectedBy: "tech@lab.test",
              collectedBySource: SAMPLE_COLLECTED_SOURCE.order,
            },
          },
        },
        NOW
      )
    ).toBe(2);
  });

  it("uses a legacy single timestamp and returns null when a specimen is missing", () => {
    expect(
      hoursSinceCollection(
        {
          tests: [{ code: "FBC", specimenType: "blood" }],
          sampleCollectedAt: "2026-08-21T06:00:00.000Z",
        },
        NOW
      )
    ).toBe(6);
    expect(
      hoursSinceCollection(
        {
          tests: [
            { code: "FBC", specimenType: "blood" },
            { code: "UA", specimenType: "urine" },
          ],
          sampleCollections: {
            blood: {
              collectedAt: "2026-08-21T08:00:00.000Z",
              collectedBy: "tech@lab.test",
              collectedBySource: SAMPLE_COLLECTED_SOURCE.order,
            },
          },
        },
        NOW
      )
    ).toBeNull();
  });
});

describe("queue ordering and stale wait", () => {
  it("sorts longest wait first and marks rows over 24 hours", () => {
    const older = {
      id: "a",
      waitStartedAt: queueWaitStartedAt({
        status: "results_entered",
        resultsEnteredAt: "2026-08-20T08:00:00.000Z",
        createdAt: "2026-08-20T07:00:00.000Z",
      }),
    };
    const newer = {
      id: "b",
      waitStartedAt: queueWaitStartedAt({
        status: "results_entered",
        resultsEnteredAt: "2026-08-21T10:00:00.000Z",
        createdAt: "2026-08-21T09:00:00.000Z",
      }),
    };
    expect([newer, older].sort(compareQueueOldestFirst).map((row) => row.id)).toEqual(["a", "b"]);
    expect(isWaitingOver24Hours(older.waitStartedAt, NOW)).toBe(true);
    expect(isWaitingOver24Hours(newer.waitStartedAt, NOW)).toBe(false);
  });

  it("counts results_entered in the acting clinic only", () => {
    expect(
      countResultsEntered(
        [
          { status: "results_entered", clinicId: "c1" },
          { status: "results_entered", clinicId: "c2" },
          { status: "needs_correction", clinicId: "c1" },
          { status: "approved", clinicId: "c1" },
        ],
        "c1"
      )
    ).toBe(1);
    expect(countResultsEntered([{ status: "results_entered", clinicId: "c1" }], null)).toBe(0);
    expect(inActingClinic("c1", "c1")).toBe(true);
    expect(inActingClinic("c1", "c2")).toBe(false);
  });
});

describe("formatHours", () => {
  it("does not treat a missing timestamp as zero", () => {
    expect(formatHours(hoursSince(null, NOW))).toBe("—");
    expect(formatHours(2.4)).toBe("2.4 h");
    expect(formatHours(26.2)).toBe("26 h");
  });
});
