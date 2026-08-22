import { describe, expect, it } from "vitest";
import {
  classifyTurnaround,
  formatTurnaroundExclusionCopy,
  median,
  summarizeTurnaround,
  turnaroundHours,
} from "./datetime";
import { collectionTurnaroundStart } from "./sampleCollection";

function isoHoursAgo(hours: number, from = "2026-08-21T12:00:00.000Z"): string {
  const t = new Date(from).getTime() - hours * 3600000;
  return new Date(t).toISOString();
}

describe("turnaroundHours", () => {
  it("returns null when sampleCollectedAt is missing — never zero", () => {
    expect(
      turnaroundHours({
        sampleCollectedAt: null,
        reviewedAt: "2026-08-21T12:00:00.000Z",
      })
    ).toBeNull();
    expect(
      turnaroundHours({
        reviewedAt: "2026-08-21T12:00:00.000Z",
      })
    ).toBeNull();
  });

  it("returns null when reviewedAt is missing — never zero", () => {
    expect(
      turnaroundHours({
        sampleCollectedAt: "2026-08-21T08:00:00.000Z",
        reviewedAt: null,
      })
    ).toBeNull();
    expect(
      turnaroundHours({
        sampleCollectedAt: "2026-08-21T08:00:00.000Z",
      })
    ).toBeNull();
  });

  it("returns elapsed hours when both timestamps are present", () => {
    expect(
      turnaroundHours({
        sampleCollectedAt: "2026-08-21T08:00:00.000Z",
        reviewedAt: "2026-08-21T12:00:00.000Z",
      })
    ).toBe(4);
  });

  it("returns null for invalid dates or review before collection", () => {
    expect(
      turnaroundHours({
        sampleCollectedAt: "not-a-date",
        reviewedAt: "2026-08-21T12:00:00.000Z",
      })
    ).toBeNull();
    expect(
      turnaroundHours({
        sampleCollectedAt: "2026-08-21T12:00:00.000Z",
        reviewedAt: "2026-08-21T08:00:00.000Z",
      })
    ).toBeNull();
  });

  it("uses the latest specimen collection time on a multi-specimen order", () => {
    expect(
      turnaroundHours({
        tests: [
          { code: "FBC", specimenType: "blood" },
          { code: "UA", specimenType: "urine" },
        ],
        sampleCollections: {
          blood: { collectedAt: "2026-08-21T08:00:00.000Z", collectedBy: null, collectedBySource: null },
          urine: { collectedAt: "2026-08-21T10:00:00.000Z", collectedBy: null, collectedBySource: null },
        },
        reviewedAt: "2026-08-21T12:00:00.000Z",
      })
    ).toBe(2);
  });

  it("excludes an order missing any specimen collection time — never zero", () => {
    expect(
      turnaroundHours({
        tests: [
          { code: "FBC", specimenType: "blood" },
          { code: "UA", specimenType: "urine" },
        ],
        sampleCollections: {
          blood: { collectedAt: "2026-08-21T08:00:00.000Z", collectedBy: null, collectedBySource: null },
        },
        reviewedAt: "2026-08-21T12:00:00.000Z",
      })
    ).toBeNull();
  });

  it("still computes for a legacy single timestamp on a multi-specimen order", () => {
    expect(
      turnaroundHours({
        tests: [
          { code: "FBC", specimenType: "blood" },
          { code: "UA", specimenType: "urine" },
        ],
        sampleCollectedAt: "2026-08-21T08:00:00.000Z",
        reviewedAt: "2026-08-21T12:00:00.000Z",
      })
    ).toBe(4);
    expect(
      collectionTurnaroundStart({
        tests: [
          { code: "FBC", specimenType: "blood" },
          { code: "UA", specimenType: "urine" },
        ],
        sampleCollectedAt: "2026-08-21T08:00:00.000Z",
      }).legacy
    ).toBe(true);
  });
});

describe("summarizeTurnaround", () => {
  it("excludes missing collection and review times from the median", () => {
    const reviewed = "2026-08-21T12:00:00.000Z";
    const summary = summarizeTurnaround([
      { sampleCollectedAt: isoHoursAgo(6, reviewed), reviewedAt: reviewed },
      { sampleCollectedAt: isoHoursAgo(2, reviewed), reviewedAt: reviewed },
      { sampleCollectedAt: null, reviewedAt: reviewed },
      { sampleCollectedAt: isoHoursAgo(4, reviewed), reviewedAt: null },
    ]);
    expect(summary.counted).toBe(2);
    expect(summary.excluded).toBe(2);
    expect(summary.excludedMissingCollection).toBe(1);
    expect(summary.excludedMissingReview).toBe(1);
    expect(summary.median).toBe(4);
    expect(summary.legacyCounted).toBe(2);
  });

  it("does not treat an all-missing set as a zero median", () => {
    const summary = summarizeTurnaround([
      { sampleCollectedAt: null, reviewedAt: "2026-08-21T12:00:00.000Z" },
      { sampleCollectedAt: "2026-08-21T08:00:00.000Z", reviewedAt: undefined },
    ]);
    expect(summary.median).toBeNull();
    expect(summary.counted).toBe(0);
    expect(summary.excluded).toBe(2);
    expect(summary.legacyCounted).toBe(0);
  });

  it("flags legacy singles and excludes orders missing a specimen time", () => {
    const reviewed = "2026-08-21T12:00:00.000Z";
    const summary = summarizeTurnaround([
      {
        tests: [
          { code: "FBC", specimenType: "blood" },
          { code: "UA", specimenType: "urine" },
        ],
        sampleCollectedAt: isoHoursAgo(4, reviewed),
        reviewedAt: reviewed,
      },
      {
        tests: [
          { code: "FBC", specimenType: "blood" },
          { code: "UA", specimenType: "urine" },
        ],
        sampleCollections: {
          blood: { collectedAt: isoHoursAgo(6, reviewed), collectedBy: null, collectedBySource: null },
        },
        reviewedAt: reviewed,
      },
    ]);
    expect(summary.counted).toBe(1);
    expect(summary.legacyCounted).toBe(1);
    expect(summary.excluded).toBe(1);
    expect(summary.median).toBe(4);
  });

  it("excludes collection after approval so the median cannot go negative", () => {
    const reviewed = "2026-08-21T12:00:00.000Z";
    const summary = summarizeTurnaround([
      { sampleCollectedAt: isoHoursAgo(4, reviewed), reviewedAt: reviewed },
      { sampleCollectedAt: "2026-08-21T14:00:00.000Z", reviewedAt: reviewed },
    ]);
    expect(summary.counted).toBe(1);
    expect(summary.excluded).toBe(1);
    expect(summary.excludedImpossible).toBe(1);
    expect(summary.excludedMissingCollection).toBe(0);
    expect(summary.median).toBe(4);
    expect(summary.median === null || summary.median >= 0).toBe(true);
  });

  it("splits missing collection from other exclusions and never counts them as zero", () => {
    const reviewed = "2026-08-21T12:00:00.000Z";
    const summary = summarizeTurnaround([
      { sampleCollectedAt: isoHoursAgo(6, reviewed), reviewedAt: reviewed },
      { sampleCollectedAt: null, reviewedAt: reviewed },
      { sampleCollectedAt: "2026-08-21T14:00:00.000Z", reviewedAt: reviewed },
      { sampleCollectedAt: isoHoursAgo(3, reviewed), reviewedAt: "not-a-date" },
    ]);
    expect(summary.counted).toBe(1);
    expect(summary.excludedMissingCollection).toBe(1);
    expect(summary.excludedImpossible).toBe(1);
    expect(summary.excludedInvalid).toBe(1);
    expect(summary.median).toBe(6);
    expect(
      formatTurnaroundExclusionCopy(summary)
    ).toBe(
      "Median of 1 order. 1 excluded — no recorded collection time. 1 excluded — collection after approval. 1 excluded — unreadable timestamps."
    );
  });
});

describe("classifyTurnaround", () => {
  it("never returns a negative hour count", () => {
    expect(
      classifyTurnaround({
        sampleCollectedAt: "2026-08-21T14:00:00.000Z",
        reviewedAt: "2026-08-21T12:00:00.000Z",
      })
    ).toEqual({ hours: null, exclusion: "impossible_times", legacy: true });
  });
});

describe("formatTurnaroundExclusionCopy", () => {
  it("always states the counted denominator and missing-collection exclusions", () => {
    expect(
      formatTurnaroundExclusionCopy({
        median: 3,
        counted: 12,
        excluded: 4,
        excludedMissingCollection: 4,
        excludedMissingReview: 0,
        excludedImpossible: 0,
        excludedInvalid: 0,
        legacyCounted: 0,
      })
    ).toBe("Median of 12 orders. 4 excluded — no recorded collection time.");
    expect(
      formatTurnaroundExclusionCopy({
        median: null,
        counted: 0,
        excluded: 0,
        excludedMissingCollection: 0,
        excludedMissingReview: 0,
        excludedImpossible: 0,
        excludedInvalid: 0,
        legacyCounted: 0,
      })
    ).toBe("Median of 0 orders. 0 excluded — no recorded collection time.");
  });
});

describe("median", () => {
  it("returns null for an empty list rather than zero", () => {
    expect(median([])).toBeNull();
  });
});
