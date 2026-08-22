import { describe, expect, it } from "vitest";
import { TEST_CATALOG } from "./testCatalog";
import { isParseableNumericRange, orderHasAbnormalResults, resultFlag } from "./resultFlag";

describe("resultFlag", () => {
  it("returns null for missing values", () => {
    expect(resultFlag(null, "4.5-11.0")).toBeNull();
    expect(resultFlag(undefined, "4.5-11.0")).toBeNull();
    expect(resultFlag("", "4.5-11.0")).toBeNull();
  });

  it("returns null for non-numeric results", () => {
    expect(resultFlag("Negative", "Negative")).toBeNull();
    expect(resultFlag("reactive", "4.5-11.0")).toBeNull();
    expect(resultFlag("1:80", "< 1:80")).toBeNull();
  });

  it("returns null when the range is missing or not numeric", () => {
    expect(resultFlag("12", null)).toBeNull();
    expect(resultFlag("12", "")).toBeNull();
    expect(resultFlag("12", "Negative")).toBeNull();
    expect(resultFlag("12", "N/A")).toBeNull();
  });

  it("flags high and low against a hyphen range", () => {
    expect(resultFlag("11.1", "4.5-11.0")).toBe("H");
    expect(resultFlag("4.4", "4.5-11.0")).toBe("L");
    expect(resultFlag("4.5", "4.5-11.0")).toBeNull();
    expect(resultFlag("11.0", "4.5-11.0")).toBeNull();
    expect(resultFlag(7, "4.5-11.0")).toBeNull();
  });

  it("flags against less-than and greater-than ranges", () => {
    expect(resultFlag("5.0", "< 5.0 (desirable)")).toBe("H");
    expect(resultFlag("4.9", "< 5.0 (desirable)")).toBeNull();
    expect(resultFlag("1.0", "> 1.0")).toBe("L");
    expect(resultFlag("1.1", "> 1.0")).toBeNull();
  });

  it("uses sex-specific bounds when present", () => {
    expect(resultFlag("12.5", "M: 13-18, F: 12-16", "M")).toBe("L");
    expect(resultFlag("12.5", "M: 13-18, F: 12-16", "F")).toBeNull();
    expect(resultFlag("17", "M: 13-18, F: 12-16", "female")).toBe("H");
    expect(resultFlag("12.5", "M: 13-18, F: 12-16")).toBeNull();
  });

  it("does not treat titre ranges as numeric bounds", () => {
    expect(resultFlag("80", "< 1:80")).toBeNull();
    expect(isParseableNumericRange("< 1:80")).toBe(false);
  });
});

describe("isParseableNumericRange", () => {
  it("accepts hyphen, inequality, and sex-specific numeric ranges", () => {
    expect(isParseableNumericRange("4.5-11.0")).toBe(true);
    expect(isParseableNumericRange("< 5.0 (desirable)")).toBe(true);
    expect(isParseableNumericRange("> 1.0")).toBe(true);
    expect(isParseableNumericRange("M: 13-18, F: 12-16")).toBe(true);
  });

  it("rejects qualitative and missing ranges", () => {
    expect(isParseableNumericRange("Negative")).toBe(false);
    expect(isParseableNumericRange("N/A")).toBe(false);
    expect(isParseableNumericRange("Non-reactive")).toBe(false);
    expect(isParseableNumericRange("A / B / AB / O")).toBe(false);
    expect(isParseableNumericRange("")).toBe(false);
    expect(isParseableNumericRange(null)).toBe(false);
  });

  it("counts seed parameters that lack a parseable numeric range", () => {
    const missing = TEST_CATALOG.flatMap((test) => test.parameters).filter(
      (parameter) => !isParseableNumericRange(parameter.referenceRange)
    );
    expect(missing.length).toBe(27);
  });
});

describe("orderHasAbnormalResults", () => {
  const catalog = [
    {
      code: "FBC",
      parameters: [{ name: "WBC", referenceRange: "4.5-11.0" }],
    },
    {
      code: "HIV",
      parameters: [{ name: "Screening result", referenceRange: "Non-reactive" }],
    },
  ];

  it("is true when any numeric result is outside range", () => {
    expect(
      orderHasAbnormalResults(
        [{ code: "FBC" }],
        { FBC: { WBC: "12.0" } },
        catalog
      )
    ).toBe(true);
    expect(
      orderHasAbnormalResults(
        [{ code: "FBC" }],
        { FBC: { WBC: "7.0" } },
        catalog
      )
    ).toBe(false);
  });

  it("does not guess flags for qualitative results or missing catalogue rows", () => {
    expect(
      orderHasAbnormalResults(
        [{ code: "HIV" }],
        { HIV: { "Screening result": "Reactive" } },
        catalog
      )
    ).toBe(false);
    expect(
      orderHasAbnormalResults([{ code: "UNKNOWN" }], { UNKNOWN: { x: "99" } }, catalog)
    ).toBe(false);
  });
});
