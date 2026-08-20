/**
 * Sample collection is an order-level fact (PRD 5.4). Turnaround and
 * "awaiting sample" both read order.sampleCollectedAt. A patient can have
 * several current orders, and one order can mix tests, so the patients-table
 * checkbox is only a quick action when exactly one current uncollected order
 * can be identified.
 */

export const SAMPLE_COLLECTED_SOURCE = {
  patientCheckbox: "patient_checkbox",
  order: "order",
} as const;

export type SampleCollectedSource =
  (typeof SAMPLE_COLLECTED_SOURCE)[keyof typeof SAMPLE_COLLECTED_SOURCE];

export interface OrderCollectionFields {
  id: string;
  status: string;
  sampleCollectedAt: string | null;
  sampleCollectedSource: SampleCollectedSource | null;
}

export function parseSampleCollectedSource(value: unknown): SampleCollectedSource | null {
  if (value === SAMPLE_COLLECTED_SOURCE.patientCheckbox || value === SAMPLE_COLLECTED_SOURCE.order) {
    return value;
  }
  return null;
}

/**
 * Reads provenance from an order document. `sampleCollectionQuickAction` was an
 * unpublished intermediate shape; treat it as a checkbox write so a later
 * uncheck can still reverse that exact action.
 */
export function sampleCollectedSourceFromData(data: {
  sampleCollectedSource?: unknown;
  sampleCollectionQuickAction?: unknown;
}): SampleCollectedSource | null {
  const source = parseSampleCollectedSource(data.sampleCollectedSource);
  if (source) return source;
  const quickAction = data.sampleCollectionQuickAction;
  if (
    quickAction &&
    typeof quickAction === "object" &&
    (quickAction as { source?: unknown }).source === "patients_table"
  ) {
    return SAMPLE_COLLECTED_SOURCE.patientCheckbox;
  }
  return null;
}

export function getPatientCollectionCheckboxState(orders: OrderCollectionFields[]) {
  const currentOrders = orders.filter((order) => order.status !== "approved");
  const uncollectedOrders = currentOrders.filter((order) => !order.sampleCollectedAt);
  const reversibleOrders = currentOrders.filter(
    (order) =>
      Boolean(order.sampleCollectedAt) &&
      order.sampleCollectedSource === SAMPLE_COLLECTED_SOURCE.patientCheckbox
  );

  const checked = currentOrders.length > 0 && uncollectedOrders.length === 0;
  const indeterminate = uncollectedOrders.length > 1;
  const canCheck = uncollectedOrders.length === 1;
  const canUncheck = checked && reversibleOrders.length === 1;

  return {
    currentOrders,
    uncollectedOrders,
    reversibleOrders,
    checked,
    indeterminate,
    canToggle: canCheck || canUncheck,
  };
}
