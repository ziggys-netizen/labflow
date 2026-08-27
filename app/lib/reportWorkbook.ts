import * as XLSX from "@e965/xlsx";
import {
  INVENTORY_HEADERS,
  ORDER_HEADERS,
  PATIENT_HEADERS,
  RESULT_HEADERS,
  inventoryExportRows,
  orderExportRows,
  patientExportRows,
  resultExportRows,
  type ReportType,
} from "./reportExport";

function dateNumberFormat(value: Date): string {
  const dateOnly =
    value.getUTCHours() === 0 &&
    value.getUTCMinutes() === 0 &&
    value.getUTCSeconds() === 0 &&
    value.getUTCMilliseconds() === 0;
  return dateOnly ? "yyyy-mm-dd" : "yyyy-mm-dd hh:mm";
}

export function workbookToBuffer(sheetName: string, headers: string[], rows: unknown[][]): Buffer {
  const ws = XLSX.utils.aoa_to_sheet([headers, ...rows], { cellDates: true });
  const ref = ws["!ref"] || "A1";
  const range = XLSX.utils.decode_range(ref);
  ws["!cols"] = headers.map((header, index) => {
    let width = header.length;
    for (const row of rows) {
      const cell = row[index];
      const len = cell instanceof Date ? 19 : String(cell ?? "").length;
      if (len > width) width = len;
    }
    return { wch: Math.min(42, Math.max(14, width + 1)) };
  });
  for (let col = range.s.c; col <= range.e.c; col++) {
    const headerCell = ws[XLSX.utils.encode_cell({ r: 0, c: col })];
    if (headerCell) headerCell.s = { font: { bold: true } };
  }
  for (let row = 1; row <= range.e.r; row++) {
    for (let col = range.s.c; col <= range.e.c; col++) {
      const cell = ws[XLSX.utils.encode_cell({ r: row, c: col })];
      if (!cell) continue;
      if (cell.v instanceof Date || cell.t === "d") {
        cell.t = "d";
        cell.v = cell.v instanceof Date ? cell.v : new Date(cell.v as string);
        cell.z = dateNumberFormat(cell.v);
      }
    }
  }
  ws["!autofilter"] = { ref };
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName.slice(0, 31));
  return XLSX.write(wb, { type: "buffer", bookType: "xlsx", cellDates: true }) as Buffer;
}

export function buildReportWorkbook(
  reportType: ReportType,
  docs: { id: string; data: Record<string, unknown> }[],
  namesByPatientId?: Map<string, string>
): { buffer: Buffer; rowCount: number } {
  const sheets: Record<ReportType, { name: string; headers: string[]; rows: unknown[][] }> = {
    patients: { name: "Patients", headers: PATIENT_HEADERS, rows: patientExportRows(docs) },
    orders: { name: "Orders", headers: ORDER_HEADERS, rows: orderExportRows(docs, namesByPatientId) },
    results: { name: "Results", headers: RESULT_HEADERS, rows: resultExportRows(docs, namesByPatientId) },
    inventory: { name: "Inventory", headers: INVENTORY_HEADERS, rows: inventoryExportRows(docs) },
  };
  const sheet = sheets[reportType];
  return {
    buffer: workbookToBuffer(sheet.name, sheet.headers, sheet.rows),
    rowCount: sheet.rows.length,
  };
}
