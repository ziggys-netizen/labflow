import { describe, expect, it } from "vitest";
import {
  CLINICAL_FLAG_LETTERS,
  CLINICAL_FLAG_TITLES,
  clinicalFlagLetterClass,
  isClinicalFlagLetter,
} from "./clinicalFlag";
import { OPERATIONAL_CHIP_WORDS, OPERATIONAL_STATES, isOperationalState } from "./operationalFlag";

describe("clinicalFlag presentation", () => {
  it("styles H and L as warn and C as crit with a soft background", () => {
    expect(clinicalFlagLetterClass("H")).toContain("lf-clinical-letter");
    expect(clinicalFlagLetterClass("H")).toContain("text-lf-warn");
    expect(clinicalFlagLetterClass("L")).toContain("text-lf-warn");
    expect(clinicalFlagLetterClass("A")).toContain("text-lf-warn");
    expect(clinicalFlagLetterClass("C")).toContain("text-lf-crit");
    expect(clinicalFlagLetterClass("C")).toContain("bg-lf-crit-soft");
  });

  it("never uses a stripe or operational chip on a clinical letter", () => {
    for (const letter of CLINICAL_FLAG_LETTERS) {
      const cls = clinicalFlagLetterClass(letter);
      expect(cls).not.toContain("lf-op-stripe");
      expect(cls).not.toContain("lf-op-chip");
      expect(cls).not.toContain("border-l");
    }
  });

  it("keeps clinical letters disjoint from operational chip words and states", () => {
    for (const letter of CLINICAL_FLAG_LETTERS) {
      expect(OPERATIONAL_CHIP_WORDS).not.toContain(letter);
      expect(isOperationalState(letter)).toBe(false);
      expect(isClinicalFlagLetter(letter)).toBe(true);
    }
    for (const state of OPERATIONAL_STATES) {
      expect(isClinicalFlagLetter(state)).toBe(false);
    }
    expect(CLINICAL_FLAG_TITLES.C).toBe("Critical");
  });
});
