import { describe, expect, it } from "vitest";
import { TEST_CATALOG } from "./testCatalog";
import { normalizeParameter } from "./resultModel";
import {
  HL_SUPPRESSION,
  isAdultForReferenceRange,
  isParseableNumericRange,
  orderHasAbnormalResults,
  orderHasCriticalResults,
  parameterFlag,
  parameterHlSuppressionReason,
  resultFlag,
  type ResultFlagContext,
} from "./resultFlag";

const NOW = new Date(2026, 8, 3);
const ADULT: ResultFlagContext = { sex: "Male", dob: "1990-06-15", now: NOW };
const ADULT_F: ResultFlagContext = { sex: "Female", dob: "1990-06-15", now: NOW };
const CHILD: ResultFlagContext = { sex: "Male", dob: "2015-06-15", now: NOW };
const EST_ADULT: ResultFlagContext = { sex: "Male", ageYears: 45, now: NOW };
const EST_CHILD: ResultFlagContext = { sex: "Male", ageYears: 8, now: NOW };
const WBC = {
  name: "WBC",
  unit: "10^9/L",
  referenceRange: "4.5-11.0",
  resultType: "numeric" as const,
};

describe("isAdultForReferenceRange", () => {
  it("is adult on and after the 18th birthday", () => {
    expect(isAdultForReferenceRange("2008-09-03", NOW)).toBe(true);
    expect(isAdultForReferenceRange("2008-09-02", NOW)).toBe(true);
    expect(isAdultForReferenceRange("2008-09-04", NOW)).toBe(false);
  });

  it("returns null when DOB is missing or unparseable and ageYears is absent", () => {
    expect(isAdultForReferenceRange(null, NOW)).toBeNull();
    expect(isAdultForReferenceRange("", NOW)).toBeNull();
    expect(isAdultForReferenceRange("not-a-date", NOW)).toBeNull();
    expect(isAdultForReferenceRange("2010-13-01", NOW)).toBeNull();
    expect(isAdultForReferenceRange("2010-02-31", NOW)).toBeNull();
  });

  it("treats estimated ageYears >= 18 as adult when DOB is absent or unparseable", () => {
    expect(isAdultForReferenceRange(null, NOW, 45)).toBe(true);
    expect(isAdultForReferenceRange(null, NOW, 18)).toBe(true);
    expect(isAdultForReferenceRange("unknown", NOW, 45)).toBe(true);
    expect(isAdultForReferenceRange(null, NOW, 8)).toBe(false);
    expect(isAdultForReferenceRange(null, NOW, 17)).toBe(false);
  });

  it("lets a parseable DOB take precedence over ageYears", () => {
    expect(isAdultForReferenceRange("2015-06-15", NOW, 45)).toBe(false);
    expect(isAdultForReferenceRange("1990-06-15", NOW, 8)).toBe(true);
  });

  it("reads a YYYY-MM-DD prefix from an ISO timestamp", () => {
    expect(isAdultForReferenceRange("1990-06-15T00:00:00.000Z", NOW)).toBe(true);
  });
});

describe("resultFlag", () => {
  it("returns null for missing values", () => {
    expect(resultFlag(null, "4.5-11.0", ADULT)).toBeNull();
    expect(resultFlag(undefined, "4.5-11.0", ADULT)).toBeNull();
    expect(resultFlag("", "4.5-11.0", ADULT)).toBeNull();
  });

  it("returns null for non-numeric results", () => {
    expect(resultFlag("Negative", "Negative", ADULT)).toBeNull();
    expect(resultFlag("reactive", "4.5-11.0", ADULT)).toBeNull();
    expect(resultFlag("1:80", "< 1:80", ADULT)).toBeNull();
  });

  it("returns null when the range is missing or not numeric", () => {
    expect(resultFlag("12", null, ADULT)).toBeNull();
    expect(resultFlag("12", "", ADULT)).toBeNull();
    expect(resultFlag("12", "Negative", ADULT)).toBeNull();
    expect(resultFlag("12", "N/A", ADULT)).toBeNull();
  });

  it("flags high and low against a hyphen range for an adult with known sex", () => {
    expect(resultFlag("11.1", "4.5-11.0", ADULT)).toBe("H");
    expect(resultFlag("4.4", "4.5-11.0", ADULT)).toBe("L");
    expect(resultFlag("4.5", "4.5-11.0", ADULT)).toBeNull();
    expect(resultFlag("11.0", "4.5-11.0", ADULT)).toBeNull();
    expect(resultFlag(7, "4.5-11.0", ADULT)).toBeNull();
  });

  it("flags an adult M/F patient against a single range with no sex split", () => {
    expect(resultFlag("11.5", "12-16", ADULT_F)).toBe("L");
    expect(resultFlag("16.1", "12-16", { sex: "M", dob: ADULT.dob, now: NOW })).toBe("H");
    expect(resultFlag("11.1", "4.5-11.0", { sex: "Male", dob: "2008-09-03", now: NOW })).toBe("H");
  });

  it("flags against less-than and greater-than ranges", () => {
    expect(resultFlag("5.0", "< 5.0 (desirable)", ADULT)).toBe("H");
    expect(resultFlag("4.9", "< 5.0 (desirable)", ADULT)).toBeNull();
    expect(resultFlag("1.0", "> 1.0", ADULT)).toBe("L");
    expect(resultFlag("1.1", "> 1.0", ADULT)).toBeNull();
  });

  it("uses sex-specific bounds when present", () => {
    expect(resultFlag("12.5", "M: 13-18, F: 12-16", { ...ADULT, sex: "M" })).toBe("L");
    expect(resultFlag("12.5", "M: 13-18, F: 12-16", ADULT_F)).toBeNull();
    expect(resultFlag("17", "M: 13-18, F: 12-16", { ...ADULT, sex: "female" })).toBe("H");
    expect(resultFlag("12.5", "M: 13-18, F: 12-16", { dob: ADULT.dob, now: NOW })).toBeNull();
  });

  it("does not H/L flag a paediatric patient", () => {
    expect(resultFlag("11.1", "4.5-11.0", CHILD)).toBeNull();
    expect(resultFlag("12.5", "M: 13-18, F: 12-16", CHILD)).toBeNull();
  });

  it("does not H/L flag when neither DOB nor ageYears is recorded", () => {
    expect(resultFlag("11.1", "4.5-11.0", { sex: "Male", now: NOW })).toBeNull();
    expect(resultFlag("11.1", "4.5-11.0", { sex: "Male", dob: "unknown", now: NOW })).toBeNull();
  });

  it("flags an adult identified only by estimated ageYears", () => {
    expect(resultFlag("11.1", "4.5-11.0", EST_ADULT)).toBe("H");
    expect(resultFlag("4.4", "4.5-11.0", EST_ADULT)).toBe("L");
  });

  it("does not H/L flag a paediatric estimated age", () => {
    expect(resultFlag("11.1", "4.5-11.0", EST_CHILD)).toBeNull();
  });

  it("uses a parseable paediatric DOB even when ageYears says adult", () => {
    expect(resultFlag("11.1", "4.5-11.0", { sex: "Male", dob: CHILD.dob, ageYears: 45, now: NOW })).toBeNull();
  });

  it("uses ageYears when DOB is unparseable", () => {
    expect(resultFlag("11.1", "4.5-11.0", { sex: "Male", dob: "unknown", ageYears: 45, now: NOW })).toBe(
      "H"
    );
  });

  it("flags sex Other against an unsplit range but not a sex-split range", () => {
    expect(resultFlag("11.5", "12-16", { sex: "Other", dob: ADULT.dob, now: NOW })).toBe("L");
    expect(resultFlag("11.5", "12-16", { dob: ADULT.dob, now: NOW })).toBe("L");
    expect(resultFlag("12.5", "M: 13-18, F: 12-16", { sex: "Other", dob: ADULT.dob, now: NOW })).toBeNull();
  });

  it("does not treat titre ranges as numeric bounds", () => {
    expect(resultFlag("80", "< 1:80", ADULT)).toBeNull();
    expect(isParseableNumericRange("< 1:80")).toBe(false);
  });
});

describe("hl suppression reasons", () => {
  const hb = {
    name: "Hb",
    unit: "g/dL",
    referenceRange: "M: 13-18, F: 12-16",
    resultType: "numeric" as const,
  };

  it("explains paediatric and missing age", () => {
    expect(parameterHlSuppressionReason("12.5", hb, CHILD)).toBe(HL_SUPPRESSION.paediatric);
    expect(parameterHlSuppressionReason("11.1", WBC, EST_CHILD)).toBe(HL_SUPPRESSION.paediatric);
    expect(parameterHlSuppressionReason("12.5", hb, { sex: "Male", dob: CHILD.dob, ageYears: 45, now: NOW })).toBe(
      HL_SUPPRESSION.paediatric
    );
    expect(parameterHlSuppressionReason("12.5", hb, { sex: "Male", now: NOW })).toBe(
      HL_SUPPRESSION.ageNotRecorded
    );
    expect(parameterHlSuppressionReason("12.5", hb, { sex: "Male", dob: "bogus", now: NOW })).toBe(
      HL_SUPPRESSION.ageNotRecorded
    );
    expect(parameterHlSuppressionReason("11.1", WBC, EST_ADULT)).toBeNull();
  });

  it("requires M/F only for a sex-split interval", () => {
    expect(parameterHlSuppressionReason("12.5", hb, { sex: "Other", dob: ADULT.dob, now: NOW })).toBe(
      HL_SUPPRESSION.sexNotMf
    );
    expect(parameterHlSuppressionReason("12.5", hb, { dob: ADULT.dob, now: NOW })).toBe(
      HL_SUPPRESSION.sexNotMf
    );
    expect(
      parameterHlSuppressionReason("11.5", { ...hb, referenceRange: "12-16" }, { sex: "Other", dob: ADULT.dob, now: NOW })
    ).toBeNull();
    expect(
      parameterHlSuppressionReason("11.5", { ...hb, referenceRange: "12-16" }, { dob: ADULT.dob, now: NOW })
    ).toBeNull();
  });

  it("is silent when the adult interval applies", () => {
    expect(parameterHlSuppressionReason("12.5", hb, ADULT_F)).toBeNull();
    expect(parameterHlSuppressionReason("11.1", { ...hb, referenceRange: "4.5-11.0" }, ADULT)).toBeNull();
  });

  it("explains a sex-split range with no interval for that sex", () => {
    expect(
      parameterHlSuppressionReason("12.5", { ...hb, referenceRange: "M: 13-18" }, ADULT_F)
    ).toBe(HL_SUPPRESSION.noIntervalForSex);
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

  it("requires a parseable range on every numeric seed parameter except optional density", () => {
    const missing = TEST_CATALOG.flatMap((test) => test.parameters).filter((parameter) => {
      const normalized = normalizeParameter(parameter);
      return normalized.resultType === "numeric" && !isParseableNumericRange(normalized.referenceRange);
    });
    expect(missing.map((parameter) => parameter.name)).toEqual(["Parasite density"]);
  });

  it("does not treat a qualitative Positive as a numeric high flag", () => {
    const malaria = TEST_CATALOG.find((test) => test.code === "MAL-RDT");
    const result = malaria?.parameters.find((parameter) => parameter.name === "Result");
    expect(result).toBeTruthy();
    expect(parameterFlag("Positive", result)).toBe("A");
    expect(resultFlag("Positive", "Negative", ADULT)).toBeNull();
  });
});

describe("parameterFlag critical vs H/L age gate", () => {
  const hb = {
    name: "Hb",
    unit: "g/dL",
    referenceRange: "12-16",
    resultType: "numeric" as const,
    criticalLow: 5,
  };

  it("still raises C for a paediatric or missing-DOB critical value", () => {
    expect(parameterFlag("4", hb, CHILD)).toBe("C");
    expect(parameterFlag("4", hb, { sex: "Male", now: NOW })).toBe("C");
    expect(orderHasCriticalResults([{ code: "FBC" }], { FBC: { Hb: "4" } }, [{ code: "FBC", parameters: [hb] }], CHILD)).toBe(
      true
    );
  });

  it("does not raise H/L for the same child when the value is outside the adult interval but not critical", () => {
    expect(parameterFlag("10", hb, CHILD)).toBeNull();
    expect(parameterHlSuppressionReason("10", hb, CHILD)).toBe(HL_SUPPRESSION.paediatric);
  });
});

describe("orderHasAbnormalResults", () => {
  const catalog = [
    {
      code: "FBC",
      parameters: [{ name: "WBC", unit: "10^9/L", referenceRange: "4.5-11.0", resultType: "numeric" as const }],
    },
    {
      code: "HIV",
      parameters: [{ name: "Screening result", unit: "—", referenceRange: "Non-reactive", resultType: "text" as const }],
    },
  ];

  it("is true when any numeric result is outside range for an adult", () => {
    expect(
      orderHasAbnormalResults([{ code: "FBC" }], { FBC: { WBC: "12.0" } }, catalog, ADULT)
    ).toBe(true);
    expect(
      orderHasAbnormalResults([{ code: "FBC" }], { FBC: { WBC: "7.0" } }, catalog, ADULT)
    ).toBe(false);
  });

  it("does not treat paediatric or missing-DOB H/L as abnormal", () => {
    expect(
      orderHasAbnormalResults([{ code: "FBC" }], { FBC: { WBC: "12.0" } }, catalog, CHILD)
    ).toBe(false);
    expect(
      orderHasAbnormalResults([{ code: "FBC" }], { FBC: { WBC: "12.0" } }, catalog)
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
