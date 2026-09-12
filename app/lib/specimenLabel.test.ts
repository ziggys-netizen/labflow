import { describe, expect, it } from "vitest";
import {
  DEFAULT_LABEL_HEIGHT_MM,
  DEFAULT_LABEL_WIDTH_MM,
  LABEL_LAB_ID_NOT_ENCODABLE,
  LABEL_NO_LAB_ID,
  MAX_LABEL_MM,
  MIN_LABEL_MM,
  clampLabelMm,
  labIdIsEncodable,
  formatLabelTimestamp,
  labelPageCss,
  labelSizeWriteFields,
  parseLabelSize,
  printableSpecimenLabel,
  specimenLabelHref,
} from "./specimenLabel";

describe("clampLabelMm", () => {
  it("falls back on anything that is not a finite number", () => {
    expect(clampLabelMm(undefined, 50)).toBe(50);
    expect(clampLabelMm(null, 50)).toBe(50);
    expect(clampLabelMm("", 50)).toBe(50);
    expect(clampLabelMm("abc", 50)).toBe(50);
    expect(clampLabelMm(Number.NaN, 50)).toBe(50);
    // Infinity is not a size, so it falls back rather than being clamped into
    // a plausible-looking MAX. Firestore cannot store it anyway.
    expect(clampLabelMm(Infinity, 50)).toBe(50);
  });

  it("bounds to a size a label printer can feed", () => {
    expect(clampLabelMm(2, 50)).toBe(MIN_LABEL_MM);
    expect(clampLabelMm(9999, 50)).toBe(MAX_LABEL_MM);
    expect(clampLabelMm(-30, 50)).toBe(MIN_LABEL_MM);
  });

  it("accepts numeric strings and rounds to half-millimetre stock", () => {
    expect(clampLabelMm("38", 50)).toBe(38);
    expect(clampLabelMm(25.44, 50)).toBe(25.4);
  });
});

describe("parseLabelSize", () => {
  it("defaults when the clinic has never set a size", () => {
    expect(parseLabelSize(undefined)).toEqual({
      widthMm: DEFAULT_LABEL_WIDTH_MM,
      heightMm: DEFAULT_LABEL_HEIGHT_MM,
    });
    expect(parseLabelSize({})).toEqual({
      widthMm: DEFAULT_LABEL_WIDTH_MM,
      heightMm: DEFAULT_LABEL_HEIGHT_MM,
    });
  });

  it("reads a stored size", () => {
    expect(parseLabelSize({ labelWidthMm: 57, labelHeightMm: 32 })).toEqual({
      widthMm: 57,
      heightMm: 32,
    });
  });

  it("does not let a bad stored value produce an unprintable page", () => {
    expect(parseLabelSize({ labelWidthMm: 0, labelHeightMm: 9999 })).toEqual({
      widthMm: MIN_LABEL_MM,
      heightMm: MAX_LABEL_MM,
    });
  });
});

describe("labelSizeWriteFields", () => {
  it("writes only the two size fields, clamped", () => {
    expect(labelSizeWriteFields({ widthMm: 9999, heightMm: 1 })).toEqual({
      labelWidthMm: MAX_LABEL_MM,
      labelHeightMm: MIN_LABEL_MM,
    });
    expect(Object.keys(labelSizeWriteFields({ widthMm: 50, heightMm: 25 }))).toEqual([
      "labelWidthMm",
      "labelHeightMm",
    ]);
  });
});

describe("labelPageCss", () => {
  it("sets @page to the real label size with no margin", () => {
    const css = labelPageCss({ widthMm: 57, heightMm: 32 });
    expect(css).toContain("@page { size: 57mm 32mm; margin: 0; }");
  });

  it("carries the size onto the sheet itself for both screen and print", () => {
    const css = labelPageCss({ widthMm: 38, heightMm: 25 });
    expect(css).toContain("width: 38mm");
    expect(css).toContain("height: 25mm");
  });
});

describe("printableSpecimenLabel", () => {
  it("refuses to print a label with no Lab ID", () => {
    expect(printableSpecimenLabel({ labId: "", sexAge: "F · 31y", clinicName: "MedicAid" })).toEqual(
      { ok: false, error: LABEL_NO_LAB_ID }
    );
    expect(
      printableSpecimenLabel({ labId: "   ", sexAge: "F · 31y", clinicName: "MedicAid" })
    ).toEqual({ ok: false, error: LABEL_NO_LAB_ID });
    expect(
      printableSpecimenLabel({ labId: null, sexAge: "F · 31y", clinicName: "MedicAid" })
    ).toEqual({ ok: false, error: LABEL_NO_LAB_ID });
  });

  it("carries the Lab ID through to the barcode exactly as stored", () => {
    const result = printableSpecimenLabel({
      labId: " LF-20260820-8549 ",
      sexAge: "M · 4y",
      clinicName: "MedicAid",
      printedAt: new Date(2026, 8, 12, 9, 5),
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.label.labId).toBe("LF-20260820-8549");
    expect(result.label.barcodeValue).toBe("LF-20260820-8549");
    expect(result.label.printedAt).toBe("2026-09-12 09:05");
  });

  it("refuses a Lab ID a Code 128 barcode cannot carry", () => {
    const result = printableSpecimenLabel({
      labId: "LF-2026 —8549",
      sexAge: "F · 31y",
      clinicName: "MedicAid",
    });
    expect(result).toEqual({ ok: false, error: LABEL_LAB_ID_NOT_ENCODABLE });
  });

  it("accepts the Lab ID format this system issues", () => {
    expect(labIdIsEncodable("LF-20260820-8549")).toBe(true);
  });

  it("never carries a patient name field", () => {
    const result = printableSpecimenLabel({
      labId: "LF-1",
      sexAge: "F · 31y",
      clinicName: "MedicAid",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(Object.keys(result.label).sort()).toEqual([
      "barcodeValue",
      "clinicName",
      "labId",
      "printedAt",
      "sexAge",
    ]);
  });

  it("falls back rather than printing a blank second identifier", () => {
    const result = printableSpecimenLabel({ labId: "LF-1", sexAge: "", clinicName: "" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.label.sexAge).toBe("—");
    expect(result.label.clinicName).toBe("—");
  });
});

describe("formatLabelTimestamp", () => {
  it("pads to a sortable local stamp", () => {
    expect(formatLabelTimestamp(new Date(2026, 0, 3, 7, 4))).toBe("2026-01-03 07:04");
  });

  it("does not print Invalid Date onto a specimen", () => {
    expect(formatLabelTimestamp(new Date("nonsense"))).toBe("—");
  });
});

describe("specimenLabelHref", () => {
  it("lives under the patient", () => {
    expect(specimenLabelHref("abc")).toBe("/patients/abc/label");
  });
});
