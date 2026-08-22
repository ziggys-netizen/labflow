import { describe, expect, it } from "vitest";
import {
  awaitingSampleLabel,
  collectionTurnaroundStart,
  getPatientCollectionCheckboxState,
  interpretCollection,
  MULTI_SPECIMEN_CHECKBOX_EXPLANATION,
  requiredSpecimenTypes,
  SAMPLE_COLLECTED_SOURCE,
  type OrderCollectionFields,
} from "./sampleCollection";

function order(partial: Partial<OrderCollectionFields> & Pick<OrderCollectionFields, "id">): OrderCollectionFields {
  return {
    status: "pending",
    tests: [],
    sampleCollectedAt: null,
    sampleCollectedSource: null,
    sampleCollections: {},
    ...partial,
  };
}

describe("requiredSpecimenTypes", () => {
  it("derives distinct types from order tests, using seed fallback by code", () => {
    expect(
      requiredSpecimenTypes({
        tests: [
          { code: "FBC", name: "Full Blood Count (FBC)" },
          { code: "UA", name: "Urinalysis" },
          { code: "PREG", name: "Pregnancy Test (Urine hCG)" },
        ],
      })
    ).toEqual(["blood", "urine"]);
  });
});

describe("interpretCollection", () => {
  it("leaves a blood+urine order awaiting the uncollected specimen, named", () => {
    const state = interpretCollection({
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
    });
    expect(state.isMultiSpecimen).toBe(true);
    expect(state.allCollected).toBe(false);
    expect(state.uncollected).toEqual(["urine"]);
    expect(state.awaitingLabel).toBe("Awaiting urine");
    expect(state.latestCollectedAt).toBeNull();
  });

  it("reads a legacy sampleCollectedAt for every specimen without inventing a map", () => {
    const state = interpretCollection({
      tests: [
        { code: "FBC", specimenType: "blood" },
        { code: "UA", specimenType: "urine" },
      ],
      sampleCollectedAt: "2026-08-21T08:00:00.000Z",
      sampleCollectedBy: "tech@lab.test",
    });
    expect(state.allCollected).toBe(true);
    expect(state.legacySingleCollection).toBe(true);
    expect(state.byType.every((row) => row.source === "legacy")).toBe(true);
    expect(state.latestCollectedAt).toBe("2026-08-21T08:00:00.000Z");
  });
});

describe("awaitingSampleLabel", () => {
  it("names the missing specimen", () => {
    expect(awaitingSampleLabel(["urine"])).toBe("Awaiting urine");
    expect(awaitingSampleLabel(["blood", "urine"])).toBe("Awaiting blood and urine");
  });
});

describe("collectionTurnaroundStart", () => {
  it("is the latest collection, or null if any specimen is missing", () => {
    expect(
      collectionTurnaroundStart({
        tests: [
          { code: "FBC", specimenType: "blood" },
          { code: "UA", specimenType: "urine" },
        ],
        sampleCollections: {
          blood: { collectedAt: "2026-08-21T08:00:00.000Z", collectedBy: null, collectedBySource: null },
          urine: { collectedAt: "2026-08-21T10:00:00.000Z", collectedBy: null, collectedBySource: null },
        },
      }).collectedAt
    ).toBe("2026-08-21T10:00:00.000Z");
  });
});

describe("getPatientCollectionCheckboxState", () => {
  it("disables the checkbox for a multi-specimen order with an explanation", () => {
    const state = getPatientCollectionCheckboxState([
      order({
        id: "o1",
        tests: [
          { code: "FBC", specimenType: "blood" },
          { code: "UA", specimenType: "urine" },
        ],
      }),
    ]);
    expect(state.canToggle).toBe(false);
    expect(state.hasMultiSpecimenCurrent).toBe(true);
    expect(state.multiSpecimenExplanation).toBe(MULTI_SPECIMEN_CHECKBOX_EXPLANATION);
  });

  it("still allows the checkbox on a single-specimen uncollected order", () => {
    const state = getPatientCollectionCheckboxState([
      order({
        id: "o1",
        tests: [{ code: "FBC", specimenType: "blood" }],
      }),
    ]);
    expect(state.canToggle).toBe(true);
    expect(state.uncollectedOrders).toHaveLength(1);
  });

  it("treats amended orders as closed, same as approved", () => {
    const state = getPatientCollectionCheckboxState([
      order({
        id: "o1",
        status: "amended",
        tests: [{ code: "FBC", specimenType: "blood" }],
      }),
    ]);
    expect(state.currentOrders).toHaveLength(0);
    expect(state.canToggle).toBe(false);
  });
});
