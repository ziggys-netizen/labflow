/**
 * Patient history is read-only / print assembly only.
 * Do not edit, amend, delete, or change status from this surface.
 *
 * Cumulative rows join only on the stored pair (testCode + parameter name).
 * There is no LOINC (or other) analyte code. Do not invent a cross-test key —
 * FBC "Haemoglobin (Hb)" and standalone HB "Haemoglobin (Hb)" stay separate.
 */

import { formatHeaderName } from "./headerIdentity";
import { formatActivityDay } from "./patientList";
import { PRINT_DISCLOSURE_ACTION, planReportPrint } from "./provisionalReport";
import {
  currentResultVersion,
  isReleasedResultStatus,
  latestAmendmentAt,
  type ResultValues,
} from "./resultAmendment";
import type { LabTest, TestParameter } from "./testCatalog";

export const HISTORY_READONLY_NOTE =
  "This page is read-only / print assembly only. It cannot edit, amend, delete, or change status.";

export const CUMULATIVE_ALIGNMENT_NOTE =
  "Columns line up only when the same catalogue test code and parameter name both match. Haemoglobin on FBC and Haemoglobin on HB are different rows. There is no shared analyte code.";

/**
 * Print chunk caps — derived from headless Chrome A4 print fixtures
 * (provisional banner + long wrapping parameter names + footer).
 * Max that stayed on one physical sheet: visit weight 15, cumulative 17.
 * Settled at ~80% so one stamped HTML sheet cannot overflow onto a second
 * physical page (which would duplicate "Page n of m").
 */
export const HISTORY_VISIT_PARAMS_PER_PAGE = 12;
export const HISTORY_CUMULATIVE_ROWS_PER_PAGE = 13;

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

export type HistoryLayout = "visit" | "cumulative";
export type HistoryPrintMode = "selected" | "all";

export type HistoryTestRef = {
  code: string;
  name?: string | null;
};

export type HistoryOrderInput = {
  id: string;
  status: string;
  createdAt: string;
  tests: HistoryTestRef[];
  results?: ResultValues | null;
  resultVersions?: unknown;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
  lastAmendedAt?: string | null;
  lastAmendedBy?: string | null;
  currentResultVersion?: number | null;
  notYetSynced?: boolean;
};

export type HistoryVisitRow = {
  orderId: string;
  createdAt: string;
  dateLabel: string;
  testNames: string;
  statusLabel: "Released";
  amended: boolean;
  version: number;
  amendmentDateLabel: string | null;
  releaserLabel: string;
  notYetSynced: boolean;
  results: ResultValues;
  tests: HistoryTestRef[];
};

export type HistoryParameterRow = {
  testCode: string;
  testName: string;
  parameter: string;
  value: string;
  unit: string;
  definition: TestParameter | null;
};

export type HistoryCumulativeColumn = {
  orderId: string;
  dateLabel: string;
  fullDateLabel: string;
  amended: boolean;
};

export type HistoryCumulativeCell = {
  orderId: string;
  value: string;
  amended: boolean;
};

export type HistoryCumulativeRow = {
  /** Stored join key only: testCode + parameter name. Not a clinical code. */
  key: string;
  testCode: string;
  testName: string;
  parameter: string;
  unit: string;
  label: string;
  values: Record<string, HistoryCumulativeCell>;
};

export function patientHistoryHref(patientId: string): string {
  return `/patients/${patientId}/history`;
}

export function cumulativeJoinKey(testCode: string, parameter: string): string {
  return `${testCode}\u0001${parameter}`;
}

export function releasedHistoryOrders<T extends { status: string; createdAt: string }>(
  orders: T[]
): T[] {
  return orders
    .filter((order) => isReleasedResultStatus(order.status))
    .sort((a, b) => {
      if (a.createdAt === b.createdAt) return 0;
      return a.createdAt < b.createdAt ? 1 : -1;
    });
}

export function formatHistoryDay(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

export function formatHistoryReleaser(value: string | null | undefined): string {
  const raw = (value || "").trim();
  if (!raw) return "—";
  const local = raw.includes("@") ? raw.slice(0, raw.indexOf("@")) : raw;
  const spaced = local.replace(/[._]+/g, " ").replace(/\s+/g, " ").trim();
  if (!spaced) return "—";
  return formatHeaderName(spaced.includes(" ") ? spaced : spaced);
}

export function historyVisitRows(orders: HistoryOrderInput[]): HistoryVisitRow[] {
  return releasedHistoryOrders(orders).map((order) => {
    const amended = order.status === "amended";
    const current = currentResultVersion(order);
    const version = current?.version ?? order.currentResultVersion ?? 1;
    const amendmentAt = amended ? latestAmendmentAt(order) : null;
    return {
      orderId: order.id,
      createdAt: order.createdAt,
      dateLabel: formatHistoryDay(order.createdAt),
      testNames:
        order.tests.map((test) => test.name?.trim() || test.code).filter(Boolean).join(", ") ||
        "No tests",
      statusLabel: "Released",
      amended,
      version,
      amendmentDateLabel: amendmentAt ? formatHistoryDay(amendmentAt) : null,
      releaserLabel: formatHistoryReleaser(amended ? order.lastAmendedBy || order.reviewedBy : order.reviewedBy),
      notYetSynced: order.notYetSynced === true,
      results: order.results || {},
      tests: order.tests,
    };
  });
}

export function historyVisitParameters(
  visit: Pick<HistoryVisitRow, "tests" | "results">,
  catalog: LabTest[]
): HistoryParameterRow[] {
  const rows: HistoryParameterRow[] = [];
  const seen = new Set<string>();

  for (const test of visit.tests) {
    const definition = catalog.find((row) => row.code === test.code);
    const values = visit.results[test.code] || {};
    const params = definition?.parameters || [];
    if (params.length === 0) {
      for (const [parameter, value] of Object.entries(values)) {
        const key = cumulativeJoinKey(test.code, parameter);
        if (seen.has(key)) continue;
        seen.add(key);
        rows.push({
          testCode: test.code,
          testName: test.name?.trim() || test.code,
          parameter,
          value,
          unit: "—",
          definition: null,
        });
      }
      continue;
    }
    for (const param of params) {
      const key = cumulativeJoinKey(test.code, param.name);
      if (seen.has(key)) continue;
      seen.add(key);
      rows.push({
        testCode: test.code,
        testName: definition?.name || test.name?.trim() || test.code,
        parameter: param.name,
        value: values[param.name] || "",
        unit: param.unit || "—",
        definition: param,
      });
    }
  }

  return rows;
}

export function historyCumulativeColumns(orders: HistoryOrderInput[]): HistoryCumulativeColumn[] {
  return historyVisitRows(orders)
    .slice()
    .reverse()
    .map((visit) => ({
      orderId: visit.orderId,
      dateLabel: formatActivityDay(visit.createdAt),
      fullDateLabel: visit.dateLabel,
      amended: visit.amended,
    }));
}

export function historyCumulativeRows(
  orders: HistoryOrderInput[],
  catalog: LabTest[]
): HistoryCumulativeRow[] {
  const visits = historyVisitRows(orders);
  const columns = historyCumulativeColumns(orders);
  const byKey = new Map<string, HistoryCumulativeRow>();

  for (const visit of visits) {
    for (const param of historyVisitParameters(visit, catalog)) {
      const key = cumulativeJoinKey(param.testCode, param.parameter);
      let row = byKey.get(key);
      if (!row) {
        row = {
          key,
          testCode: param.testCode,
          testName: param.testName,
          parameter: param.parameter,
          unit: param.unit,
          label: param.parameter,
          values: {},
        };
        byKey.set(key, row);
      }
      if (param.unit && param.unit !== "—" && row.unit === "—") row.unit = param.unit;
      row.values[visit.orderId] = {
        orderId: visit.orderId,
        value: param.value,
        amended: visit.amended,
      };
    }
  }

  const rows = [...byKey.values()].filter((row) =>
    Object.values(row.values).some((cell) => cell.value.trim())
  );
  for (const row of rows) {
    const base = row.parameter === "Result" ? row.testName : row.parameter;
    // Always name the source test. Without analyteId, FBC and HB haemoglobin
    // must not look like one broken series.
    row.label = `${base} (${row.testCode})`;
  }

  return rows.sort(
    (a, b) =>
      a.testCode.localeCompare(b.testCode) ||
      a.parameter.localeCompare(b.parameter) ||
      a.label.localeCompare(b.label)
  );
}

export function toggleSelectedId(selected: string[], id: string): string[] {
  return selected.includes(id) ? selected.filter((row) => row !== id) : [...selected, id];
}

export function allHistoryOrderIds(orders: HistoryOrderInput[]): string[] {
  return historyVisitRows(orders).map((row) => row.orderId);
}

export function resolvePrintOrders(
  orders: HistoryOrderInput[],
  selectedIds: string[],
  mode: HistoryPrintMode
): HistoryOrderInput[] {
  const released = releasedHistoryOrders(orders);
  if (mode === "all") return released;
  const chosen = new Set(selectedIds);
  return released.filter((order) => chosen.has(order.id));
}

export function historyDateRangeLabel(orders: HistoryOrderInput[]): string {
  if (orders.length === 0) return "—";
  const times = orders
    .map((order) => order.createdAt)
    .filter((iso) => !Number.isNaN(new Date(iso).getTime()))
    .sort();
  if (times.length === 0) return "—";
  const from = formatHistoryDay(times[0]);
  const to = formatHistoryDay(times[times.length - 1]);
  return from === to ? from : `${from} – ${to}`;
}

export function namedHistoryLabIds(labId: string | null | undefined): string[] {
  const id = typeof labId === "string" ? labId.trim() : "";
  return id ? [id] : [];
}

export function historyDisclosureDetail(input: {
  labId: string | null | undefined;
  orders: HistoryOrderInput[];
  layout: HistoryLayout;
}): Record<string, unknown> {
  const plan = planReportPrint(input.orders);
  return {
    labIds: namedHistoryLabIds(input.labId),
    orderIds: plan.releasedOrderIds,
    layout: input.layout,
    dateRange: historyDateRangeLabel(input.orders),
    provisional: plan.provisionalOrderIds.length > 0,
    provisionalOrderIds: plan.provisionalOrderIds,
    disclosureAction: PRINT_DISCLOSURE_ACTION,
  };
}

export function historyHasUnsynced(orders: HistoryOrderInput[]): boolean {
  return releasedHistoryOrders(orders).some((order) => order.notYetSynced === true);
}

export type HistoryVisitPrintSlice = {
  visit: HistoryVisitRow;
  params: HistoryParameterRow[];
};

/**
 * Split visits into print slices so no slice exceeds the A4 param budget.
 * Oversized single orders (many tests) would otherwise sit alone on a sheet
 * and overflow despite the page weight cap.
 */
export function historyVisitPrintSlices(
  visits: HistoryVisitRow[],
  catalog: LabTest[],
  maxParams: number = HISTORY_VISIT_PARAMS_PER_PAGE
): HistoryVisitPrintSlice[] {
  const limit = Math.max(1, maxParams);
  const slices: HistoryVisitPrintSlice[] = [];
  for (const visit of visits) {
    const params = historyVisitParameters(visit, catalog);
    if (params.length === 0) {
      slices.push({ visit, params: [] });
      continue;
    }
    for (let i = 0; i < params.length; i += limit) {
      slices.push({ visit, params: params.slice(i, i + limit) });
    }
  }
  return slices;
}

export function visitPrintSliceWeight(slice: HistoryVisitPrintSlice): number {
  return Math.max(2, slice.params.length);
}

export function paginateByWeight<T>(
  items: T[],
  weight: (item: T) => number,
  maxWeight: number
): T[][] {
  const pages: T[][] = [];
  let current: T[] = [];
  let used = 0;
  for (const item of items) {
    const w = Math.max(1, weight(item));
    if (current.length > 0 && used + w > maxWeight) {
      pages.push(current);
      current = [];
      used = 0;
    }
    current.push(item);
    used += w;
  }
  if (current.length > 0) pages.push(current);
  return pages.length > 0 ? pages : [[]];
}

export function formatHistoryPageLine(page: number, of: number): string {
  return `Page ${page} of ${of}`;
}

export function historyPrintPages<T>(chunks: T[][]): { page: number; of: number; items: T[] }[] {
  const of = Math.max(1, chunks.length);
  return (chunks.length === 0 ? [[]] : chunks).map((items, index) => ({
    page: index + 1,
    of,
    items,
  }));
}
