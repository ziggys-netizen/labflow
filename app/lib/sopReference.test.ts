import { describe, expect, it } from "vitest";
import {
  SOP_ORDER_BLOCKED,
  SOP_REVIEW_DATE_REQUIRED,
  catalogTestIsGrandfathered,
  catalogTestMayBeOrdered,
  catalogTestSaveError,
  isCalendarDate,
  orderSopBlockMessage,
  parseSopDraft,
  sanitizeSopFileName,
  sopDraftIssues,
  sopStoragePath,
  testsBlockedFromOrder,
  toSopReference,
} from "./sopReference";

const complete = {
  documentId: "SOP-FBC-001",
  title: "Full Blood Count",
  version: "3.1",
  effectiveDate: "2026-01-15",
  author: "A. Jallow",
  reviewDate: "2027-01-15",
};

describe("isCalendarDate", () => {
  it("accepts real calendar days and rejects impossible ones", () => {
    expect(isCalendarDate("2026-02-28")).toBe(true);
    expect(isCalendarDate("2026-02-30")).toBe(false);
    expect(isCalendarDate("15/01/2026")).toBe(false);
  });
});

describe("sopDraftIssues / review date", () => {
  it("requires a review date even when every other field is filled", () => {
    const issues = sopDraftIssues({ ...complete, reviewDate: "" });
    expect(issues).toContain(SOP_REVIEW_DATE_REQUIRED);
    expect(catalogTestSaveError({ sopRequired: true, sop: { ...complete, reviewDate: "" } }, { creating: true })).toBe(
      SOP_REVIEW_DATE_REQUIRED
    );
  });

  it("accepts a complete reference including review date", () => {
    expect(sopDraftIssues(complete)).toEqual([]);
  });
});

describe("grandfather vs new-test save blocking", () => {
  it("treats missing sopRequired as grandfathered (seeded, imported, live catalogue)", () => {
    expect(catalogTestIsGrandfathered({})).toBe(true);
    expect(catalogTestIsGrandfathered({ sopRequired: false })).toBe(true);
    expect(catalogTestIsGrandfathered({ sopRequired: true })).toBe(false);
  });

  it("lets a grandfathered test be saved without an SOP", () => {
    expect(catalogTestSaveError({ code: "UA", name: "Urinalysis" }, { creating: false })).toBeNull();
    expect(catalogTestSaveError({ code: "FBC" }, { creating: false })).toBeNull();
  });

  it("blocks creating a new test until the SOP reference fields are complete", () => {
    expect(catalogTestSaveError({ name: "Thyroid Function" }, { creating: true })).toBe(
      "SOP document ID is required."
    );
    expect(catalogTestSaveError({ sop: complete }, { creating: true })).toBeNull();
  });

  it("blocks saving a post-gate test that lost its SOP", () => {
    expect(catalogTestSaveError({ sopRequired: true, sop: {} }, { creating: false })).toBe(
      "SOP document ID is required."
    );
  });

  it("rejects a file-only save that has no review date or identifiers", () => {
    expect(catalogTestSaveError({ sop: {} }, { creating: false, hasFile: true })).toBe(
      "SOP document ID is required."
    );
  });

  it("rejects a partial SOP on a grandfathered row so a version is never stored unreviewed", () => {
    expect(
      catalogTestSaveError(
        { sop: { documentId: "SOP-UA", title: "Urinalysis", version: "1" } },
        { creating: false }
      )
    ).toBe("SOP effective date is required.");
  });
});

describe("order-time SOP check", () => {
  it("lets grandfathered tests without SOP stay orderable", () => {
    expect(catalogTestMayBeOrdered({ code: "UA", name: "Urinalysis" }).ok).toBe(true);
    expect(catalogTestMayBeOrdered({ code: "FBC", sopRequired: false }).ok).toBe(true);
    expect(testsBlockedFromOrder([{ code: "UA" }, { code: "HB" }])).toEqual([]);
  });

  it("rejects a new test that is missing an SOP reference", () => {
    const check = catalogTestMayBeOrdered({
      code: "TFT",
      name: "Thyroid Function Test",
      sopRequired: true,
    });
    expect(check.ok).toBe(false);
    if (!check.ok) expect(check.reason).toBe(SOP_ORDER_BLOCKED);
    expect(
      orderSopBlockMessage([
        { code: "UA", name: "Urinalysis" },
        { code: "TFT", name: "Thyroid Function Test", sopRequired: true },
      ])
    ).toBe("Cannot order without an SOP reference: Thyroid Function Test.");
  });

  it("allows ordering a new test once the reference including review date is present", () => {
    expect(
      catalogTestMayBeOrdered({
        code: "TFT",
        name: "Thyroid Function Test",
        sopRequired: true,
        sop: complete,
      }).ok
    ).toBe(true);
  });

  it("still blocks a new test whose SOP version has no review date", () => {
    expect(
      catalogTestMayBeOrdered({
        sopRequired: true,
        sop: { ...complete, reviewDate: "" },
      }).ok
    ).toBe(false);
  });
});

describe("reference payload and storage path", () => {
  it("stores the typed reference fields, not procedure text", () => {
    expect(toSopReference(parseSopDraft(complete))).toEqual(complete);
    expect(Object.keys(toSopReference(complete)).sort()).toEqual(
      ["author", "documentId", "effectiveDate", "reviewDate", "title", "version"].sort()
    );
  });

  it("keeps uploaded files under a clinic-scoped Storage path", () => {
    expect(sanitizeSopFileName("FBC SOP (final).pdf")).toBe("FBC_SOP_final_.pdf");
    expect(sopStoragePath("clinic-1", "FBC", "FBC SOP.pdf")).toBe("clinics/clinic-1/sops/FBC/FBC_SOP.pdf");
  });
});
