import { describe, expect, it } from "vitest";
import {
  generateServiceCode,
  matchesServiceSearch,
  serviceHasPrice,
  serviceIsActive,
  serviceIsReviewed,
} from "./serviceCatalog";

describe("serviceIsActive", () => {
  it("is active unless explicitly false", () => {
    expect(serviceIsActive({})).toBe(true);
    expect(serviceIsActive({ active: true })).toBe(true);
    expect(serviceIsActive({ active: false })).toBe(false);
  });
});

describe("serviceIsReviewed", () => {
  it("treats missing or false as unreviewed, only true as reviewed", () => {
    expect(serviceIsReviewed(undefined)).toBe(false);
    expect(serviceIsReviewed(null)).toBe(false);
    expect(serviceIsReviewed({})).toBe(false);
    expect(serviceIsReviewed({ reviewed: false })).toBe(false);
    expect(serviceIsReviewed({ reviewed: true })).toBe(true);
  });
});

describe("serviceHasPrice", () => {
  it("accepts a non-negative finite number, including zero", () => {
    expect(serviceHasPrice({ price: 100 })).toBe(true);
    expect(serviceHasPrice({ price: 0 })).toBe(true);
    expect(serviceHasPrice({ price: -1 })).toBe(false);
    expect(serviceHasPrice({ price: undefined })).toBe(false);
    expect(serviceHasPrice({ price: Number.NaN })).toBe(false);
    expect(serviceHasPrice({})).toBe(false);
  });
});

describe("matchesServiceSearch", () => {
  it("matches on code or name, case-insensitively", () => {
    const service = { code: "CONSULT", name: "Consultation" };
    expect(matchesServiceSearch(service, "consult")).toBe(true);
    expect(matchesServiceSearch(service, "Consulta")).toBe(true);
    expect(matchesServiceSearch(service, "surgery")).toBe(false);
    expect(matchesServiceSearch(service, "")).toBe(true);
  });
});

describe("generateServiceCode", () => {
  it("derives an uppercase code from the name", () => {
    expect(generateServiceCode("Consultation", [])).toBe("CONSULTATION");
    expect(generateServiceCode("Wound Dressing (minor)", [])).toBe("WOUNDDRESSIN");
  });

  it("falls back when the name has no letters or digits", () => {
    expect(generateServiceCode("***", [])).toBe("SERVICE");
  });

  it("disambiguates a collision", () => {
    expect(generateServiceCode("Consultation", ["CONSULTATION"])).toBe("CONSULTATION2");
    expect(generateServiceCode("Consultation", ["CONSULTATION", "CONSULTATION2"])).toBe(
      "CONSULTATION3"
    );
  });
});
