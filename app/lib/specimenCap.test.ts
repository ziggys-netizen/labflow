import { describe, expect, it } from "vitest";
import {
  parseSpecimenCap,
  resolveSpecimenCap,
  SEED_SPECIMEN_CAP_BY_CODE,
  SPECIMEN_CAPS,
} from "./specimenCap";
import { TEST_CATALOG } from "./testCatalog";

describe("specimenCap", () => {
  it("parses the six categorical caps and common aliases", () => {
    expect(parseSpecimenCap("lavender")).toBe("lavender");
    expect(parseSpecimenCap("EDTA")).toBe("lavender");
    expect(parseSpecimenCap("citrate")).toBe("blue");
    expect(parseSpecimenCap("SST")).toBe("gold");
    expect(parseSpecimenCap("fluoride oxalate")).toBe("grey");
    expect(parseSpecimenCap("plain")).toBe("red");
    expect(parseSpecimenCap("heparin")).toBe("green");
  });

  it("never treats body-fluid specimenType as a tube cap", () => {
    expect(parseSpecimenCap("blood")).toBeNull();
    expect(parseSpecimenCap("urine")).toBeNull();
    expect(parseSpecimenCap("stool")).toBeNull();
  });

  it("resolves seed caps by code when the stored field is missing", () => {
    expect(resolveSpecimenCap(undefined, "FBC")).toBe("lavender");
    expect(resolveSpecimenCap(undefined, "FBS")).toBe("grey");
    expect(resolveSpecimenCap(undefined, "BGRH")).toBe("red");
    expect(resolveSpecimenCap(undefined, "LFT")).toBe("gold");
  });

  it("prefers an explicit stored cap over the seed", () => {
    expect(resolveSpecimenCap("green", "FBC")).toBe("green");
  });

  it("returns null when neither stored nor seed has a cap (no grey default)", () => {
    expect(resolveSpecimenCap(undefined, "UA")).toBeNull();
    expect(resolveSpecimenCap(undefined, "STOOL")).toBeNull();
    expect(resolveSpecimenCap(undefined, "UNKNOWN")).toBeNull();
    expect(resolveSpecimenCap(undefined, null)).toBeNull();
  });

  it("covers every seed catalogue code either with a D6 cap or an explicit null", () => {
    const missing: string[] = [];
    for (const test of TEST_CATALOG) {
      const cap = test.specimenCap ?? SEED_SPECIMEN_CAP_BY_CODE.get(test.code) ?? null;
      if (cap != null && !SPECIMEN_CAPS.includes(cap)) {
        missing.push(`${test.code}: invalid ${cap}`);
      }
    }
    expect(missing).toEqual([]);

    const withCap = TEST_CATALOG.filter(
      (t) => (t.specimenCap ?? SEED_SPECIMEN_CAP_BY_CODE.get(t.code)) != null
    );
    const withoutCap = TEST_CATALOG.filter(
      (t) => (t.specimenCap ?? SEED_SPECIMEN_CAP_BY_CODE.get(t.code)) == null
    );
    // Report surface: D6 asked how many lack a mapping.
    expect(withCap.length).toBe(12);
    expect(withoutCap.map((t) => t.code).sort()).toEqual(
      ["MAL-MICRO", "MAL-RDT", "PREG", "SICKLE", "STOOL", "UA"].sort()
    );
  });
});
