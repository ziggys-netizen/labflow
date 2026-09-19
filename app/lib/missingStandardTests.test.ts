import { describe, it, expect } from "vitest";
import { TEST_CATALOG, missingStandardTests, testsForTier } from "./testCatalog";

const codes = (tests: { code: string }[]) => tests.map((t) => t.code).sort();

describe("missingStandardTests", () => {
  it("names only the standard tests a clinic lacks", () => {
    const have = TEST_CATALOG.map((t) => t.code).filter((c) => c !== "HB" && c !== "SICKLE");
    expect(codes(missingStandardTests(have, null))).toEqual(["HB", "SICKLE"]);
  });

  it("finds nothing to add for a complete catalogue", () => {
    expect(missingStandardTests(TEST_CATALOG.map((t) => t.code), null)).toEqual([]);
  });

  it("matches codes without regard to case or stray spaces", () => {
    const have = TEST_CATALOG.map((t) => ` ${t.code.toLowerCase()} `);
    expect(missingStandardTests(have, null)).toEqual([]);
  });

  it("offers a primary clinic only the tests of its own level", () => {
    const missing = missingStandardTests([], "primary");
    expect(codes(missing)).toEqual(codes(testsForTier("primary")));
    // Secondary-level tests such as the full blood count are not pushed on a village clinic.
    expect(missing.some((t) => t.code === "FBC")).toBe(false);
  });

  it("does not count a clinic's own extra tests as anything", () => {
    const have = [...TEST_CATALOG.map((t) => t.code), "CUSTOM-1", "CRP"];
    expect(missingStandardTests(have, "secondary")).toEqual([]);
  });

  it("compares a clinic with no level against the whole catalogue, as seeding does", () => {
    expect(missingStandardTests([], undefined)).toHaveLength(TEST_CATALOG.length);
  });
});
