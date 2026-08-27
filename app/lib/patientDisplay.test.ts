import { describe, expect, it } from "vitest";
import { patientDisplayName, resolvePatientNameById } from "./patientDisplay";

describe("patientDisplayName", () => {
  it("prefers preferredName and ignores missing docs", () => {
    expect(patientDisplayName(null)).toBe("");
    expect(patientDisplayName({ name: "Ada Lovelace" })).toBe("Ada Lovelace");
    expect(patientDisplayName({ name: "Ada Lovelace", preferredName: "Ada" })).toBe("Ada");
  });
});

describe("resolvePatientNameById", () => {
  it("reads the name from the patient map, not from an order field", () => {
    const patients = new Map([["p1", { name: "Ada Lovelace" }]]);
    expect(resolvePatientNameById("p1", patients)).toBe("Ada Lovelace");
    expect(resolvePatientNameById("missing", patients)).toBe("");
  });
});
