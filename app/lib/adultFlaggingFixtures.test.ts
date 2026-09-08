import { describe, expect, it } from "vitest";
import {
  ADULT_FLAGGING_PATIENTS,
  adultFixtureHasHlFlags,
  adultFlaggingOrderDocId,
  adultFlaggingPatientDocId,
} from "./adultFlaggingFixtures";
import { resultFlag } from "./resultFlag";
import { TEST_CATALOG } from "./testCatalog";

const FBC = TEST_CATALOG.find((row) => row.code === "FBC")!;
const NOW = new Date("2026-09-08T12:00:00.000Z");

describe("adult flagging fixtures", () => {
  it("defines one adult male and one adult female with real DOBs", () => {
    expect(ADULT_FLAGGING_PATIENTS).toHaveLength(2);
    const male = ADULT_FLAGGING_PATIENTS.find((row) => row.key === "adult-male");
    const female = ADULT_FLAGGING_PATIENTS.find((row) => row.key === "adult-female");
    expect(male?.sex).toBe("M");
    expect(female?.sex).toBe("F");
    expect(male?.dob).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(female?.dob).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("produces at least one H and one L on each released FBC", () => {
    for (const fixture of ADULT_FLAGGING_PATIENTS) {
      expect(adultFixtureHasHlFlags(fixture, NOW)).toBe(true);
      const ctx = { sex: fixture.sex, dob: fixture.dob, now: NOW };
      const flags = FBC.parameters
        .map((param) => resultFlag(fixture.fbcResults[param.name] || "", param.referenceRange, ctx))
        .filter(Boolean);
      expect(flags).toContain("H");
      expect(flags).toContain("L");
    }
  });

  it("uses stable per-clinic document ids", () => {
    expect(adultFlaggingPatientDocId("clinicA", "adult-male")).toBe("clinicA_fixture_adult-male");
    expect(adultFlaggingOrderDocId("clinicA", "adult-female")).toBe(
      "clinicA_fixture_adult-female_fbc"
    );
  });
});
