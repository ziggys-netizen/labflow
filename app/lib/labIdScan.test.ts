import { describe, it, expect } from "vitest";
import {
  extractLabId,
  resolveLabIdScan,
  scanDestination,
  scanOutcomeMessage,
  type ScanPatient,
} from "./labIdScan";

const LAB = "LF-20260918-4A7C";

function patient(over: Partial<ScanPatient> = {}): ScanPatient {
  return { patientId: "p1", labId: LAB, orders: [], ...over };
}

describe("extractLabId", () => {
  it("takes the Lab ID a handheld scanner types, including its trailing return", () => {
    expect(extractLabId(`${LAB}\r\n`)).toBe(LAB);
    expect(extractLabId(`  ${LAB}  `)).toBe(LAB);
  });

  it("upper-cases, because a scanner may not", () => {
    expect(extractLabId("lf-20260918-4a7c")).toBe(LAB);
  });

  it("finds the Lab ID inside a longer string", () => {
    expect(extractLabId(`https://www.labflowgambia.com/patients/${LAB}`)).toBe(LAB);
    expect(extractLabId(`*${LAB}*`)).toBe(LAB);
  });

  it("returns null rather than guessing at anything that is not a Lab ID", () => {
    expect(extractLabId("")).toBeNull();
    expect(extractLabId(null)).toBeNull();
    expect(extractLabId("7267765")).toBeNull();
    expect(extractLabId("LF-2026-4A7C")).toBeNull();
    // I, O and U are left out of the Lab ID alphabet so they cannot be misread.
    expect(extractLabId("LF-20260918-4I7C")).toBeNull();
  });
});

describe("resolveLabIdScan", () => {
  it("asks for a scan when nothing has been scanned", () => {
    expect(resolveLabIdScan("", [])).toEqual({ kind: "empty" });
    expect(resolveLabIdScan("   ", [])).toEqual({ kind: "empty" });
  });

  it("says what it read when the barcode is not a Lab ID", () => {
    const outcome = resolveLabIdScan("ACME-REAGENT-42", []);
    expect(outcome).toEqual({ kind: "not_a_lab_id", text: "ACME-REAGENT-42" });
    expect(scanOutcomeMessage(outcome)).toContain("ACME-REAGENT-42");
  });

  it("names the Lab ID when no patient here carries it", () => {
    const outcome = resolveLabIdScan(LAB, [patient({ labId: "LF-20260918-9K2B" })]);
    expect(outcome).toEqual({ kind: "unknown", labId: LAB });
    expect(scanOutcomeMessage(outcome)).toContain(LAB);
  });

  it("opens the one order that is collected and waiting for results", () => {
    const outcome = resolveLabIdScan(LAB, [
      patient({
        orders: [
          { orderId: "o1", status: "approved", collected: true },
          { orderId: "o2", status: "pending", collected: true },
        ],
      }),
    ]);
    expect(outcome).toMatchObject({ kind: "order", orderId: "o2", note: "" });
  });

  it("treats a returned order as waiting for results", () => {
    const outcome = resolveLabIdScan(LAB, [
      patient({ orders: [{ orderId: "o9", status: "needs_correction", collected: true }] }),
    ]);
    expect(outcome).toMatchObject({ kind: "order", orderId: "o9", note: "" });
  });

  it("asks which order when more than one is waiting", () => {
    const outcome = resolveLabIdScan(LAB, [
      patient({
        orders: [
          { orderId: "o1", status: "pending", collected: true, label: "FBC" },
          { orderId: "o2", status: "pending", collected: true, label: "UA" },
        ],
      }),
    ]);
    expect(outcome.kind).toBe("choose");
    if (outcome.kind !== "choose") throw new Error("expected a choice");
    expect(outcome.orders).toEqual([
      { orderId: "o1", label: "FBC" },
      { orderId: "o2", label: "UA" },
    ]);
    expect(scanOutcomeMessage(outcome)).toContain("2 orders");
  });

  it("does not offer result entry on a sample that is not recorded as collected", () => {
    const outcome = resolveLabIdScan(LAB, [
      patient({ orders: [{ orderId: "o1", status: "pending", collected: false }] }),
    ]);
    expect(outcome).toMatchObject({ kind: "order", orderId: "o1" });
    if (outcome.kind !== "order") throw new Error("expected an order");
    expect(outcome.note).toContain("not recorded as collected");
  });

  it("says results are already entered and waiting for review", () => {
    const outcome = resolveLabIdScan(LAB, [
      patient({ orders: [{ orderId: "o1", status: "results_entered", collected: true }] }),
    ]);
    expect(outcome).toMatchObject({ kind: "order", orderId: "o1" });
    if (outcome.kind !== "order") throw new Error("expected an order");
    expect(outcome.note).toContain("waiting for review");
  });

  it("says a released order is released rather than offering to enter a result", () => {
    const outcome = resolveLabIdScan(LAB, [
      patient({ orders: [{ orderId: "o1", status: "amended", collected: true }] }),
    ]);
    expect(outcome).toMatchObject({ kind: "order", orderId: "o1" });
    if (outcome.kind !== "order") throw new Error("expected an order");
    expect(outcome.note).toContain("already released");
  });

  it("says so when the patient exists but has no orders", () => {
    const outcome = resolveLabIdScan(LAB, [patient({ orders: [] })]);
    expect(outcome).toMatchObject({ kind: "patient_only", patientId: "p1" });
    expect(scanOutcomeMessage(outcome)).toContain("No tests have been ordered");
  });

  it("still opens a rejected order rather than saying nothing", () => {
    const outcome = resolveLabIdScan(LAB, [
      patient({ orders: [{ orderId: "o1", status: "rejected", collected: true }] }),
    ]);
    expect(outcome).toMatchObject({ kind: "order", orderId: "o1" });
    if (outcome.kind !== "order") throw new Error("expected an order");
    expect(outcome.note).toContain("closed");
  });

  it("matches the Lab ID whatever case each side is stored in", () => {
    const outcome = resolveLabIdScan("lf-20260918-4a7c", [
      patient({ labId: "lf-20260918-4a7c", orders: [{ orderId: "o1", status: "pending", collected: true }] }),
    ]);
    expect(outcome).toMatchObject({ kind: "order", orderId: "o1" });
  });

  it("never leaves a scan without something to say", () => {
    const cases = [
      resolveLabIdScan("", []),
      resolveLabIdScan("nonsense", []),
      resolveLabIdScan(LAB, []),
      resolveLabIdScan(LAB, [patient()]),
    ];
    for (const outcome of cases) {
      expect(scanOutcomeMessage(outcome).length).toBeGreaterThan(0);
    }
  });
});

describe("where a scan lands", () => {
  const waiting = patient({
    orders: [{ orderId: "o1", status: "pending", collected: true, label: "FBC" }],
  });

  it("takes the laboratory straight to the sheet that is waiting for a result", () => {
    const outcome = resolveLabIdScan(LAB, [waiting]);
    expect(scanDestination(outcome, "results")).toBe("/orders/o1?enter=1");
  });

  it("opens an order without the entry flag when there is something to read first", () => {
    const outcome = resolveLabIdScan(LAB, [
      patient({ orders: [{ orderId: "o1", status: "pending", collected: false }] }),
    ]);
    expect(scanDestination(outcome, "results")).toBe("/orders/o1");
  });

  it("sends a cashier to that patient's receipts, never to result entry", () => {
    for (const p of [
      waiting,
      patient({ orders: [{ orderId: "o1", status: "results_entered", collected: true }] }),
      patient({ orders: [] }),
      patient({
        orders: [
          { orderId: "o1", status: "pending", collected: true },
          { orderId: "o2", status: "pending", collected: true },
        ],
      }),
    ]) {
      const dest = scanDestination(resolveLabIdScan(LAB, [p]), "receipts");
      expect(dest).toBe("/patients/p1/receipts");
      expect(dest).not.toContain("enter=1");
    }
  });

  it("falls back to the order's own receipt when the patient record is not to hand", () => {
    const outcome = resolveLabIdScan(LAB, [
      { patientId: null, labId: LAB, orders: [{ orderId: "o7", status: "pending", collected: true }] },
    ]);
    expect(scanDestination(outcome, "receipts")).toBe("/orders/o7/receipt");
  });

  it("has nowhere to send a scan it could not place, whatever the intent", () => {
    for (const intent of ["results", "receipts"] as const) {
      expect(scanDestination(resolveLabIdScan("", []), intent)).toBeNull();
      expect(scanDestination(resolveLabIdScan("rubbish", []), intent)).toBeNull();
      expect(scanDestination(resolveLabIdScan(LAB, []), intent)).toBeNull();
    }
  });

  it("opens the patient record when the laboratory scans someone with no orders", () => {
    const outcome = resolveLabIdScan(LAB, [patient({ orders: [] })]);
    expect(scanDestination(outcome, "results")).toBe("/patients/p1");
  });
});
