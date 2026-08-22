import { describe, expect, it } from "vitest";
import { TEST_CATALOG, testsForTier } from "./testCatalog";
import {
  normalizeParameter,
  parameterNeedsValueSet,
  qualitativeParam,
  RDT_VALUE_SET,
} from "./resultModel";
import { isParseableNumericRange, parameterFlag } from "./resultFlag";

describe("normalizeParameter", () => {
  it("keeps an explicit resultType", () => {
    expect(normalizeParameter(qualitativeParam("Result", RDT_VALUE_SET, "Negative")).resultType).toBe(
      "qualitative"
    );
  });

  it("infers text for a legacy qualitative string with no unit", () => {
    expect(normalizeParameter({ name: "Result", unit: "—", referenceRange: "Negative" }).resultType).toBe(
      "text"
    );
  });

  it("infers numeric from a unit and parseable range", () => {
    expect(
      normalizeParameter({ name: "WBC", unit: "x10^9/L", referenceRange: "4.5-11.0" }).resultType
    ).toBe("numeric");
  });
});

describe("parameterFlag", () => {
  it("flags qualitative abnormal values as A, not H/L", () => {
    const parameter = qualitativeParam("Result", RDT_VALUE_SET, "Negative");
    expect(parameterFlag("Positive", parameter)).toBe("A");
    expect(parameterFlag("Negative", parameter)).toBeNull();
    expect(parameterFlag("Invalid", parameter)).toBeNull();
  });

  it("never flags text", () => {
    expect(
      parameterFlag("trophozoites seen", { name: "Description", unit: "—", referenceRange: "", resultType: "text" })
    ).toBeNull();
  });

  it("raises C for a numeric critical limit", () => {
    expect(
      parameterFlag("2.1", {
        name: "Glucose",
        unit: "mmol/L",
        referenceRange: "3.9-5.6",
        resultType: "numeric",
        criticalLow: 2.5,
      })
    ).toBe("C");
  });
});

describe("national tier catalogue", () => {
  it("includes sickle cell on the primary menu and marks Widal as off-menu", () => {
    const sickle = TEST_CATALOG.find((t) => t.code === "SICKLE");
    const widal = TEST_CATALOG.find((t) => t.code === "WIDAL");
    expect(sickle?.onNationalMenu).toBe(true);
    expect(sickle?.tiers).toContain("primary");
    expect(widal?.onNationalMenu).toBe(false);
    expect(testsForTier("primary").some((t) => t.code === "SICKLE")).toBe(true);
    expect(testsForTier("primary").some((t) => t.code === "FBC")).toBe(false);
    expect(testsForTier("secondary").some((t) => t.code === "FBC")).toBe(true);
  });

  it("gives every qualitative parameter a value set including Invalid or Not done where required", () => {
    for (const test of TEST_CATALOG) {
      for (const parameter of test.parameters) {
        const normalized = normalizeParameter(parameter);
        if (normalized.resultType === "qualitative") {
          expect(parameterNeedsValueSet(normalized)).toBe(true);
          expect(normalized.valueSet && normalized.valueSet.length).toBeGreaterThan(1);
        }
        if (normalized.resultType === "numeric" && parameter.name !== "Parasite density") {
          expect(isParseableNumericRange(normalized.referenceRange)).toBe(true);
        }
      }
    }
  });
});
