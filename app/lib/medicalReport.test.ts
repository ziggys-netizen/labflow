import { describe, expect, it } from "vitest";
import {
  amendReport,
  cloneReportContent,
  currentMedicalReportVersion,
  emptyReportContent,
  finalizeReport,
  parseMedicalReportVersions,
  reportContentChanged,
  reportContentComplete,
  REPORT_AMENDMENT_REASON_MESSAGE,
  REPORT_INCOMPLETE_MESSAGE,
  REPORT_NO_CHANGE_MESSAGE,
  REPORT_NOT_FINAL_MESSAGE,
} from "./medicalReport";

const ACTOR = { uid: "u1", email: "manager@clinic.test", role: "lab_manager", shift: null };

const COMPLETE = {
  chiefComplaint: "Fever for 3 days",
  findings: "Temp 38.9C, no focal signs",
  assessment: "Suspected malaria",
  plan: "Start ACT, review in 3 days",
};

describe("reportContentComplete", () => {
  it("requires all four fields", () => {
    expect(reportContentComplete(emptyReportContent())).toBe(false);
    expect(reportContentComplete(COMPLETE)).toBe(true);
    expect(reportContentComplete({ ...COMPLETE, plan: "  " })).toBe(false);
  });
});

describe("reportContentChanged", () => {
  it("detects a change in any field, ignoring surrounding whitespace", () => {
    expect(reportContentChanged(COMPLETE, COMPLETE)).toBe(false);
    expect(reportContentChanged(COMPLETE, { ...COMPLETE, plan: `${COMPLETE.plan} ` })).toBe(false);
    expect(reportContentChanged(COMPLETE, { ...COMPLETE, plan: "Different plan" })).toBe(true);
  });
});

describe("cloneReportContent", () => {
  it("drops unknown fields and defaults missing ones to empty strings", () => {
    const cloned = cloneReportContent({ chiefComplaint: "Cough", extra: "ignored" } as never);
    expect(cloned).toEqual({ chiefComplaint: "Cough", findings: "", assessment: "", plan: "" });
  });
});

describe("finalizeReport", () => {
  it("refuses to finalize an incomplete report", () => {
    const result = finalizeReport({ content: { ...COMPLETE, findings: "" }, actor: ACTOR });
    expect(result).toEqual({ ok: false, error: REPORT_INCOMPLETE_MESSAGE });
  });

  it("locks the report as version 1 with author and timestamp", () => {
    const result = finalizeReport({ content: COMPLETE, actor: ACTOR, now: "2026-09-11T10:00:00.000Z" });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.version.version).toBe(1);
    expect(result.updates.status).toBe("final");
    expect(result.updates.currentVersion).toBe(1);
    expect(result.updates.finalizedByUid).toBe("u1");
    expect(result.updates.finalizedAt).toBe("2026-09-11T10:00:00.000Z");
    expect((result.updates.versions as unknown[]).length).toBe(1);
  });
});

describe("amendReport", () => {
  const finalized = finalizeReport({ content: COMPLETE, actor: ACTOR, now: "2026-09-11T10:00:00.000Z" });
  if (!finalized.ok) throw new Error("setup failed");
  const versions = finalized.updates.versions;

  it("refuses to amend a draft", () => {
    const result = amendReport({
      status: "draft",
      versions: [],
      currentContent: COMPLETE,
      newContent: { ...COMPLETE, plan: "New plan" },
      reasonCode: "clinical_update",
      actor: ACTOR,
    });
    expect(result).toEqual({ ok: false, error: REPORT_NOT_FINAL_MESSAGE });
  });

  it("refuses to amend with no field changes", () => {
    const result = amendReport({
      status: "final",
      versions,
      currentContent: COMPLETE,
      newContent: COMPLETE,
      reasonCode: "clinical_update",
      actor: ACTOR,
    });
    expect(result).toEqual({ ok: false, error: REPORT_NO_CHANGE_MESSAGE });
  });

  it("requires a reason code", () => {
    const result = amendReport({
      status: "final",
      versions,
      currentContent: COMPLETE,
      newContent: { ...COMPLETE, plan: "New plan" },
      reasonCode: null,
      actor: ACTOR,
    });
    expect(result).toEqual({ ok: false, error: REPORT_AMENDMENT_REASON_MESSAGE });
  });

  it("appends version 2 with the reason recorded", () => {
    const result = amendReport({
      status: "final",
      versions,
      currentContent: COMPLETE,
      newContent: { ...COMPLETE, plan: "Refer to district hospital" },
      reasonCode: "clinical_update",
      actor: { ...ACTOR, uid: "u2", email: "owner@clinic.test", role: "owner" },
      now: "2026-09-12T08:00:00.000Z",
    });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.previousVersion).toBe(1);
    expect(result.newVersion).toBe(2);
    expect(result.updates.plan).toBe("Refer to district hospital");
    expect(result.updates.lastAmendedByUid).toBe("u2");
    const parsed = parseMedicalReportVersions(result.updates.versions);
    expect(parsed).toHaveLength(2);
    expect(parsed[1]?.reasonNote).toContain("Clinical update since finalizing");
  });
});

describe("parseMedicalReportVersions / currentMedicalReportVersion", () => {
  it("ignores malformed entries and sorts by version", () => {
    const parsed = parseMedicalReportVersions([
      { version: 2, content: COMPLETE, at: "2026-09-12T08:00:00.000Z" },
      { version: 1, content: COMPLETE, at: "2026-09-11T10:00:00.000Z" },
      { version: "not-a-number", at: "2026-09-13T00:00:00.000Z" },
      "garbage",
    ]);
    expect(parsed.map((v) => v.version)).toEqual([1, 2]);
    expect(currentMedicalReportVersion(parsed)?.version).toBe(2);
  });

  it("returns null for no versions", () => {
    expect(currentMedicalReportVersion([])).toBeNull();
    expect(currentMedicalReportVersion(undefined)).toBeNull();
  });
});
