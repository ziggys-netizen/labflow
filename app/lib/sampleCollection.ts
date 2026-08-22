/**
 * Sample collection is an order-level fact (PRD 5.4), now per specimen type.
 * Turnaround and "awaiting sample" read through interpretCollection — never a
 * lone sampleCollectedAt when sampleCollections exists. A patient can have
 * several current orders, and one order can mix tests, so the patients-table
 * checkbox is only a quick action when exactly one current uncollected
 * single-specimen order can be identified.
 */

import { isReleasedResultStatus } from "./resultAmendment";
import {
  parseSpecimenType,
  resolveSpecimenType,
  SPECIMEN_TYPES,
  type SpecimenType,
} from "./testCatalog";

export const SAMPLE_COLLECTED_SOURCE = {
  patientCheckbox: "patient_checkbox",
  order: "order",
} as const;

export type SampleCollectedSource =
  (typeof SAMPLE_COLLECTED_SOURCE)[keyof typeof SAMPLE_COLLECTED_SOURCE];

export const MULTI_SPECIMEN_CHECKBOX_EXPLANATION =
  "This order needs more than one specimen. The checkbox would mark them all collected at once, which would be a lie. Open the order and record each specimen.";

export const TURNAROUND_DEFINITION =
  "Turnaround is measured from the latest specimen collection time on the order to result approval. Orders missing any specimen’s collection time are excluded, never counted as zero. Collection after approval is excluded so turnaround cannot be negative. Orders with only a single legacy collection timestamp still compute and are marked as legacy.";

export interface SpecimenCollectionRecord {
  collectedAt: string;
  collectedBy: string | null;
  collectedBySource: SampleCollectedSource | null;
}

export type SampleCollections = Partial<Record<SpecimenType, SpecimenCollectionRecord | null>>;

export interface OrderTestRef {
  code: string;
  name?: string;
  specimenType?: string | null;
}

export interface CollectionOrderInput {
  tests?: OrderTestRef[] | null;
  sampleCollectedAt?: string | null;
  sampleCollectedBy?: string | null;
  sampleCollectedSource?: SampleCollectedSource | null;
  sampleCollections?: SampleCollections | null;
  legacySingleCollection?: boolean;
}

export interface OrderCollectionFields extends CollectionOrderInput {
  id: string;
  status: string;
  tests: OrderTestRef[];
  sampleCollectedAt: string | null;
  sampleCollectedSource: SampleCollectedSource | null;
  notYetSynced?: boolean;
}

export interface CollectionTypeState {
  type: SpecimenType;
  collectedAt: string | null;
  collectedBy: string | null;
  collectedBySource: SampleCollectedSource | null;
  source: "per-specimen" | "legacy" | null;
}

export interface InterpretedCollection {
  required: SpecimenType[];
  byType: CollectionTypeState[];
  uncollected: SpecimenType[];
  allCollected: boolean;
  latestCollectedAt: string | null;
  legacySingleCollection: boolean;
  awaitingLabel: string | null;
  isMultiSpecimen: boolean;
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

function validIso(value: unknown): string | null {
  if (typeof value !== "string" || !value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : value;
}

function parseSpecimenRecord(value: unknown): SpecimenCollectionRecord | null {
  if (!value || typeof value !== "object") return null;
  const row = value as { collectedAt?: unknown; collectedBy?: unknown; collectedBySource?: unknown };
  const collectedAt = validIso(row.collectedAt);
  if (!collectedAt) return null;
  return {
    collectedAt,
    collectedBy: typeof row.collectedBy === "string" ? row.collectedBy : null,
    collectedBySource: parseSampleCollectedSource(row.collectedBySource),
  };
}

export function parseSampleCollections(value: unknown): SampleCollections {
  const out: SampleCollections = {};
  if (!value || typeof value !== "object") return out;
  for (const type of SPECIMEN_TYPES) {
    const record = parseSpecimenRecord((value as Record<string, unknown>)[type]);
    if (record) out[type] = record;
  }
  return out;
}

export function orderTestsPayload(
  tests: { code: string; name: string; specimenType?: unknown }[]
): { code: string; name: string; specimenType: SpecimenType }[] {
  return tests.map((test) => ({
    code: test.code,
    name: test.name,
    specimenType: resolveSpecimenType(test.specimenType, test.code),
  }));
}

export function requiredSpecimenTypes(
  order: CollectionOrderInput,
  catalog?: { code: string; specimenType?: unknown }[]
): SpecimenType[] {
  const found = new Set<SpecimenType>();
  for (const test of order.tests || []) {
    found.add(resolveSpecimenType(test.specimenType, test.code, catalog));
  }
  return SPECIMEN_TYPES.filter((type) => found.has(type));
}

export function awaitingSampleLabel(uncollected: SpecimenType[]): string | null {
  if (uncollected.length === 0) return null;
  const names = uncollected.map((type) => (type === "csf" ? "CSF" : type));
  if (names.length === 1) return `Awaiting ${names[0]}`;
  if (names.length === 2) return `Awaiting ${names[0]} and ${names[1]}`;
  return `Awaiting ${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
}

export function interpretCollection(
  order: CollectionOrderInput,
  catalog?: { code: string; specimenType?: unknown }[]
): InterpretedCollection {
  const required = requiredSpecimenTypes(order, catalog);
  const collections = parseSampleCollections(order.sampleCollections);
  const legacyAt = validIso(order.sampleCollectedAt);
  const byType: CollectionTypeState[] = [];
  const uncollected: SpecimenType[] = [];
  let usedLegacy = false;

  for (const type of required) {
    const per = collections[type];
    if (per) {
      byType.push({
        type,
        collectedAt: per.collectedAt,
        collectedBy: per.collectedBy,
        collectedBySource: per.collectedBySource,
        source: "per-specimen",
      });
      continue;
    }
    if (legacyAt) {
      usedLegacy = true;
      byType.push({
        type,
        collectedAt: legacyAt,
        collectedBy: typeof order.sampleCollectedBy === "string" ? order.sampleCollectedBy : null,
        collectedBySource: order.sampleCollectedSource ?? null,
        source: "legacy",
      });
      continue;
    }
    uncollected.push(type);
    byType.push({
      type,
      collectedAt: null,
      collectedBy: null,
      collectedBySource: null,
      source: null,
    });
  }

  if (required.length === 0) {
    if (legacyAt) {
      usedLegacy = Object.keys(collections).length === 0;
      return {
        required,
        byType,
        uncollected: [],
        allCollected: true,
        latestCollectedAt: legacyAt,
        legacySingleCollection: usedLegacy || order.legacySingleCollection === true,
        awaitingLabel: null,
        isMultiSpecimen: false,
      };
    }
    return {
      required,
      byType,
      uncollected: [],
      allCollected: false,
      latestCollectedAt: null,
      legacySingleCollection: false,
      awaitingLabel: "Awaiting sample",
      isMultiSpecimen: false,
    };
  }

  let latestCollectedAt: string | null = null;
  let latestMs = Number.NEGATIVE_INFINITY;
  for (const row of byType) {
    if (!row.collectedAt) continue;
    const ms = new Date(row.collectedAt).getTime();
    if (ms > latestMs) {
      latestMs = ms;
      latestCollectedAt = row.collectedAt;
    }
  }

  const allCollected = uncollected.length === 0;
  return {
    required,
    byType,
    uncollected,
    allCollected,
    latestCollectedAt: allCollected ? latestCollectedAt : null,
    legacySingleCollection: usedLegacy || order.legacySingleCollection === true,
    awaitingLabel: awaitingSampleLabel(uncollected) ?? (allCollected ? null : "Awaiting sample"),
    isMultiSpecimen: required.length > 1,
  };
}

/**
 * TAT start: latest collection across required specimens. Null if any required
 * specimen has no collection time — never zero. Legacy single timestamps still
 * count, flagged via `legacy`.
 */
export function collectionTurnaroundStart(
  order: CollectionOrderInput,
  catalog?: { code: string; specimenType?: unknown }[]
): { collectedAt: string | null; legacy: boolean } {
  const interpreted = interpretCollection(order, catalog);
  if (!interpreted.allCollected) {
    return { collectedAt: null, legacy: interpreted.legacySingleCollection };
  }
  return {
    collectedAt: interpreted.latestCollectedAt,
    legacy: interpreted.legacySingleCollection,
  };
}

export function specimenCollectionWrite(
  collectedAt: string,
  collectedBy: string | null,
  collectedBySource: SampleCollectedSource
): SpecimenCollectionRecord {
  return { collectedAt, collectedBy, collectedBySource };
}

export function mergeSpecimenCollections(
  existing: unknown,
  updates: SampleCollections
): SampleCollections {
  return { ...parseSampleCollections(existing), ...updates };
}

export function orderCollectionFromData(
  id: string,
  data: {
    status?: unknown;
    tests?: unknown;
    sampleCollectedAt?: unknown;
    sampleCollectedBy?: unknown;
    sampleCollectedSource?: unknown;
    sampleCollectionQuickAction?: unknown;
    sampleCollections?: unknown;
    legacySingleCollection?: unknown;
  },
  notYetSynced?: boolean
): OrderCollectionFields {
  const tests = Array.isArray(data.tests)
    ? data.tests
        .filter((row): row is Record<string, unknown> => Boolean(row) && typeof row === "object")
        .map((row) => ({
          code: typeof row.code === "string" ? row.code : "",
          name: typeof row.name === "string" ? row.name : "",
          specimenType: parseSpecimenType(row.specimenType),
        }))
        .filter((row) => row.code)
    : [];

  return {
    id,
    status: typeof data.status === "string" && data.status ? data.status : "pending",
    tests,
    sampleCollectedAt: validIso(data.sampleCollectedAt),
    sampleCollectedBy: typeof data.sampleCollectedBy === "string" ? data.sampleCollectedBy : null,
    sampleCollectedSource: sampleCollectedSourceFromData(data),
    sampleCollections: parseSampleCollections(data.sampleCollections),
    legacySingleCollection: data.legacySingleCollection === true,
    notYetSynced,
  };
}

export function orderStatusLabel(
  order: CollectionOrderInput & { status?: string },
  catalog?: { code: string; specimenType?: unknown }[]
): string {
  const interpreted = interpretCollection(order, catalog);
  if (!interpreted.allCollected) {
    return interpreted.awaitingLabel || "Awaiting sample";
  }
  if (order.status === "amended") return "Amended";
  return (order.status || "pending").replace("_", " ");
}

export function getPatientCollectionCheckboxState(orders: OrderCollectionFields[]) {
  const currentOrders = orders.filter((order) => !isReleasedResultStatus(order.status));
  const interpreted = currentOrders.map((order) => ({
    order,
    collection: interpretCollection(order),
  }));
  const uncollectedOrders = interpreted
    .filter((row) => !row.collection.allCollected)
    .map((row) => row.order);
  const reversibleOrders = interpreted
    .filter((row) => {
      if (!row.collection.allCollected) return false;
      return row.collection.byType.every(
        (specimen) =>
          specimen.source === "per-specimen" &&
          specimen.collectedBySource === SAMPLE_COLLECTED_SOURCE.patientCheckbox
      );
    })
    .map((row) => row.order);

  const hasMultiSpecimenCurrent = interpreted.some((row) => row.collection.isMultiSpecimen);
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
    hasMultiSpecimenCurrent,
    multiSpecimenExplanation: hasMultiSpecimenCurrent ? MULTI_SPECIMEN_CHECKBOX_EXPLANATION : null,
    canToggle: (canCheck || canUncheck) && !hasMultiSpecimenCurrent,
  };
}
