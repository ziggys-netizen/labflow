import { describe, expect, it } from "vitest";
import {
  GREEN_AID_CATALOGUE,
  GREEN_AID_CLINIC_ID,
  GREEN_AID_PATIENTS,
  formatGreenAidSeedRefusal,
  greenAidCatalogDocId,
  greenAidOrderDocId,
  greenAidOrderSpecs,
  greenAidPatientDocId,
  greenAidSeedRefusal,
} from "./greenAidIsolationFixtures";

describe("green Aid isolation fixtures", () => {
  it("targets the live Green Aid clinic id", () => {
    expect(GREEN_AID_CLINIC_ID).toBe("pu0QdCHByieKUmRSlAtF");
  });

  it("includes HB and SICKLE in the Green Aid catalogue", () => {
    const codes = GREEN_AID_CATALOGUE.map((row) => row.code);
    expect(codes).toContain("HB");
    expect(codes).toContain("SICKLE");
    expect(codes).toContain("UA");
    expect(codes).toContain("FBS");
  });

  it("defines adult male, adult female, and child with DOBs", () => {
    expect(GREEN_AID_PATIENTS).toHaveLength(3);
    expect(GREEN_AID_PATIENTS.map((p) => p.key).sort()).toEqual([
      "adult-female",
      "adult-male",
      "child",
    ]);
    for (const patient of GREEN_AID_PATIENTS) {
      expect(patient.dob).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(patient.labId).toMatch(/^GA-SEED-/);
    }
  });

  it("defines four orders spanning statuses including multi-specimen", () => {
    const specs = greenAidOrderSpecs();
    expect(specs).toHaveLength(4);
    expect(specs.map((s) => s.key)).toEqual([
      "awaiting-sample",
      "collected",
      "results-entered",
      "released-multi-specimen",
    ]);
    const multi = specs.find((s) => s.key === "released-multi-specimen");
    expect(multi?.status).toBe("approved");
    expect(multi?.tests.map((t) => t.specimenType).sort()).toEqual(["blood", "urine"]);
  });

  it("uses stable Green Aid document ids", () => {
    expect(greenAidCatalogDocId("HB")).toBe(`${GREEN_AID_CLINIC_ID}_HB`);
    expect(greenAidPatientDocId("adult-male")).toBe(
      `${GREEN_AID_CLINIC_ID}_ga_isolation_adult-male`
    );
    expect(greenAidOrderDocId("collected")).toBe(
      `${GREEN_AID_CLINIC_ID}_ga_isolation_collected`
    );
  });
});

describe("greenAidSeedRefusal", () => {
  it("allows seeding when no patients exist", () => {
    expect(greenAidSeedRefusal({ patientDocIds: [], labIds: [] })).toBeNull();
  });

  it("refuses when patients already exist and reports ids", () => {
    const refusal = greenAidSeedRefusal({
      patientDocIds: ["doc-a", "doc-b"],
      labIds: ["GA-SEED-AM-001", "GA-SEED-AF-001"],
    });
    expect(refusal).toEqual({
      count: 2,
      patientDocIds: ["doc-a", "doc-b"],
      labIds: ["GA-SEED-AM-001", "GA-SEED-AF-001"],
    });
    const message = formatGreenAidSeedRefusal(refusal!);
    expect(message).toContain("already has 2 patient");
    expect(message).toContain("GA-SEED-AM-001");
    expect(message).toContain("doc-a");
    expect(message).toContain("Cannot double-seed");
    expect(message).not.toMatch(/Synthetic|Male|Female|Child/i);
  });
});
