import { describe, expect, it } from "vitest";
import { formatHeaderIdentity, formatHeaderName, isNavActive } from "./headerIdentity";

describe("formatHeaderName", () => {
  it("shortens a full name to initial plus last, uppercase", () => {
    expect(formatHeaderName("Binta Sanneh")).toBe("B. SANNEH");
  });

  it("uppercases a single given name", () => {
    expect(formatHeaderName("Sanneh")).toBe("SANNEH");
  });

  it("falls back to username, then the set-username prompt", () => {
    expect(formatHeaderName(null, "bsanneh")).toBe("BSANNEH");
    expect(formatHeaderName("  ", "")).toBe("SET USERNAME");
  });
});

describe("formatHeaderIdentity", () => {
  it("joins name and role without inventing fields", () => {
    expect(formatHeaderIdentity("Binta Sanneh", "bsanneh", "Technician")).toBe(
      "B. SANNEH · TECHNICIAN"
    );
  });

  it("omits an empty role rather than a placeholder", () => {
    expect(formatHeaderIdentity("Binta Sanneh", null, "—")).toBe("B. SANNEH");
  });
});

describe("isNavActive", () => {
  it("keeps Patients and Recycle bin distinct", () => {
    expect(isNavActive("/patients", "/patients")).toBe(true);
    expect(isNavActive("/patients/abc/print", "/patients")).toBe(true);
    expect(isNavActive("/patients/deleted", "/patients")).toBe(false);
    expect(isNavActive("/patients/deleted", "/patients/deleted")).toBe(true);
  });

  it("treats nested store routes as Store", () => {
    expect(isNavActive("/inventory/items", "/inventory")).toBe(true);
    expect(isNavActive("/orders", "/inventory")).toBe(false);
  });
});
