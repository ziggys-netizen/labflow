import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  DAILY_TEST_VALUE_ROLLUPS,
  ROLLUP_ALLOWED_KEYS,
  ROLLUP_PATIENT_LINKED_KEYS,
  catalogPriceIndex,
  formatTestValue,
  localDateKey,
  parseDailyTestValueRollup,
  releasedOrderContribution,
  rollupDocumentId,
  rollupHasPatientLinkedFields,
  rollupMergeFields,
} from "./dailyTestValueRollup";

const RULES = readFileSync(join(dirname(fileURLToPath(import.meta.url)), "..", "..", "firestore.rules"), "utf8");

const PRICES = catalogPriceIndex([
  { code: "FBC", name: "Full Blood Count", price: 100 },
  { code: "MP", name: "Malaria parasite", price: 50 },
]);

function contribute(
  overrides: Partial<Parameters<typeof releasedOrderContribution>[0]> = {}
) {
  return releasedOrderContribution({
    clinicId: "clinicA",
    releasedAt: new Date(2026, 7, 27, 15, 0, 0),
    fromStatus: "results_entered",
    tests: [
      { code: "FBC", name: "Full Blood Count" },
      { code: "MP", name: "Malaria parasite" },
    ],
    prices: PRICES,
    ...overrides,
  });
}

describe("releasedOrderContribution", () => {
  it("counts at first release using catalogue prices", () => {
    const row = contribute();
    expect(row).toEqual({
      clinicId: "clinicA",
      date: localDateKey(new Date(2026, 7, 27, 15, 0, 0)),
      testCount: 2,
      valueOfTestsOrdered: 150,
      lines: [
        { code: "FBC", name: "Full Blood Count", count: 1, value: 100 },
        { code: "MP", name: "Malaria parasite", count: 1, value: 50 },
      ],
    });
  });

  it("does not count an order that was never released", () => {
    expect(contribute({ fromStatus: "pending" })).toBeNull();
    expect(contribute({ fromStatus: "results_entered", tests: [] })).toBeNull();
  });

  it("does not count a haemolysed or otherwise rejected sample", () => {
    expect(contribute({ fromStatus: "rejected" })).toBeNull();
    expect(contribute({ fromStatus: "cancelled" })).toBeNull();
  });

  it("does not count a recollection of an episode that already carried a charge", () => {
    expect(
      contribute({
        recollectionOfOrderId: "order-original",
        episodeAlreadyCharged: true,
      })
    ).toBeNull();
  });

  it("counts a recollection after rejection — that is the delivered test", () => {
    const row = contribute({
      recollectionOfOrderId: "order-rejected",
      episodeAlreadyCharged: false,
    });
    expect(row?.testCount).toBe(2);
    expect(row?.valueOfTestsOrdered).toBe(150);
  });

  it("does not count a second apply of the same release", () => {
    expect(contribute({ valueRollupAppliedAt: "2026-08-27T11:00:00.000Z" })).toBeNull();
  });

  it("does not put patient or order fields on the contribution", () => {
    const row = contribute();
    expect(row).not.toBeNull();
    expect(rollupHasPatientLinkedFields(row as unknown as Record<string, unknown>)).toBe(false);
    expect(Object.keys(row!)).toEqual(["clinicId", "date", "testCount", "valueOfTestsOrdered", "lines"]);
  });
});

describe("rollupMergeFields", () => {
  it("writes only aggregate keys — no patient-linked fields", () => {
    const contribution = contribute();
    expect(contribution).not.toBeNull();
    const payload = rollupMergeFields(contribution!, "2026-08-27T11:00:00.000Z", (n) => ({ inc: n }));
    expect(rollupHasPatientLinkedFields(payload)).toBe(false);
    for (const key of Object.keys(payload)) {
      expect(ROLLUP_ALLOWED_KEYS, key).toContain(key);
      expect(ROLLUP_PATIENT_LINKED_KEYS, key).not.toContain(key);
    }
  });

  it("nests byTest as a real map — not dotted field-path keys", () => {
    // set(ref, data, {merge:true}) takes a dotted key like "byTest.FBC.count"
    // literally; it does not flatten into a nested path the way updateDoc()
    // does. A real nested object is required for Firestore to merge it
    // under byTest, and for the security rules' `data.byTest is map` check.
    const contribution = contribute();
    expect(contribution).not.toBeNull();
    const payload = rollupMergeFields(contribution!, "2026-08-27T11:00:00.000Z", (n) => ({ inc: n }));
    expect(Object.keys(payload).some((key) => key.includes("."))).toBe(false);
    expect(payload.byTest).toBeTypeOf("object");
    const byTest = payload.byTest as Record<string, unknown>;
    for (const line of contribution!.lines) {
      expect(byTest[line.code]).toMatchObject({ code: line.code, name: line.name });
    }
  });
});

describe("parseDailyTestValueRollup", () => {
  it("reads counts by test code and ignores unknown extra fields", () => {
    const parsed = parseDailyTestValueRollup("clinicA_2026-08-27", {
      clinicId: "clinicA",
      date: "2026-08-27",
      testCount: 2,
      valueOfTestsOrdered: 150,
      patientName: "should never be shown",
      byTest: {
        FBC: { code: "FBC", name: "Full Blood Count", count: 1, value: 100 },
        MP: { code: "MP", name: "Malaria parasite", count: 1, value: 50 },
      },
    });
    expect(parsed?.testCount).toBe(2);
    expect(parsed?.valueOfTestsOrdered).toBe(150);
    expect(parsed?.byTest.map((line) => line.code)).toEqual(["FBC", "MP"]);
  });
});

describe("helpers", () => {
  it("builds a clinic-and-day document id", () => {
    expect(rollupDocumentId("clinicA", "2026-08-27")).toBe("clinicA_2026-08-27");
  });

  it("formats implied catalogue value without a currency word", () => {
    expect(formatTestValue(150)).toMatch(/150/);
    expect(formatTestValue(150).toLowerCase()).not.toContain("revenue");
    expect(formatTestValue(150).toLowerCase()).not.toContain("income");
  });
});

describe("firestore.rules — accounts and daily rollups", () => {
  it("defines dailyTestValueRollups and keeps accounts off orders", () => {
    expect(RULES).toContain(`match /${DAILY_TEST_VALUE_ROLLUPS}/{rollupId}`);
    expect(RULES).toContain("function isAccountsOfficer");
    expect(RULES).toContain("patientDataGet");
    expect(RULES).toMatch(/function patientDataGet\([\s\S]*?\!isAccountsOfficer\(\)/);
    expect(RULES).toMatch(/match \/orders\/\{id\}[\s\S]{0,180}patientDataGet\(\)/);
    expect(RULES).toMatch(/match \/patients\/\{id\}[\s\S]{0,180}patientDataGet\(\)/);
    expect(RULES).not.toMatch(/allow (get|list): if isAccountsOfficer\(\)/);
  });
});
