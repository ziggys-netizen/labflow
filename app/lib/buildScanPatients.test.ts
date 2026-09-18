import { describe, it, expect } from "vitest";
import { buildScanPatients, resolveLabIdScan, scanDestination } from "./labIdScan";
import type { ScanOrderInput } from "./labIdScan";

const LAB = "LF-20260918-4A7C";
const OTHER = "LF-20260918-9K2B";

function order(over: Partial<ScanOrderInput> = {}): ScanOrderInput {
  return {
    id: "o1",
    status: "pending",
    tests: [{ code: "FBC", specimenType: "blood" }],
    sampleCollectedAt: null,
    sampleCollectedSource: null,
    ...over,
  } as ScanOrderInput;
}

describe("buildScanPatients", () => {
  it("keeps a patient who has no orders, so a scan can say what is missing", () => {
    const list = buildScanPatients([{ id: "p1", labId: LAB }], []);
    expect(list).toEqual([{ patientId: "p1", labId: LAB, orders: [] }]);
    expect(resolveLabIdScan(LAB, list).kind).toBe("patient_only");
  });

  it("puts an order on the patient whose Lab ID it carries", () => {
    const list = buildScanPatients(
      [{ id: "p1", labId: LAB }, { id: "p2", labId: OTHER }],
      [order({ id: "o9", patientId: "p1", patientLabId: LAB })]
    );
    const mine = list.find((p) => p.labId === LAB);
    expect(mine?.orders.map((o) => o.orderId)).toEqual(["o9"]);
    expect(list.find((p) => p.labId === OTHER)?.orders).toEqual([]);
  });

  it("falls back to the patient record when the order carries no Lab ID", () => {
    const list = buildScanPatients(
      [{ id: "p1", labId: LAB }],
      [order({ id: "o9", patientId: "p1", patientLabId: null })]
    );
    expect(list[0]?.orders.map((o) => o.orderId)).toEqual(["o9"]);
  });

  it("reads collection from the order rather than trusting the status", () => {
    const uncollected = buildScanPatients(
      [{ id: "p1", labId: LAB }],
      [order({ patientId: "p1" })]
    );
    expect(uncollected[0]?.orders[0]?.collected).toBe(false);

    const collected = buildScanPatients(
      [{ id: "p1", labId: LAB }],
      [order({ patientId: "p1", sampleCollectedAt: "2026-09-18T09:00:00.000Z" })]
    );
    expect(collected[0]?.orders[0]?.collected).toBe(true);
  });

  it("labels an order by its test codes, for when a choice has to be made", () => {
    const list = buildScanPatients(
      [{ id: "p1", labId: LAB }],
      [
        order({
          patientId: "p1",
          tests: [
            { code: "FBC", specimenType: "blood" },
            { code: "UA", specimenType: "urine" },
          ],
        }),
      ]
    );
    expect(list[0]?.orders[0]?.label).toBe("FBC, UA");
  });

  it("ignores a patient with no Lab ID, which cannot be scanned anyway", () => {
    expect(buildScanPatients([{ id: "p1", labId: "" }], [])).toEqual([]);
    expect(buildScanPatients([{ id: "p1", labId: null }], [])).toEqual([]);
  });

  it("carries a real scan through to result entry end to end", () => {
    const list = buildScanPatients(
      [{ id: "p1", labId: LAB }],
      [
        order({
          id: "o5",
          patientId: "p1",
          patientLabId: LAB,
          status: "pending",
          sampleCollectedAt: "2026-09-18T09:00:00.000Z",
        }),
      ]
    );
    const outcome = resolveLabIdScan(`${LAB}\r\n`, list);
    expect(scanDestination(outcome, "results")).toBe("/orders/o5?enter=1");
    expect(scanDestination(outcome, "receipts")).toBe("/patients/p1/receipts");
  });
});
