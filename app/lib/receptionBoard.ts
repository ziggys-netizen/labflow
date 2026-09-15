/**
 * Reception (intern) landing helpers.
 * Register stays the primary action. Lists answer who is waiting.
 */

import { isSameLocalDay } from "./inventory";
import {
  interpretCollection,
  type OrderCollectionFields,
  type OrderTestRef,
} from "./sampleCollection";
import type { OperationalFlagInput } from "./operationalFlag";
import { PAYMENT_METHOD_LABELS, formatPaymentAmount, parseOrderPayment } from "./orderPayment";

export const RECEPTION_PAGE_SIZE = 10;

export type ReceptionPatient = {
  id: string;
  labId: string;
  name: string;
  preferredName: string;
  createdAt: string | null;
  createdByUid: string | null;
  notYetSynced?: boolean;
};

export type ReceptionOrder = OrderCollectionFields & {
  createdAt?: string | null;
  patientId?: string | null;
  patientLabId?: string | null;
  patientName?: string | null;
  payment?: unknown;
};

export type ReceptionCatalogRow = {
  code: string;
  name?: string;
  specimenType?: unknown;
};

export type ReceptionListRow = {
  id: string;
  kind: "registered_today" | "awaiting_collection";
  labId: string;
  title: string;
  detail: string;
  href: string;
  /** Text on the row's link. "Open list" unless the row leads to ordering. */
  actionLabel: string;
  at: string | null;
  notYetSynced?: boolean;
};

export function patientDisplayName(patient: Pick<ReceptionPatient, "name" | "preferredName">): string {
  return patient.preferredName.trim() || patient.name.trim() || "Unknown patient";
}

export function isRegisteredToday(patient: ReceptionPatient, now: Date): boolean {
  return isSameLocalDay(patient.createdAt, now);
}

export function matchesPatientSearch(
  patient: ReceptionPatient,
  needle: string
): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  const hay = `${patient.labId} ${patient.name} ${patient.preferredName}`.toLowerCase();
  return hay.includes(q);
}

export function isAwaitingCollection(
  order: ReceptionOrder,
  catalog: ReceptionCatalogRow[]
): boolean {
  if (order.status === "cancelled" || order.status === "rejected") return false;
  if (order.status !== "pending" && order.status !== "needs_correction") return false;
  return !interpretCollection(order, catalog).allCollected;
}

export function buildTodaysRegistrations(
  patients: ReceptionPatient[],
  now: Date,
  opts?: { onlyCreatedByUid?: string | null; canOrder?: boolean }
): ReceptionListRow[] {
  return patients
    .filter((patient) => isRegisteredToday(patient, now))
    .filter((patient) => {
      if (!opts?.onlyCreatedByUid) return true;
      return patient.createdByUid === opts.onlyCreatedByUid;
    })
    .map((patient) => ({
      id: `reg:${patient.id}`,
      kind: "registered_today" as const,
      labId: patient.labId || "—",
      title: patientDisplayName(patient),
      detail: "Registered today",
      // A viewer who can order tests (cashier) goes straight to ordering for
      // this patient. Everyone else (intern) goes to the patient list, the
      // only patient surface it can open.
      href: opts?.canOrder ? `/orders/new/${patient.id}` : `/patients`,
      actionLabel: opts?.canOrder ? "Order tests" : "Open list",
      at: patient.createdAt,
      notYetSynced: patient.notYetSynced,
    }))
    .sort((a, b) => (b.at || "").localeCompare(a.at || ""));
}

export function buildAwaitingCollection(
  orders: ReceptionOrder[],
  patientsById: Map<string, ReceptionPatient>,
  catalog: ReceptionCatalogRow[],
  opts?: { onlyPatientIds?: Set<string> | null }
): ReceptionListRow[] {
  const rows: ReceptionListRow[] = [];
  for (const order of orders) {
    if (!isAwaitingCollection(order, catalog)) continue;
    if (opts?.onlyPatientIds && order.patientId && !opts.onlyPatientIds.has(order.patientId)) {
      continue;
    }
    if (opts?.onlyPatientIds && !order.patientId) continue;
    const patient = order.patientId ? patientsById.get(order.patientId) : undefined;
    const title =
      (patient && patientDisplayName(patient)) ||
      (typeof order.patientName === "string" && order.patientName.trim()) ||
      "Unknown patient";
    const labId =
      (typeof order.patientLabId === "string" && order.patientLabId) ||
      patient?.labId ||
      "—";
    const tests = order.tests
      .map((test: OrderTestRef) => test.name || test.code)
      .filter(Boolean)
      .join(", ");
    const payment = parseOrderPayment(order.payment);
    const paid = payment
      ? `Paid ${formatPaymentAmount(payment)} · ${PAYMENT_METHOD_LABELS[payment.method]}`
      : "";
    rows.push({
      id: `await:${order.id}`,
      kind: "awaiting_collection",
      labId,
      title,
      detail: [tests || "Awaiting sample", paid].filter(Boolean).join(" · "),
      href: `/patients`,
      actionLabel: "Open list",
      at: order.createdAt || null,
      notYetSynced: order.notYetSynced,
    });
  }
  return rows.sort((a, b) => (a.at || "").localeCompare(b.at || ""));
}

export function operationalForReceptionRow(row: ReceptionListRow): OperationalFlagInput {
  if (row.kind === "registered_today") return { state: "released", label: "TODAY" };
  return { state: "awaiting-sample" };
}

export function visibleReceptionList<T>(items: T[], showAll: boolean, pageSize = RECEPTION_PAGE_SIZE): T[] {
  if (showAll) return items;
  return items.slice(0, pageSize);
}
