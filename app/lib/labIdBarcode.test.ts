/**
 * The label printer and the scanner have to agree.
 *
 * The specimen label draws the Lab ID as Code 128 with JsBarcode. The camera
 * scanner reads it back with ZXing, which is what Safari on iPhone uses since
 * it has no barcode reader of its own. This test encodes a Lab ID exactly as
 * the label does, renders it as a picture, and decodes that picture with the
 * reader the browser ships, so the two cannot drift apart unnoticed.
 */

import { describe, it, expect } from "vitest";
import CODE128AUTO from "jsbarcode/bin/barcodes/CODE128/CODE128_AUTO.js";
import {
  BinaryBitmap,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  BarcodeFormat,
  RGBLuminanceSource,
} from "@zxing/library";
import { extractLabId } from "./labIdScan";

const MODULE_WIDTH = 3;
const QUIET_MODULES = 12;
const HEIGHT = 40;

/** The bar pattern JsBarcode would print for this value. */
function barPattern(value: string): string {
  return new CODE128AUTO(value, {}).encode().data;
}

/** That pattern as a greyscale picture: bars dark, spaces light. */
function renderLuminance(pattern: string) {
  const width = (pattern.length + QUIET_MODULES * 2) * MODULE_WIDTH;
  const luminances = new Uint8ClampedArray(width * HEIGHT).fill(255);
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] !== "1") continue;
    const x0 = (QUIET_MODULES + i) * MODULE_WIDTH;
    for (let x = x0; x < x0 + MODULE_WIDTH; x++) {
      for (let y = 0; y < HEIGHT; y++) luminances[y * width + x] = 0;
    }
  }
  return { luminances, width, height: HEIGHT };
}

function readBack(value: string): string {
  const { luminances, width, height } = renderLuminance(barPattern(value));
  const bitmap = new BinaryBitmap(
    new HybridBinarizer(new RGBLuminanceSource(luminances, width, height))
  );
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new MultiFormatReader();
  reader.setHints(hints as never);
  return reader.decode(bitmap).getText();
}

describe("the printed Lab ID barcode reads back", () => {
  it("decodes a Lab ID the label would carry", () => {
    const labId = "LF-20260918-4A7C";
    expect(readBack(labId)).toBe(labId);
  });

  it("decodes Lab IDs across the whole character set", () => {
    for (const labId of ["LF-20260101-0000", "LF-20261231-ZZZZ", "LF-20260704-9J2V"]) {
      expect(readBack(labId)).toBe(labId);
    }
  });

  it("hands the scanner a value it recognises as a Lab ID", () => {
    const labId = "LF-20260918-4A7C";
    expect(extractLabId(readBack(labId))).toBe(labId);
  });
});
