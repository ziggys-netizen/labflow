import { describe, expect, it, vi } from "vitest";
vi.mock("./firebase", () => ({ db: {}, auth: {} }));
import * as XLSX from "@e965/xlsx";
import {
  MAX_EXPORT_RANGE_DAYS,
  RANGE_CAP_MESSAGE,
  clinicScopeForExport,
  inclusiveRangeDays,
  parseExportRequest,
  parseYmd,
  toExcelDate,
} from "./reportExport";
import { buildReportWorkbook, workbookToBuffer } from "./reportWorkbook";
import { canExportData } from "./permissions";

describe("parseYmd", () => {
  it("accepts calendar dates and rejects impossible days", () => {
    expect(parseYmd("2026-01-31")).toBe("2026-01-31");
    expect(parseYmd("2026-02-31")).toBeNull();
    expect(parseYmd("21-08-2026")).toBeNull();
  });
});

describe("parseExportRequest", () => {
  it("accepts a 90-day inclusive range", () => {
    const parsed = parseExportRequest({
      startDate: "2026-01-01",
      endDate: "2026-03-31",
      reportType: "patients",
      clinicId: "forged-clinic",
      email: "attacker@example.com",
    });
    expect("error" in parsed).toBe(false);
    if ("error" in parsed) return;
    expect(parsed.dayCount).toBe(90);
    expect(parsed.reportType).toBe("patients");
    expect(parsed.startIso).toBe("2026-01-01T00:00:00.000Z");
    expect(parsed.endExclusiveIso).toBe("2026-04-01T00:00:00.000Z");
  });

  it("refuses 91 days with the PHI / timeout / Spark reason", () => {
    const parsed = parseExportRequest({
      startDate: "2026-01-01",
      endDate: "2026-04-01",
      reportType: "orders",
    });
    expect(parsed).toEqual({ error: RANGE_CAP_MESSAGE });
    expect(inclusiveRangeDays("2026-01-01", "2026-04-01")).toBe(91);
    expect(MAX_EXPORT_RANGE_DAYS).toBe(90);
  });

  it("ignores client-supplied clinicId and recipient email", () => {
    const parsed = parseExportRequest({
      startDate: "2026-08-01",
      endDate: "2026-08-07",
      reportType: "results",
      clinicId: "other-clinic",
      email: "other@example.com",
      recipient: "other@example.com",
    });
    expect("clinicId" in parsed).toBe(false);
    expect("email" in parsed).toBe(false);
    expect("recipient" in parsed).toBe(false);
  });
});

describe("clinicScopeForExport", () => {
  it("owner exports all clinics; staff need a membership clinic", () => {
    expect(clinicScopeForExport("owner", null)).toEqual({ clinicId: null, allClinics: true });
    expect(clinicScopeForExport("lab_manager", "clinic-a")).toEqual({
      clinicId: "clinic-a",
      allClinics: false,
    });
    expect(clinicScopeForExport("lab_manager", null)).toEqual({
      error: "This account is not assigned to a clinic.",
    });
  });
});

describe("canExportData gate", () => {
  it("rejects lab_supervisor and allows owner / clinic_admin / lab_manager", () => {
    expect(canExportData("lab_supervisor")).toBe(false);
    expect(canExportData("owner")).toBe(true);
    expect(canExportData("clinic_admin")).toBe(true);
    expect(canExportData("lab_manager")).toBe(true);
  });
});

describe("workbook dates", () => {
  it("writes Date values as Excel date cells", () => {
    const when = new Date("2026-08-21T08:30:00.000Z");
    const buffer = workbookToBuffer("Patients", ["Registered"], [[when]]);
    const wb = XLSX.read(buffer, { type: "buffer", cellDates: true });
    const cell = wb.Sheets.Patients.A2;
    expect(cell.t).toBe("d");
    expect(cell.v).toBeInstanceOf(Date);
  });

  it("skips soft-deleted patients", () => {
    const built = buildReportWorkbook("patients", [
      {
        id: "keep",
        data: { name: "Awa", labId: "LF-1", createdAt: "2026-08-01T00:00:00.000Z", deleted: false },
      },
      {
        id: "gone",
        data: { name: "Removed", labId: "LF-2", createdAt: "2026-08-01T00:00:00.000Z", deleted: true },
      },
    ]);
    expect(built.rowCount).toBe(1);
  });
});

describe("toExcelDate", () => {
  it("converts ISO strings and leaves blanks empty", () => {
    expect(toExcelDate("2026-08-21T12:00:00.000Z")).toBeInstanceOf(Date);
    expect(toExcelDate("")).toBe("");
    expect(toExcelDate(null)).toBe("");
  });
});
