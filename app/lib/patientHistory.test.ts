import { describe, expect, it } from "vitest";
import { PRINT_DISCLOSURE_ACTION } from "./provisionalReport";
import { TEST_CATALOG } from "./testCatalog";
import {
  CUMULATIVE_ALIGNMENT_NOTE,
  HISTORY_AMENDMENT_FOOTNOTE_HEADING,
  HISTORY_CUMULATIVE_ROWS_PER_PAGE,
  HISTORY_READONLY_NOTE,
  HISTORY_VISIT_PARAMS_PER_PAGE,
  ORDER_LAB_ID_FALLBACK_NOTE,
  allHistoryOrderIds,
  cumulativeJoinKey,
  formatHistoryDay,
  formatHistoryPageLine,
  formatHistoryReleaser,
  historyAmendmentFootnotes,
  historyCumulativeColumns,
  historyCumulativeRows,
  historyDateRangeLabel,
  historyDisclosureDetail,
  historyHasUnsynced,
  historyPrintPages,
  historyVisitParameters,
  historyVisitPrintSlices,
  historyVisitRows,
  namedHistoryLabIds,
  paginateByWeight,
  patientHistoryHref,
  releasedHistoryOrders,
  resolvePrintOrders,
  toggleSelectedId,
  visitPrintSliceWeight,
  type HistoryOrderInput,
} from "./patientHistory";

const FBC = TEST_CATALOG.find((row) => row.code === "FBC")!;
const HB = TEST_CATALOG.find((row) => row.code === "HB")!;
const MAL = TEST_CATALOG.find((row) => row.code === "MAL-RDT")!;

function order(partial: Partial<HistoryOrderInput> & Pick<HistoryOrderInput, "id">): HistoryOrderInput {
  return {
    status: "approved",
    createdAt: "2026-09-04T08:00:00.000Z",
    tests: [{ code: "FBC", name: "Full Blood Count" }],
    results: { FBC: { "Haemoglobin (Hb)": "9.1", "White Blood Cells (WBC)": "7.4" } },
    reviewedBy: "a.drammeh@clinic.test",
    reviewedAt: "2026-09-04T10:00:00.000Z",
    ...partial,
  };
}

describe("history query surface", () => {
  it("keeps only approved and amended orders, newest first", () => {
    const rows = releasedHistoryOrders([
      order({ id: "old", createdAt: "2026-07-14T08:00:00.000Z" }),
      order({ id: "pending", status: "pending", createdAt: "2026-09-05T08:00:00.000Z" }),
      order({ id: "entered", status: "results_entered" }),
      order({ id: "rejected", status: "rejected" }),
      order({ id: "amended", status: "amended", createdAt: "2026-08-28T08:00:00.000Z" }),
      order({ id: "new", createdAt: "2026-09-04T08:00:00.000Z" }),
    ]);
    expect(rows.map((row) => row.id)).toEqual(["new", "amended", "old"]);
  });
});

describe("visit rows", () => {
  it("lists date, tests, released, and formatted releaser", () => {
    const [row] = historyVisitRows([
      order({
        id: "o1",
        tests: [
          { code: "FBC", name: "Full Blood Count" },
          { code: "MAL-RDT", name: "Malaria RDT" },
        ],
      }),
    ]);
    expect(row.dateLabel).toBe(formatHistoryDay("2026-09-04T08:00:00.000Z"));
    expect(row.testNames).toBe("Full Blood Count, Malaria RDT");
    expect(row.statusLabel).toBe("Released");
    expect(row.amended).toBe(false);
    expect(row.releaserLabel).toBe("A. DRAMMEH");
  });

  it("marks the current amendment version and date without hiding the current values", () => {
    const [row] = historyVisitRows([
      order({
        id: "o2",
        status: "amended",
        lastAmendedAt: "2026-09-05T09:00:00.000Z",
        lastAmendedBy: "m.faal@clinic.test",
        resultVersions: [
          {
            version: 1,
            values: { FBC: { "Haemoglobin (Hb)": "11.2" } },
            releasedBy: "a.drammeh@clinic.test",
            releasedAt: "2026-09-04T10:00:00.000Z",
          },
          {
            version: 2,
            values: { FBC: { "Haemoglobin (Hb)": "9.1" } },
            releasedBy: "m.faal@clinic.test",
            releasedAt: "2026-09-05T09:00:00.000Z",
            amendedBy: "m.faal@clinic.test",
          },
        ],
        results: { FBC: { "Haemoglobin (Hb)": "9.1" } },
      }),
    ]);
    expect(row.amended).toBe(true);
    expect(row.version).toBe(2);
    expect(row.amendmentDateLabel).toBe(formatHistoryDay("2026-09-05T09:00:00.000Z"));
    expect(row.releaserLabel).toBe("M. FAAL");
    expect(historyVisitParameters(row, [FBC])[0]?.value).toBe("9.1");
  });
});

describe("cumulative alignment", () => {
  it("lines up the same testCode + parameter name across visits", () => {
    const orders = [
      order({
        id: "jul",
        createdAt: "2026-07-14T08:00:00.000Z",
        results: { FBC: { "Haemoglobin (Hb)": "11.2" } },
      }),
      order({
        id: "aug",
        createdAt: "2026-08-28T08:00:00.000Z",
        results: { FBC: { "Haemoglobin (Hb)": "10.4" } },
      }),
      order({
        id: "sep",
        createdAt: "2026-09-04T08:00:00.000Z",
        results: { FBC: { "Haemoglobin (Hb)": "9.1" } },
      }),
    ];
    const columns = historyCumulativeColumns(orders);
    expect(columns.map((col) => col.orderId)).toEqual(["jul", "aug", "sep"]);
    const hb = historyCumulativeRows(orders, [FBC]).find((row) => row.parameter === "Haemoglobin (Hb)");
    expect(hb?.key).toBe(cumulativeJoinKey("FBC", "Haemoglobin (Hb)", "haemoglobin"));
    expect(hb?.label).toBe("Haemoglobin (Hb)");
    expect(hb?.values.jul.value).toBe("11.2");
    expect(hb?.values.aug.value).toBe("10.4");
    expect(hb?.values.sep.value).toBe("9.1");
  });

  it("joins FBC and standalone HB haemoglobin on shared analyteId", () => {
    const orders = [
      order({
        id: "fbc",
        tests: [{ code: "FBC", name: "Full Blood Count" }],
        results: { FBC: { "Haemoglobin (Hb)": "11.2" } },
      }),
      order({
        id: "hb",
        createdAt: "2026-08-28T08:00:00.000Z",
        tests: [{ code: "HB", name: "Haemoglobin estimation" }],
        results: { HB: { "Haemoglobin (Hb)": "10.4" } },
      }),
    ];
    const rows = historyCumulativeRows(orders, [FBC, HB]);
    const hbRows = rows.filter((row) => row.parameter === "Haemoglobin (Hb)");
    expect(hbRows).toHaveLength(1);
    expect(hbRows[0]?.analyteId).toBe("haemoglobin");
    expect(hbRows[0]?.label).toBe("Haemoglobin (Hb)");
    expect(hbRows[0]?.values.fbc.value).toBe("11.2");
    expect(hbRows[0]?.values.hb.value).toBe("10.4");
    expect(CUMULATIVE_ALIGNMENT_NOTE).toMatch(/analyteId/i);
  });

  it("falls back to naming the source test when analyteId is absent", () => {
    const bare = {
      ...FBC,
      parameters: FBC.parameters.map((param) =>
        param.name === "Platelets" ? { ...param, analyteId: null } : param
      ),
    };
    const orders = [
      order({
        id: "o1",
        results: { FBC: { "Haemoglobin (Hb)": "11.2", Platelets: "210" } },
      }),
    ];
    const rows = historyCumulativeRows(orders, [bare]);
    expect(rows.find((row) => row.parameter === "Haemoglobin (Hb)")?.label).toBe("Haemoglobin (Hb)");
    expect(rows.find((row) => row.parameter === "Platelets")?.label).toBe("Platelets (FBC)");
  });

  it("keeps generic Result parameters on different tests apart", () => {
    const sickle = TEST_CATALOG.find((row) => row.code === "SICKLE")!;
    const rows = historyCumulativeRows(
      [
        order({
          id: "m",
          tests: [{ code: "MAL-RDT", name: "Malaria RDT" }],
          results: { "MAL-RDT": { Result: "Positive" } },
        }),
        order({
          id: "s",
          createdAt: "2026-08-01T08:00:00.000Z",
          tests: [{ code: "SICKLE", name: "Sickle cell testing" }],
          results: { SICKLE: { Result: "Negative" } },
        }),
      ],
      [MAL, sickle]
    );
    const resultRows = rows.filter((row) => row.parameter === "Result");
    expect(resultRows).toHaveLength(2);
    expect(resultRows.map((row) => row.label).sort()).toEqual([
      "Malaria Rapid Diagnostic Test",
      "Sickle cell testing",
    ]);
  });

  it("lists amendment footnotes for amended cumulative values", () => {
    const orders = [
      order({
        id: "o2",
        status: "amended",
        createdAt: "2026-07-14T08:00:00.000Z",
        lastAmendedAt: "2026-08-02T09:00:00.000Z",
        lastAmendedBy: "m.faal@clinic.test",
        resultVersions: [
          {
            version: 1,
            values: { FBC: { "Haemoglobin (Hb)": "11.2" } },
            releasedBy: "a.drammeh@clinic.test",
            releasedAt: "2026-07-14T10:00:00.000Z",
          },
          {
            version: 2,
            values: { FBC: { "Haemoglobin (Hb)": "9.1" } },
            releasedBy: "m.faal@clinic.test",
            releasedAt: "2026-08-02T09:00:00.000Z",
            amendedBy: "m.faal@clinic.test",
          },
        ],
        results: { FBC: { "Haemoglobin (Hb)": "9.1" } },
      }),
    ];
    const lines = historyAmendmentFootnotes(orders, [FBC]);
    expect(HISTORY_AMENDMENT_FOOTNOTE_HEADING).toBe("* Amended values");
    expect(lines.some((line) => line.includes("Haemoglobin (Hb)"))).toBe(true);
    expect(lines[0]).toContain("amended");
    expect(lines[0]).toContain("v2");
  });
});

describe("print selection and disclosure", () => {
  it("names the patient Lab ID and each disclosed order in human-readable form", () => {
    const orders = [
      order({ id: "o1", patientLabId: "LF-20260904-0031" }),
      order({ id: "o2", createdAt: "2026-08-28T08:00:00.000Z", patientLabId: "LF-20260904-0031" }),
    ];
    const selected = toggleSelectedId(["o1"], "o2");
    expect(selected).toEqual(["o1", "o2"]);
    expect(resolvePrintOrders(orders, ["o2"], "selected").map((row) => row.id)).toEqual(["o2"]);
    expect(resolvePrintOrders(orders, ["o2"], "all").map((row) => row.id)).toEqual(["o1", "o2"]);
    expect(allHistoryOrderIds(orders)).toEqual(["o1", "o2"]);

    const detail = historyDisclosureDetail({
      labId: "LF-20260904-0031",
      patientId: "patient-doc-1",
      orders: resolvePrintOrders(orders, ["o1", "o2"], "all"),
      layout: "visit",
      pageCount: 4,
    });
    expect(detail.patientLabId).toBe("LF-20260904-0031");
    expect(detail.labIdMissing).toBeUndefined();
    expect(detail.orderLabIds).toEqual([
      `LF-20260904-0031 · ${formatHistoryDay("2026-08-28T08:00:00.000Z")} (${ORDER_LAB_ID_FALLBACK_NOTE})`,
      `LF-20260904-0031 · ${formatHistoryDay("2026-09-04T08:00:00.000Z")} (${ORDER_LAB_ID_FALLBACK_NOTE})`,
    ]);
    expect(detail.orderIds).toEqual(["o2", "o1"]);
    expect(detail.cumulative).toBe(false);
    expect(detail.pageCount).toBe(4);
    expect(detail.disclosureAction).toBe(PRINT_DISCLOSURE_ACTION);
    expect(historyDateRangeLabel(orders)).toContain("2026");
  });

  it("flags a missing patient Lab ID instead of writing an empty disclosure list", () => {
    const orders = [order({ id: "o1" }), order({ id: "o2", createdAt: "2026-08-28T08:00:00.000Z" })];
    const detail = historyDisclosureDetail({
      labId: "  ",
      patientId: "patient-doc-missing-lab",
      orders,
      layout: "cumulative",
      pageCount: 2,
    });
    expect(detail.patientLabId).toBe("patient-doc-missing-lab");
    expect(detail.labIdMissing).toBe(true);
    expect(detail.orderLabIds).toEqual([
      `patient-doc-missing-lab · ${formatHistoryDay("2026-08-28T08:00:00.000Z")} (${ORDER_LAB_ID_FALLBACK_NOTE})`,
      `patient-doc-missing-lab · ${formatHistoryDay("2026-09-04T08:00:00.000Z")} (${ORDER_LAB_ID_FALLBACK_NOTE})`,
    ]);
    expect(detail.orderLabIds).not.toEqual([]);
    expect(detail.cumulative).toBe(true);
    expect(detail.pageCount).toBe(2);
    expect(namedHistoryLabIds("  ")).toEqual([]);
  });

  it("treats unsynced released orders as provisional, not hidden", () => {
    const orders = [order({ id: "offline", notYetSynced: true })];
    expect(historyHasUnsynced(orders)).toBe(true);
    const detail = historyDisclosureDetail({
      labId: "LF-1",
      patientId: "p1",
      orders,
      layout: "cumulative",
      pageCount: 1,
    });
    expect(detail.provisional).toBe(true);
    expect(detail.provisionalOrderIds).toEqual(["offline"]);
    expect(detail.orderLabIds).toEqual([
      `LF-1 · ${formatHistoryDay("2026-09-04T08:00:00.000Z")} (${ORDER_LAB_ID_FALLBACK_NOTE})`,
    ]);
  });
});

describe("print pages", () => {
  it("stamps Page n of m on every assembled sheet", () => {
    const pages = historyPrintPages(paginateByWeight(["a", "b", "c", "d"], () => 1, 2));
    expect(pages.map((page) => formatHistoryPageLine(page.page, page.of))).toEqual([
      "Page 1 of 2",
      "Page 2 of 2",
    ]);
  });

  it("caps visit and cumulative chunks below measured A4 overflow", () => {
    // Headless Chrome A4 fixtures (provisional header + long names): visit weight
    // overflowed at 16; cumulative rows at 18. Caps are ~80% of the last safe fit.
    expect(HISTORY_VISIT_PARAMS_PER_PAGE).toBe(12);
    expect(HISTORY_CUMULATIVE_ROWS_PER_PAGE).toBe(13);
    expect(HISTORY_VISIT_PARAMS_PER_PAGE).toBeLessThan(16);
    expect(HISTORY_CUMULATIVE_ROWS_PER_PAGE).toBeLessThan(18);
  });

  it("assigns Page n of m where m equals sheet count for a four-sheet history", () => {
    const items = Array.from({ length: HISTORY_CUMULATIVE_ROWS_PER_PAGE * 4 }, (_, i) => `row-${i}`);
    const sheets = historyPrintPages(
      paginateByWeight(items, () => 1, HISTORY_CUMULATIVE_ROWS_PER_PAGE)
    );
    expect(sheets).toHaveLength(4);
    expect(sheets.every((sheet) => sheet.of === 4)).toBe(true);
    expect(sheets.map((sheet) => formatHistoryPageLine(sheet.page, sheet.of))).toEqual([
      "Page 1 of 4",
      "Page 2 of 4",
      "Page 3 of 4",
      "Page 4 of 4",
    ]);
  });

  it("splits oversized visits so no print slice exceeds the page param budget", () => {
    const params = Object.fromEntries(
      FBC.parameters.map((param, index) => [param.name, String(index + 1)])
    );
    const ua = TEST_CATALOG.find((row) => row.code === "UA")!;
    const uaParams = Object.fromEntries(ua.parameters.map((param, index) => [param.name, `u${index}`]));
    const [visit] = historyVisitRows([
      order({
        id: "big",
        tests: [
          { code: "FBC", name: "Full Blood Count" },
          { code: "UA", name: "Urinalysis" },
        ],
        results: { FBC: params, UA: uaParams },
      }),
    ]);
    const total = historyVisitParameters(visit, [FBC, ua]).length;
    expect(total).toBeGreaterThan(HISTORY_VISIT_PARAMS_PER_PAGE);
    const slices = historyVisitPrintSlices([visit], [FBC, ua]);
    expect(slices.length).toBeGreaterThan(1);
    expect(slices.every((slice) => slice.params.length <= HISTORY_VISIT_PARAMS_PER_PAGE)).toBe(true);
    expect(slices.reduce((sum, slice) => sum + slice.params.length, 0)).toBe(total);

    const sheets = historyPrintPages(
      paginateByWeight(slices, visitPrintSliceWeight, HISTORY_VISIT_PARAMS_PER_PAGE)
    );
    expect(sheets.every((sheet) => sheet.items.reduce((sum, slice) => sum + visitPrintSliceWeight(slice), 0) <= HISTORY_VISIT_PARAMS_PER_PAGE)).toBe(
      true
    );
    expect(sheets.length).toBeGreaterThanOrEqual(2);
  });
});

describe("route and read-only", () => {
  it("lives on a separate history route", () => {
    expect(patientHistoryHref("abc")).toBe("/patients/abc/history");
    expect(HISTORY_READONLY_NOTE).toMatch(/read-only/i);
  });
});
