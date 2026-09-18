/**
 * Scanning a specimen container's Lab ID.
 *
 * The label prints the Lab ID as text and as a Code 128 barcode carrying the
 * Lab ID exactly (see specimenLabel.ts). A handheld scanner types that value
 * and presses Enter; a phone camera reads the same symbol. Both land here.
 *
 * Every scan resolves to something the person can act on: an order to open, a
 * choice between orders, or a named reason why there is nothing to enter. A
 * scan never ends in silence.
 */

import { LAB_ID_PATTERN } from "./labId";
import { interpretCollection, type OrderCollectionFields } from "./sampleCollection";
import { canEnterResultsForStatus, isTerminalOrderStatus } from "./orderLifecycle";
import { isReleasedResultStatus } from "./resultAmendment";

export type ScanOrder = {
  orderId: string;
  status: string;
  /** Every required specimen on the order is recorded as collected. */
  collected: boolean;
  /** What to show when the person has to pick between orders, e.g. "FBC, UA". */
  label?: string;
};

export type ScanPatient = {
  patientId: string | null;
  labId: string;
  orders: ScanOrder[];
};

/**
 * What the person scanning is trying to do. A technician scanning a specimen
 * wants the result sheet; a cashier scanning a receipt wants that patient's
 * receipts. Same barcode, same Lab ID, different destination, and a cashier is
 * never taken to result entry.
 */
export type ScanIntent = "results" | "receipts";

export type ScanOutcome =
  | { kind: "empty" }
  | { kind: "not_a_lab_id"; text: string }
  | { kind: "unknown"; labId: string }
  | { kind: "order"; labId: string; patientId: string | null; orderId: string; note: string }
  | {
      kind: "choose";
      labId: string;
      patientId: string | null;
      orders: { orderId: string; label: string }[];
    }
  | { kind: "patient_only"; labId: string; patientId: string | null; note: string };

/**
 * A Lab ID out of whatever the scanner produced. Handheld scanners add a
 * carriage return and sometimes a prefix character; some encode the label as a
 * URL. Upper-cases because Lab IDs are upper-case and a scanner may not be.
 */
export function extractLabId(raw: string | null | undefined): string | null {
  const text = (raw ?? "").trim().toUpperCase();
  if (!text) return null;
  if (LAB_ID_PATTERN.test(text)) return text;
  const match = text.match(/LF-\d{8}-[0-9A-HJKMNP-TV-Z]{4}/);
  if (match && LAB_ID_PATTERN.test(match[0])) return match[0];
  return null;
}

/** Orders that would accept a result right now, oldest first is the caller's job. */
function readyForResults(orders: ScanOrder[]): ScanOrder[] {
  return orders.filter(
    (order) =>
      order.collected &&
      !isTerminalOrderStatus(order.status) &&
      (order.status === "pending" || order.status === "needs_correction")
  );
}

function orderLabel(order: ScanOrder): string {
  return order.label?.trim() || order.orderId;
}

/**
 * What a scan should do. `patients` is whatever the surface already holds, so
 * no extra read is needed and no new collection is involved.
 */
export function resolveLabIdScan(raw: string | null | undefined, patients: ScanPatient[]): ScanOutcome {
  const text = (raw ?? "").trim();
  if (!text) return { kind: "empty" };

  const labId = extractLabId(text);
  if (!labId) return { kind: "not_a_lab_id", text };

  const match = patients.find((patient) => (patient.labId || "").trim().toUpperCase() === labId);
  if (!match) return { kind: "unknown", labId };

  const patientId = match.patientId;
  const orders = match.orders;

  if (orders.length === 0) {
    return {
      kind: "patient_only",
      labId,
      patientId,
      note: "No tests have been ordered for this patient yet.",
    };
  }

  const ready = readyForResults(orders);
  if (ready.length === 1) {
    return { kind: "order", labId, patientId, orderId: ready[0]!.orderId, note: "" };
  }
  if (ready.length > 1) {
    return {
      kind: "choose",
      labId,
      patientId,
      orders: ready.map((order) => ({ orderId: order.orderId, label: orderLabel(order) })),
    };
  }

  const awaitingCollection = orders.find(
    (order) => !order.collected && !isTerminalOrderStatus(order.status)
  );
  if (awaitingCollection) {
    return {
      kind: "order",
      labId,
      patientId,
      orderId: awaitingCollection.orderId,
      note: "This sample is not recorded as collected yet. Record the collection, then enter the result.",
    };
  }

  const entered = orders.find((order) => order.status === "results_entered");
  if (entered) {
    return {
      kind: "order",
      labId,
      patientId,
      orderId: entered.orderId,
      note: "Results are already entered on this order and are waiting for review.",
    };
  }

  const released = orders.find((order) => isReleasedResultStatus(order.status));
  if (released) {
    return {
      kind: "order",
      labId,
      patientId,
      orderId: released.orderId,
      note: "This order is already released. Opening it read-only.",
    };
  }

  const anyOrder = orders.find((order) => canEnterResultsForStatus(order.status)) || orders[0]!;
  return {
    kind: "order",
    labId,
    patientId,
    orderId: anyOrder.orderId,
    note: "This order is closed. Opening it so you can see why.",
  };
}

/** One line for the person, for the outcomes that do not open an order. */
export function scanOutcomeMessage(outcome: ScanOutcome): string {
  switch (outcome.kind) {
    case "empty":
      return "Scan a Lab ID barcode, or type the Lab ID.";
    case "not_a_lab_id":
      return `That barcode does not carry a Lab ID. It read "${outcome.text}". Lab IDs look like LF-20260918-4A7C.`;
    case "unknown":
      return `${outcome.labId} does not match any patient in this clinic. Check the clinic selected above, or search for the patient.`;
    case "choose":
      return `${outcome.labId} has ${outcome.orders.length} orders waiting for results. Choose one.`;
    case "patient_only":
      return outcome.note;
    case "order":
      return outcome.note;
    default:
      return "";
  }
}

/**
 * Where a scan should land, or null when there is nothing to open and the
 * panel must explain itself instead.
 *
 * `enter=1` asks the order page to open the sheet for the test that is waiting
 * for a result, so a scan is followed by typing rather than by more clicks.
 */
export function scanDestination(outcome: ScanOutcome, intent: ScanIntent): string | null {
  if (intent === "receipts") {
    if (outcome.kind === "order" || outcome.kind === "choose" || outcome.kind === "patient_only") {
      if (outcome.patientId) return `/patients/${outcome.patientId}/receipts`;
      if (outcome.kind === "order") return `/orders/${outcome.orderId}/receipt`;
    }
    return null;
  }
  if (outcome.kind === "order") {
    return outcome.note ? `/orders/${outcome.orderId}` : `/orders/${outcome.orderId}?enter=1`;
  }
  if (outcome.kind === "patient_only" && outcome.patientId) {
    return `/patients/${outcome.patientId}`;
  }
  return null;
}

export type ScanOrderInput = OrderCollectionFields & {
  patientId?: string | null;
  patientLabId?: string | null;
};

/**
 * The scan list every surface hands the panel, built from the patients and
 * orders it is already listening to. Patients with no orders are kept, so a
 * scan of a freshly registered person says "no tests ordered yet" instead of
 * "no such Lab ID".
 */
export function buildScanPatients(
  patients: { id: string; labId?: string | null }[],
  orders: ScanOrderInput[],
  catalog?: Parameters<typeof interpretCollection>[1]
): ScanPatient[] {
  const byLabId = new Map<string, ScanPatient>();
  const labIdByPatient = new Map<string, string>();

  for (const patient of patients) {
    const labId = (patient.labId || "").trim();
    if (!labId) continue;
    labIdByPatient.set(patient.id, labId);
    if (!byLabId.has(labId)) byLabId.set(labId, { patientId: patient.id, labId, orders: [] });
  }

  for (const order of orders) {
    const patientId = order.patientId || null;
    const labId = (order.patientLabId || "").trim() || (patientId ? labIdByPatient.get(patientId) || "" : "");
    if (!labId) continue;
    let entry = byLabId.get(labId);
    if (!entry) {
      entry = { patientId, labId, orders: [] };
      byLabId.set(labId, entry);
    }
    entry.orders.push({
      orderId: order.id,
      status: order.status,
      collected: interpretCollection(order, catalog).allCollected,
      label: (order.tests || [])
        .map((test) => test.code || test.name || "")
        .filter(Boolean)
        .join(", "),
    });
  }

  return [...byLabId.values()];
}
