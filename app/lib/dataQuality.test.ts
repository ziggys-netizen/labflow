import { describe, expect, it } from "vitest";
import {
  AUDIT_CLEAR_COLLECTION_TIME,
  COLLECTION_TIME_FIELDS_TO_DELETE,
  collectionClearExpected,
  findSuspiciousCollectionOrders,
  listCollectionTimestamps,
  migrationHistoryClearCollectionEntry,
  timestampSecondKey,
} from "./dataQuality";
import { SAMPLE_COLLECTED_SOURCE } from "./sampleCollection";

describe("timestampSecondKey", () => {
  it("treats timestamps that differ only in milliseconds as the same second", () => {
    expect(timestampSecondKey("2026-08-21T08:00:00.000Z")).toBe(
      timestampSecondKey("2026-08-21T08:00:00.999Z")
    );
    expect(timestampSecondKey("2026-08-21T08:00:00.000Z")).not.toBe(
      timestampSecondKey("2026-08-21T08:00:01.000Z")
    );
  });
});

describe("listCollectionTimestamps", () => {
  it("reads both the legacy field and per-specimen map", () => {
    expect(
      listCollectionTimestamps({
        sampleCollectedAt: "2026-08-21T08:00:00.000Z",
        sampleCollections: {
          urine: {
            collectedAt: "2026-08-21T09:00:00.000Z",
            collectedBy: null,
            collectedBySource: SAMPLE_COLLECTED_SOURCE.order,
          },
        },
      })
    ).toEqual(["2026-08-21T08:00:00.000Z", "2026-08-21T09:00:00.000Z"]);
  });
});

describe("findSuspiciousCollectionOrders", () => {
  it("flags several orders that share an identical collection second", () => {
    const flagged = findSuspiciousCollectionOrders([
      {
        id: "a",
        patientName: "Ada",
        patientLabId: "LF-1",
        createdAt: "2026-08-20T07:00:00.000Z",
        sampleCollectedAt: "2026-08-21T08:00:00.120Z",
      },
      {
        id: "b",
        patientName: "Ben",
        patientLabId: "LF-2",
        createdAt: "2026-08-20T07:05:00.000Z",
        sampleCollectedAt: "2026-08-21T08:00:00.880Z",
      },
      {
        id: "c",
        patientName: "Cara",
        patientLabId: "LF-3",
        createdAt: "2026-08-20T07:10:00.000Z",
        sampleCollectedAt: "2026-08-21T09:00:00.000Z",
      },
    ]);
    expect(flagged.map((row) => row.id).sort()).toEqual(["a", "b"]);
    expect(flagged.every((row) => row.reasons.includes("identicalTimestamp"))).toBe(true);
    expect(flagged.some((row) => row.id === "c")).toBe(false);
  });

  it("does not flag a single order whose own specimens share a second", () => {
    const flagged = findSuspiciousCollectionOrders([
      {
        id: "solo",
        patientName: "Solo",
        patientLabId: "LF-9",
        createdAt: "2026-08-20T07:00:00.000Z",
        tests: [
          { code: "FBC", specimenType: "blood" },
          { code: "UA", specimenType: "urine" },
        ],
        sampleCollections: {
          blood: {
            collectedAt: "2026-08-21T08:00:00.000Z",
            collectedBy: null,
            collectedBySource: SAMPLE_COLLECTED_SOURCE.order,
          },
          urine: {
            collectedAt: "2026-08-21T08:00:00.400Z",
            collectedBy: null,
            collectedBySource: SAMPLE_COLLECTED_SOURCE.order,
          },
        },
      },
    ]);
    expect(flagged).toEqual([]);
  });

  it("flags collection earlier than createdAt", () => {
    const flagged = findSuspiciousCollectionOrders([
      {
        id: "early",
        patientName: "Early",
        patientLabId: "LF-4",
        createdAt: "2026-08-21T10:00:00.000Z",
        sampleCollectedAt: "2026-08-21T08:00:00.000Z",
      },
    ]);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].reasons).toEqual(["beforeCreatedAt"]);
    expect(flagged[0].stampedTimes).toEqual(["2026-08-21T08:00:00.000Z"]);
  });

  it("flags collection after reviewedAt", () => {
    const flagged = findSuspiciousCollectionOrders([
      {
        id: "late",
        patientName: "Late",
        patientLabId: "LF-5",
        createdAt: "2026-08-21T07:00:00.000Z",
        reviewedAt: "2026-08-21T12:00:00.000Z",
        sampleCollectedAt: "2026-08-21T14:00:00.000Z",
      },
    ]);
    expect(flagged).toHaveLength(1);
    expect(flagged[0].reasons).toEqual(["afterReviewedAt"]);
  });

  it("does not flag a unique plausible collection time", () => {
    expect(
      findSuspiciousCollectionOrders([
        {
          id: "ok",
          patientName: "Ok",
          patientLabId: "LF-6",
          createdAt: "2026-08-21T07:00:00.000Z",
          reviewedAt: "2026-08-21T12:00:00.000Z",
          sampleCollectedAt: "2026-08-21T08:00:00.000Z",
        },
      ])
    ).toEqual([]);
  });
});

describe("collection clear payload", () => {
  it("clears the map and names every legacy field to delete — does not invent times", () => {
    expect(collectionClearExpected()).toEqual({ sampleCollections: {} });
    expect([...COLLECTION_TIME_FIELDS_TO_DELETE]).toEqual([
      "sampleCollectedAt",
      "sampleCollectedBy",
      "sampleCollectedSource",
      "sampleCollectionQuickAction",
      "legacySingleCollection",
    ]);
    expect(AUDIT_CLEAR_COLLECTION_TIME).toBe("dataQuality.clearCollectionTime");
  });

  it("records what was cleared on a migrationHistory entry", () => {
    const entry = migrationHistoryClearCollectionEntry({
      clinicId: "clinic-1",
      clinicName: "Harbor Lab",
      orderId: "order-1",
      patientName: "Ada",
      patientLabId: "LF-1",
      createdAt: "2026-08-20T07:00:00.000Z",
      clearedTimes: ["2026-08-21T08:00:00.000Z"],
      reasons: ["identicalTimestamp"],
      actorEmail: "owner@lab.test",
      actorUid: "uid-1",
      at: "2026-08-21T15:00:00.000Z",
    });
    expect(entry.dataType).toBe("data_quality_clear_collection");
    expect(entry.updatedCount).toBe(1);
    expect(entry.clearedOrderId).toBe("order-1");
    expect(entry.clearedTimes).toEqual(["2026-08-21T08:00:00.000Z"]);
    expect(entry.reasons).toEqual(["identicalTimestamp"]);
    expect(entry.status).toBe("completed");
  });
});
