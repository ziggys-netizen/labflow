/**
 * The whole chain, in one test: what the printer draws is what the scanner
 * reads, and what the scanner reads takes the right person to the right place.
 *
 * printed barcode -> decoded text -> Lab ID -> the patient's order -> entry
 *
 * The specimen label and the receipt both print the Lab ID as Code 128 through
 * JsBarcode, so one encoding covers both pieces of paper.
 */

import { describe, it, expect } from "vitest";
import CODE128AUTO from "jsbarcode/bin/barcodes/CODE128/CODE128_AUTO.js";
import {
  BinaryBitmap,
  BarcodeFormat,
  DecodeHintType,
  HybridBinarizer,
  MultiFormatReader,
  RGBLuminanceSource,
} from "@zxing/library";
import { buildScanPatients, resolveLabIdScan, scanDestination } from "./labIdScan";
import { printableSpecimenLabel } from "./specimenLabel";

const MODULE_WIDTH = 3;
const QUIET_MODULES = 12;
const HEIGHT = 40;

/** Print the value, then read it back the way a phone camera would. */
function throughTheScanner(value: string): string {
  const pattern = new CODE128AUTO(value, {}).encode().data;
  const width = (pattern.length + QUIET_MODULES * 2) * MODULE_WIDTH;
  const luminances = new Uint8ClampedArray(width * HEIGHT).fill(255);
  for (let i = 0; i < pattern.length; i++) {
    if (pattern[i] !== "1") continue;
    const x0 = (QUIET_MODULES + i) * MODULE_WIDTH;
    for (let x = x0; x < x0 + MODULE_WIDTH; x++) {
      for (let y = 0; y < HEIGHT; y++) luminances[y * width + x] = 0;
    }
  }
  const hints = new Map<DecodeHintType, unknown>();
  hints.set(DecodeHintType.POSSIBLE_FORMATS, [BarcodeFormat.CODE_128]);
  hints.set(DecodeHintType.TRY_HARDER, true);
  const reader = new MultiFormatReader();
  reader.setHints(hints as never);
  const bitmap = new BinaryBitmap(
    new HybridBinarizer(new RGBLuminanceSource(luminances, width, HEIGHT))
  );
  return reader.decode(bitmap).getText();
}

const LAB_ID = "LF-20260918-4A7C";

const patients = [{ id: "p1", labId: LAB_ID }];
const orders = [
  {
    id: "o5",
    status: "pending",
    tests: [{ code: "FBC", specimenType: "blood" }],
    sampleCollectedAt: "2026-09-18T09:00:00.000Z",
    sampleCollectedSource: null,
    patientId: "p1",
    patientLabId: LAB_ID,
  },
];

describe("a scanned specimen label reaches result entry", () => {
  it("prints the Lab ID the label was asked to carry", () => {
    const label = printableSpecimenLabel({
      labId: LAB_ID,
      sexAge: "F · 34y",
      clinicName: "Medic Aid",
      printedAt: new Date("2026-09-18T09:12:00.000Z"),
    });
    expect(label.ok).toBe(true);
    if (!label.ok) throw new Error(label.error);
    expect(label.label.barcodeValue).toBe(LAB_ID);
  });

  it("carries the Lab ID through the barcode and into result entry", () => {
    const scanned = throughTheScanner(LAB_ID);
    expect(scanned).toBe(LAB_ID);

    const outcome = resolveLabIdScan(scanned, buildScanPatients(patients, orders));
    expect(outcome).toMatchObject({ kind: "order", orderId: "o5", note: "" });
    expect(scanDestination(outcome, "results")).toBe("/orders/o5?enter=1");
  });

  it("carries the same receipt barcode to the cashier's receipts, not to entry", () => {
    const outcome = resolveLabIdScan(throughTheScanner(LAB_ID), buildScanPatients(patients, orders));
    const dest = scanDestination(outcome, "receipts");
    expect(dest).toBe("/patients/p1/receipts");
    expect(dest).not.toContain("enter=1");
  });

  it("is not fooled by a barcode carrying something else", () => {
    const scanned = throughTheScanner("ACME-REAGENT-42");
    expect(scanned).toBe("ACME-REAGENT-42");
    const outcome = resolveLabIdScan(scanned, buildScanPatients(patients, orders));
    expect(outcome.kind).toBe("not_a_lab_id");
    expect(scanDestination(outcome, "results")).toBeNull();
    expect(scanDestination(outcome, "receipts")).toBeNull();
  });

  it("does not open a stranger's order when the Lab ID is not this clinic's", () => {
    const outcome = resolveLabIdScan(
      throughTheScanner("LF-20260918-9K2B"),
      buildScanPatients(patients, orders)
    );
    expect(outcome.kind).toBe("unknown");
    expect(scanDestination(outcome, "results")).toBeNull();
  });
});
