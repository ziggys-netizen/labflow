import { QueryDocumentSnapshot } from "firebase/firestore";
import { ActorStamp, readActorStamp } from "./identity";

/**
 * Store and inventory model — PRD v0.2 section 6.
 *
 * Three collections, each clinic-scoped:
 *
 *   inventoryItems      what the laboratory stocks (the product master)
 *   inventoryBatches    a specific lot of an item, with its own expiry date
 *   inventoryMovements  the ledger — every receipt, issue, transfer, return,
 *                       adjustment and disposal
 *
 * Balances are never stored. PRD 6.3 requires the balance to be calculated
 * rather than typed, so it is summed from the ledger; the ledger is then the
 * single source of truth and cannot silently disagree with a cached total.
 *
 * The pack/unit split follows the pattern used by health supply chain systems
 * such as OpenLMIS, which separates the pack a product is received in from the
 * dispensing unit it is consumed in, with a "net content" conversion between
 * them. Here that is `packingUnit` + `unitsPerPack` + `baseUnit`.
 */

export const INVENTORY_CATEGORIES = [
  "Rapid test kit",
  "Reagent",
  "Stain",
  "Control / calibrator",
  "Culture media",
  "Consumable",
  "Specimen container",
  "Glassware",
  "PPE",
  "Other",
] as const;

export interface PackingUnit {
  value: string;
  plural: string;
  /** Why this unit exists, shown as a hint when choosing one. */
  hint: string;
}

/**
 * Packing units seen in real diagnostic and laboratory catalogues. WHO's
 * prequalified IVD list, for example, expresses rapid tests as "25 T/kit",
 * "40 T/kit", "50 T/kit" — a kit or box holding a count of individual tests.
 */
export const PACKING_UNITS: PackingUnit[] = [
  { value: "Kit", plural: "Kits", hint: "Rapid test kits sold as N tests per kit" },
  { value: "Box", plural: "Boxes", hint: "Outer box holding a counted number of units" },
  { value: "Pack", plural: "Packs", hint: "Sealed pack of consumables" },
  { value: "Bottle", plural: "Bottles", hint: "Liquid reagent or stain, e.g. 500 mL" },
  { value: "Vial", plural: "Vials", hint: "Small volume reagent, control or calibrator" },
  { value: "Cassette", plural: "Cassettes", hint: "Single test device" },
  { value: "Strip", plural: "Strips", hint: "Dipstick or test strip, often N per tube" },
  { value: "Tube", plural: "Tubes", hint: "Sample tube, or a tube of strips" },
  { value: "Bag", plural: "Bags", hint: "Bagged consumables such as tips or swabs" },
  { value: "Roll", plural: "Rolls", hint: "Tape, labels, paper" },
  { value: "Carton", plural: "Cartons", hint: "Shipping carton holding several boxes" },
  { value: "Piece", plural: "Pieces", hint: "Counted individually" },
];

/** What a pack breaks down into once opened — the unit actually consumed. */
export const BASE_UNITS = [
  "test",
  "cassette",
  "strip",
  "tube",
  "slide",
  "piece",
  "mL",
  "L",
  "g",
  "pair",
] as const;

/** ISO 15189 requires storage conditions to be recorded and respected. */
export const STORAGE_CONDITIONS = [
  "Room temperature",
  "2–8 °C (refrigerated)",
  "-20 °C (frozen)",
  "Protect from light",
  "Dry, well ventilated",
] as const;

/**
 * Laboratory sections a small clinical laboratory issues stock to. Drawn from
 * the categories already used by the LabFlow test catalogue, plus the non-
 * testing areas that consume supplies.
 */
export const LAB_DEPARTMENTS = [
  "Main store",
  "Sample reception / phlebotomy",
  "Haematology",
  "Clinical Chemistry",
  "Serology",
  "Parasitology",
  "Microbiology",
  "Quality control",
] as const;

export type MovementType =
  | "receipt"
  | "issue"
  | "transfer"
  | "return"
  | "adjustment"
  | "disposal";

/** `none` keeps a movement in the audit trail without changing the clinic total. */
export type MovementDirection = "in" | "out" | "none";

export interface MovementTypeDefinition {
  value: MovementType;
  label: string;
  direction: MovementDirection;
  hint: string;
}

export const MOVEMENT_TYPES: MovementTypeDefinition[] = [
  {
    value: "receipt",
    label: "Received",
    direction: "in",
    hint: "Stock delivered into the store from a supplier.",
  },
  {
    value: "issue",
    label: "Issued",
    direction: "out",
    hint: "Stock issued out of the store to a person or bench for use.",
  },
  {
    value: "transfer",
    label: "Transferred",
    direction: "none",
    hint: "Moved to another storage location. The clinic total does not change.",
  },
  {
    value: "return",
    label: "Returned",
    direction: "in",
    hint: "Unused stock handed back to the store.",
  },
  {
    value: "adjustment",
    label: "Adjustment",
    direction: "in",
    hint: "Correction after a physical count. Choose whether it adds or removes.",
  },
  {
    value: "disposal",
    label: "Disposed",
    direction: "out",
    hint: "Written off — expired, damaged, contaminated or returned to supplier.",
  },
];

export function movementDefinition(type: string): MovementTypeDefinition | undefined {
  return MOVEMENT_TYPES.find((m) => m.value === type);
}

export function movementLabel(type: string): string {
  return movementDefinition(type)?.label ?? type;
}

export const DISPOSAL_REASONS = [
  "Expired",
  "Damaged in storage",
  "Damaged on arrival",
  "Cold chain broken",
  "Contaminated",
  "Failed acceptance testing",
  "Returned to supplier",
] as const;

export const ADJUSTMENT_REASONS = [
  "Physical count correction",
  "Data entry correction",
  "Found stock",
  "Missing stock",
] as const;

/**
 * ISO 15189 expects untested, accepted and unacceptable material to be kept
 * apart, so acceptance is recorded on the lot rather than assumed.
 */
export const BATCH_ACCEPTANCE = ["accepted", "untested", "rejected"] as const;
export type BatchAcceptance = (typeof BATCH_ACCEPTANCE)[number];

export const ACCEPTANCE_LABELS: Record<string, string> = {
  accepted: "Accepted",
  untested: "Quarantine — not yet tested",
  rejected: "Rejected",
};

export const ARRIVAL_CONDITIONS = [
  "Good",
  "Packaging damaged",
  "Cold chain broken",
  "Short delivery",
  "Expired on arrival",
] as const;

/** PRD 6.4: expired is red, within 30 days is amber. */
export const EXPIRY_WARNING_DAYS = 30;

export interface InventoryItem {
  id: string;
  clinicId: string | null;
  name: string;
  category: string;
  testCode: string | null;
  manufacturer: string;
  supplier: string;
  catalogueCode: string;
  packingUnit: string;
  unitsPerPack: number;
  baseUnit: string;
  unitSize: string;
  packsPerCarton: number | null;
  storageCondition: string;
  department: string;
  minimumStock: number;
  active: boolean;
  createdAt: string | null;
  createdBy: ActorStamp | string | null;
  updatedAt: string | null;
}

export interface InventoryBatch {
  id: string;
  clinicId: string | null;
  itemId: string;
  itemName: string;
  lotNumber: string;
  expiryDate: string | null;
  manufactureDate: string | null;
  supplier: string;
  location: string;
  acceptance: string;
  createdAt: string | null;
  createdBy: ActorStamp | string | null;
}

export interface InventoryMovement {
  id: string;
  clinicId: string | null;
  itemId: string;
  itemName: string;
  batchId: string;
  lotNumber: string;
  expiryDate: string | null;
  type: MovementType;
  direction: MovementDirection;
  quantity: number;
  packingUnit: string;
  unitsPerPack: number;
  baseUnit: string;
  occurredAt: string;
  recordedAt: string | null;
  actor: ActorStamp | string | null;
  supplier: string | null;
  deliveryNote: string | null;
  conditionOnArrival: string | null;
  department: string | null;
  issuedTo: string | null;
  purpose: string | null;
  destination: string | null;
  reason: string | null;
  note: string | null;
}

export const SPECIMEN_TYPES = [
  "Whole blood (EDTA)",
  "Whole blood (plain)",
  "Serum",
  "Plasma",
  "Urine",
  "Stool",
  "Sputum",
  "CSF",
  "Swab",
  "Blood film / slide",
  "Other",
] as const;

export const SPECIMEN_CONTAINERS = [
  "EDTA tube",
  "Plain / serum tube",
  "Lithium heparin tube",
  "Fluoride oxalate tube",
  "Citrate tube",
  "Universal container",
  "Sterile container",
  "Transport swab",
  "Slide holder",
  "Other",
] as const;

export const SPECIMEN_CONDITIONS = [
  "Acceptable",
  "Haemolysed",
  "Clotted",
  "Insufficient volume",
  "Wrong container",
  "Unlabelled / mislabelled",
  "Leaking",
  "Delayed transport",
] as const;

export const SPECIMEN_TRANSPORT = [
  "Ambient",
  "Cold box 2–8 °C",
  "Frozen",
  "Not applicable",
] as const;

export const SPECIMEN_STATUSES = [
  "in_lab",
  "in_transit",
  "delivered",
  "rejected",
  "returned",
] as const;

export const SPECIMEN_STATUS_LABELS: Record<string, string> = {
  in_lab: "In laboratory",
  in_transit: "In transit",
  delivered: "Delivered",
  rejected: "Rejected",
  returned: "Returned",
};

export interface SpecimenMovement {
  id: string;
  clinicId: string | null;
  direction: "received" | "sent";
  specimenType: string;
  container: string;
  quantity: number;
  orderReference: string;
  department: string;
  destination: string;
  occurredAt: string;
  recordedAt: string | null;
  actor: ActorStamp | string | null;
  condition: string;
  transport: string;
  status: string;
  note: string | null;
}

function text(value: unknown, fallback = ""): string {
  return typeof value === "string" ? value : fallback;
}

function optionalText(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function number(value: unknown, fallback = 0): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export function mapItem(snap: QueryDocumentSnapshot): InventoryItem {
  const d = snap.data();
  return {
    id: snap.id,
    clinicId: optionalText(d.clinicId),
    name: text(d.name),
    category: text(d.category, "Other"),
    testCode: optionalText(d.testCode),
    manufacturer: text(d.manufacturer),
    supplier: text(d.supplier),
    catalogueCode: text(d.catalogueCode),
    packingUnit: text(d.packingUnit, "Box"),
    unitsPerPack: number(d.unitsPerPack, 1),
    baseUnit: text(d.baseUnit, "piece"),
    unitSize: text(d.unitSize),
    packsPerCarton: typeof d.packsPerCarton === "number" ? d.packsPerCarton : null,
    storageCondition: text(d.storageCondition, "Room temperature"),
    department: text(d.department, "Main store"),
    minimumStock: number(d.minimumStock, 0),
    active: d.active !== false,
    createdAt: optionalText(d.createdAt),
    createdBy: readActorStamp(d.createdBy),
    updatedAt: optionalText(d.updatedAt),
  };
}

export function mapBatch(snap: QueryDocumentSnapshot): InventoryBatch {
  const d = snap.data();
  return {
    id: snap.id,
    clinicId: optionalText(d.clinicId),
    itemId: text(d.itemId),
    itemName: text(d.itemName),
    lotNumber: text(d.lotNumber),
    expiryDate: optionalText(d.expiryDate),
    manufactureDate: optionalText(d.manufactureDate),
    supplier: text(d.supplier),
    location: text(d.location),
    acceptance: text(d.acceptance, "accepted"),
    createdAt: optionalText(d.createdAt),
    createdBy: readActorStamp(d.createdBy),
  };
}

export function mapMovement(snap: QueryDocumentSnapshot): InventoryMovement {
  const d = snap.data();
  const type = text(d.type, "receipt") as MovementType;
  return {
    id: snap.id,
    clinicId: optionalText(d.clinicId),
    itemId: text(d.itemId),
    itemName: text(d.itemName),
    batchId: text(d.batchId),
    lotNumber: text(d.lotNumber),
    expiryDate: optionalText(d.expiryDate),
    type,
    direction: (text(d.direction) || movementDefinition(type)?.direction || "in") as MovementDirection,
    quantity: number(d.quantity),
    packingUnit: text(d.packingUnit, "Box"),
    unitsPerPack: number(d.unitsPerPack, 1),
    baseUnit: text(d.baseUnit, "piece"),
    occurredAt: text(d.occurredAt),
    recordedAt: optionalText(d.recordedAt),
    actor: readActorStamp(d.actor),
    supplier: optionalText(d.supplier),
    deliveryNote: optionalText(d.deliveryNote),
    conditionOnArrival: optionalText(d.conditionOnArrival),
    department: optionalText(d.department),
    issuedTo: optionalText(d.issuedTo),
    purpose: optionalText(d.purpose),
    destination: optionalText(d.destination),
    reason: optionalText(d.reason),
    note: optionalText(d.note),
  };
}

export function mapSpecimen(snap: QueryDocumentSnapshot): SpecimenMovement {
  const d = snap.data();
  return {
    id: snap.id,
    clinicId: optionalText(d.clinicId),
    direction: d.direction === "sent" ? "sent" : "received",
    specimenType: text(d.specimenType),
    container: text(d.container),
    quantity: number(d.quantity, 1),
    orderReference: text(d.orderReference),
    department: text(d.department),
    destination: text(d.destination),
    occurredAt: text(d.occurredAt),
    recordedAt: optionalText(d.recordedAt),
    actor: readActorStamp(d.actor),
    condition: text(d.condition, "Acceptable"),
    transport: text(d.transport),
    status: text(d.status, "in_lab"),
    note: optionalText(d.note),
  };
}

export interface BatchBalance {
  received: number;
  issued: number;
  returned: number;
  disposed: number;
  adjustedIn: number;
  adjustedOut: number;
  onHand: number;
  /** ISO 15189:2022 6.6.7 c) — date of receipt. */
  firstReceivedAt: string | null;
  /** ISO 15189:2022 6.6.7 c) — date of first use, taken as the first issue. */
  firstUsedAt: string | null;
  /** ISO 15189:2022 6.6.7 c) — date taken out of service, taken as the last disposal. */
  outOfServiceAt: string | null;
}

const ZERO_BALANCE: BatchBalance = {
  received: 0,
  issued: 0,
  returned: 0,
  disposed: 0,
  adjustedIn: 0,
  adjustedOut: 0,
  onHand: 0,
  firstReceivedAt: null,
  firstUsedAt: null,
  outOfServiceAt: null,
};

function earliest(current: string | null, candidate: string): string {
  return current && current <= candidate ? current : candidate;
}

function latest(current: string | null, candidate: string): string {
  return current && current >= candidate ? current : candidate;
}

/** Sums the ledger per lot. Nothing else is allowed to decide a balance. */
export function computeBalances(movements: InventoryMovement[]): Map<string, BatchBalance> {
  const balances = new Map<string, BatchBalance>();
  for (const movement of movements) {
    if (!movement.batchId) continue;
    const current = balances.get(movement.batchId) ?? { ...ZERO_BALANCE };
    const quantity = Math.abs(movement.quantity);

    if (movement.type === "receipt") {
      current.received += quantity;
      if (movement.occurredAt) {
        current.firstReceivedAt = earliest(current.firstReceivedAt, movement.occurredAt);
      }
    } else if (movement.type === "issue") {
      current.issued += quantity;
      if (movement.occurredAt) {
        current.firstUsedAt = earliest(current.firstUsedAt, movement.occurredAt);
      }
    } else if (movement.type === "return") current.returned += quantity;
    else if (movement.type === "disposal") {
      current.disposed += quantity;
      if (movement.occurredAt) {
        current.outOfServiceAt = latest(current.outOfServiceAt, movement.occurredAt);
      }
    } else if (movement.type === "adjustment") {
      if (movement.direction === "out") current.adjustedOut += quantity;
      else current.adjustedIn += quantity;
    }

    if (movement.direction === "in") current.onHand += quantity;
    else if (movement.direction === "out") current.onHand -= quantity;

    balances.set(movement.batchId, current);
  }
  return balances;
}

export function balanceFor(
  balances: Map<string, BatchBalance>,
  batchId: string
): BatchBalance {
  return balances.get(batchId) ?? { ...ZERO_BALANCE };
}

export function daysUntil(date: string | null | undefined, today = new Date()): number | null {
  if (!date) return null;
  const target = new Date(`${date}T00:00:00`);
  if (Number.isNaN(target.getTime())) return null;
  const start = new Date(today);
  start.setHours(0, 0, 0, 0);
  return Math.round((target.getTime() - start.getTime()) / 86400000);
}

export type BatchState =
  | "rejected"
  | "quarantine"
  | "expired"
  | "expiring"
  | "depleted"
  | "ok";

export const BATCH_STATE_LABELS: Record<BatchState, string> = {
  rejected: "Rejected",
  quarantine: "Quarantine",
  expired: "Expired",
  expiring: "Expiring soon",
  depleted: "Out of stock",
  ok: "In stock",
};

/** Tailwind classes matching the PRD 6.4 flags: expired red, warnings amber. */
export const BATCH_STATE_CLASSES: Record<BatchState, string> = {
  rejected: "text-red-700 border-red-300",
  quarantine: "text-amber-700 border-amber-300",
  expired: "text-red-700 border-red-300",
  expiring: "text-amber-700 border-amber-300",
  depleted: "text-gray-500 border-gray-300",
  ok: "text-gray-700 border-gray-300",
};

export function batchState(
  batch: InventoryBatch,
  onHand: number,
  today = new Date()
): BatchState {
  if (batch.acceptance === "rejected") return "rejected";
  const days = daysUntil(batch.expiryDate, today);
  if (days !== null && days < 0) return "expired";
  if (onHand <= 0) return "depleted";
  if (batch.acceptance === "untested") return "quarantine";
  if (days !== null && days <= EXPIRY_WARNING_DAYS) return "expiring";
  return "ok";
}

/**
 * First-expire-first-out (PRD 6.4). Lots without an expiry date sort last —
 * they cannot be shown to expire sooner than one that has a date.
 */
export function fefoSort(batches: InventoryBatch[]): InventoryBatch[] {
  return [...batches].sort((a, b) => {
    if (a.expiryDate && b.expiryDate) return a.expiryDate.localeCompare(b.expiryDate);
    if (a.expiryDate) return -1;
    if (b.expiryDate) return 1;
    return a.lotNumber.localeCompare(b.lotNumber);
  });
}

export type StockLevel = "out" | "low" | "ok";

export function stockLevel(onHand: number, minimumStock: number): StockLevel {
  if (onHand <= 0) return "out";
  if (minimumStock > 0 && onHand <= minimumStock) return "low";
  return "ok";
}

export function pluralPack(packingUnit: string, quantity: number): string {
  if (quantity === 1) return packingUnit;
  const known = PACKING_UNITS.find((u) => u.value === packingUnit);
  if (known) return known.plural;
  return /(s|x|ch|sh)$/i.test(packingUnit) ? `${packingUnit}es` : `${packingUnit}s`;
}

/** "10 Boxes (250 tests)" — pack count first, because that is what is counted. */
export function formatQuantity(
  quantity: number,
  packingUnit: string,
  unitsPerPack: number,
  baseUnit: string
): string {
  const packs = `${quantity} ${pluralPack(packingUnit, quantity)}`;
  if (!unitsPerPack || unitsPerPack <= 1) return packs;
  return `${packs} (${quantity * unitsPerPack} ${baseUnit})`;
}

export function packDescription(item: {
  packingUnit: string;
  unitsPerPack: number;
  baseUnit: string;
  unitSize?: string;
}): string {
  if (item.unitSize) return `${item.packingUnit} — ${item.unitSize}`;
  if (item.unitsPerPack > 1) {
    return `${item.packingUnit} of ${item.unitsPerPack} ${item.baseUnit}`;
  }
  return item.packingUnit;
}

/** Local date and time, kept short so tables stay readable. */
export function formatDateTime(iso: string | null | undefined): { date: string; time: string } {
  if (!iso) return { date: "—", time: "—" };
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return { date: "—", time: "—" };
  return {
    date: d.toLocaleDateString(),
    time: d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
  };
}

export function isSameLocalDay(iso: string | null | undefined, day = new Date()): boolean {
  if (!iso) return false;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return false;
  return (
    d.getFullYear() === day.getFullYear() &&
    d.getMonth() === day.getMonth() &&
    d.getDate() === day.getDate()
  );
}
