import { isTerminalOrderStatus } from "./orderLifecycle";
import {
  operationalFromOrderStage,
  type OperationalFlagInput,
} from "./operationalFlag";
import { parseAgeYears } from "./resultFlag";
import { isReleasedResultStatus } from "./resultAmendment";
import { interpretCollection, type OrderCollectionFields } from "./sampleCollection";

export type PatientListOrder = OrderCollectionFields & {
  createdAt: string | null;
  resultsEnteredAt: string | null;
  reviewedAt: string | null;
  lastAmendedAt: string | null;
  recollectionOfOrderId: string | null;
};

export type PatientPrimaryKind = "order" | "collect" | "enter" | "review" | "print";

export type PatientPrimaryAction = {
  kind: PatientPrimaryKind;
  label: "Order tests" | "Collect" | "Enter results" | "Review" | "Print";
  targetOrderId: string | null;
};

export type PatientListChip = OperationalFlagInput;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function parseDobYmd(dob: string | null | undefined): string | null {
  if (!dob || typeof dob !== "string") return null;
  const ymd = dob.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(ymd)) return null;
  const parsed = new Date(`${ymd}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) return null;
  if (parsed.toISOString().slice(0, 10) !== ymd) return null;
  return ymd;
}

function parseAgeMonths(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const months = Number(value.trim());
    return Number.isFinite(months) ? months : null;
  }
  return null;
}

function timeMs(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  return Number.isNaN(t) ? null : t;
}

function oldestOrder<T extends { createdAt: string | null; id: string }>(orders: T[]): T {
  return [...orders].sort((a, b) => {
    if (a.createdAt === b.createdAt) return a.id.localeCompare(b.id);
    if (!a.createdAt) return 1;
    if (!b.createdAt) return -1;
    return a.createdAt < b.createdAt ? -1 : 1;
  })[0]!;
}

function isOpenWork(order: PatientListOrder): boolean {
  return !isTerminalOrderStatus(order.status) && !isReleasedResultStatus(order.status);
}

function firstTestCode(order: Pick<PatientListOrder, "tests">): string {
  const test = order.tests[0];
  if (!test) return "tests";
  return test.code || test.name || "tests";
}

export function formatSexAbbrev(sex: string | null | undefined): string {
  const normalized = (sex || "").trim().toLowerCase();
  if (normalized === "female" || normalized === "f") return "F";
  if (normalized === "male" || normalized === "m") return "M";
  const raw = (sex || "").trim();
  return raw || "—";
}

export function formatPatientAge(
  input: { dob?: string | null; ageYears?: unknown; ageMonths?: unknown },
  now: Date = new Date()
): string {
  const ymd = parseDobYmd(input.dob ?? null);
  if (ymd) {
    const [year, month, day] = ymd.split("-").map(Number);
    const birth = new Date(year, month - 1, day);
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    let years = today.getFullYear() - birth.getFullYear();
    let months = today.getMonth() - birth.getMonth();
    if (today.getDate() < birth.getDate()) months -= 1;
    if (months < 0) {
      years -= 1;
      months += 12;
    }
    if (years < 0) return "—";
    if (years === 0) return `${months}m`;
    return `${years}y`;
  }
  const years = parseAgeYears(input.ageYears);
  const months = parseAgeMonths(input.ageMonths);
  if (years !== null && years >= 1) return `${Math.trunc(years)}y`;
  if (months !== null) return `${Math.trunc(months)}m`;
  if (years !== null) return `${Math.trunc(years)}y`;
  return "—";
}

export function formatSexAge(
  input: { sex?: string | null; dob?: string | null; ageYears?: unknown; ageMonths?: unknown },
  now: Date = new Date()
): string {
  const sex = formatSexAbbrev(input.sex);
  const age = formatPatientAge(input, now);
  if (sex === "—" && age === "—") return "—";
  return `${sex} · ${age}`;
}

export function formatActivityDay(iso: string): string {
  const t = timeMs(iso);
  if (t === null) return "—";
  const d = new Date(t);
  return `${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export function patientListMatchesQuery(
  patient: { labId?: string | null; name?: string | null; preferredName?: string | null; phone?: string | null },
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const digits = q.replace(/\D/g, "");
  const lab = (patient.labId || "").toLowerCase();
  const name = (patient.name || "").toLowerCase();
  const preferred = (patient.preferredName || "").toLowerCase();
  const phone = (patient.phone || "").toLowerCase();
  const phoneDigits = phone.replace(/\D/g, "");
  if (lab.includes(q) || name.includes(q) || preferred.includes(q) || phone.includes(q)) {
    return true;
  }
  return Boolean(digits && phoneDigits.includes(digits));
}

export function patientPrimaryAction(orders: PatientListOrder[]): PatientPrimaryAction {
  const open = orders.filter(isOpenWork);
  const needCollect = open.filter((order) => !interpretCollection(order).allCollected);
  if (needCollect.length > 0) {
    return { kind: "collect", label: "Collect", targetOrderId: oldestOrder(needCollect).id };
  }
  const needEnter = open.filter((order) => {
    const collected = interpretCollection(order).allCollected;
    return collected && (order.status === "pending" || order.status === "needs_correction");
  });
  if (needEnter.length > 0) {
    return { kind: "enter", label: "Enter results", targetOrderId: oldestOrder(needEnter).id };
  }
  const needReview = open.filter((order) => order.status === "results_entered");
  if (needReview.length > 0) {
    return { kind: "review", label: "Review", targetOrderId: oldestOrder(needReview).id };
  }
  if (orders.some((order) => isReleasedResultStatus(order.status))) {
    return { kind: "print", label: "Print", targetOrderId: null };
  }
  return { kind: "order", label: "Order tests", targetOrderId: null };
}

export function patientListChip(orders: PatientListOrder[]): PatientListChip {
  const action = patientPrimaryAction(orders);
  if (action.targetOrderId) {
    const target = orders.find((order) => order.id === action.targetOrderId);
    if (target) return operationalFromOrderStage(target);
  }
  if (action.kind === "print") {
    const released = orders.find((order) => isReleasedResultStatus(order.status));
    if (released) return operationalFromOrderStage(released);
  }
  const leftover = orders.find((order) => order.status === "rejected" || order.recollectionOfOrderId);
  if (leftover) return operationalFromOrderStage(leftover);
  if (orders.length === 0) return { state: "ordinary", label: "REGISTERED" };
  return { state: "queued" };
}

export function patientLastActivity(
  patientCreatedAt: string | null | undefined,
  orders: PatientListOrder[]
): string {
  type Event = { at: string; text: string };
  const events: Event[] = [];

  if (patientCreatedAt && timeMs(patientCreatedAt) !== null) {
    events.push({ at: patientCreatedAt, text: "registered" });
  }

  for (const order of orders) {
    const code = firstTestCode(order);
    const collection = interpretCollection(order);
    if (isReleasedResultStatus(order.status)) {
      const at =
        order.status === "amended"
          ? order.lastAmendedAt || order.reviewedAt || order.createdAt
          : order.reviewedAt || order.createdAt;
      if (at && timeMs(at) !== null) {
        events.push({
          at,
          text: `${code} ${order.status === "amended" ? "amended" : "released"}`,
        });
      }
    } else if (order.status === "results_entered" && order.resultsEnteredAt) {
      events.push({ at: order.resultsEnteredAt, text: `${code} results entered` });
    } else if (collection.allCollected && collection.latestCollectedAt) {
      events.push({ at: collection.latestCollectedAt, text: `${code} collected` });
    } else if (order.createdAt && timeMs(order.createdAt) !== null) {
      events.push({ at: order.createdAt, text: `${code} ordered` });
    }
  }

  if (events.length === 0) return "—";
  events.sort((a, b) => (timeMs(a.at) ?? 0) - (timeMs(b.at) ?? 0));
  const latest = events[events.length - 1]!;
  return `${formatActivityDay(latest.at)} · ${latest.text}`;
}

export function patientRecordHref(patientId: string): string {
  return `/patients/${patientId}`;
}

export function primaryActionHref(patientId: string, action: PatientPrimaryAction): string | null {
  switch (action.kind) {
    case "order":
      return `/orders/new/${patientId}`;
    case "collect":
    case "enter":
    case "review":
      return action.targetOrderId ? `/orders/${action.targetOrderId}` : null;
    case "print":
      return `/patients/${patientId}/print`;
    default:
      return null;
  }
}

export function canPerformPrimaryAction(
  kind: PatientPrimaryKind,
  perms: {
    canOrder: boolean;
    canCollect: boolean;
    canEnter: boolean;
    canReview: boolean;
  }
): boolean {
  switch (kind) {
    case "order":
      return perms.canOrder;
    case "collect":
      return perms.canCollect;
    case "enter":
      return perms.canEnter;
    case "review":
      return perms.canReview;
    case "print":
      return true;
    default:
      return false;
  }
}
