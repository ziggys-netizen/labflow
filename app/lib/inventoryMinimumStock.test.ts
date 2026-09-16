import { describe, expect, it } from "vitest";
import { MINIMUM_STOCK_REQUIRED, hasNoReorderLevel, minimumStockError } from "./inventory";
import { validateImportRows, validateMapping, type ValidationContext } from "./migration";

describe("minimum stock is required", () => {
  it("refuses a blank level", () => {
    expect(minimumStockError("")).toBe(MINIMUM_STOCK_REQUIRED);
    expect(minimumStockError("   ")).toBe(MINIMUM_STOCK_REQUIRED);
  });

  it("refuses zero, which is what silently disabled the warning", () => {
    expect(minimumStockError("0")).toBe(MINIMUM_STOCK_REQUIRED);
    expect(minimumStockError("0.0")).toBe(MINIMUM_STOCK_REQUIRED);
  });

  it("refuses a negative level", () => {
    expect(minimumStockError("-3")).toBe(MINIMUM_STOCK_REQUIRED);
  });

  it("refuses anything that is not a whole number of packs", () => {
    expect(minimumStockError("abc")).toBe("Minimum stock must be a number.");
    expect(minimumStockError("2.5")).toBe("Minimum stock must be a whole number of packs.");
  });

  it("accepts a real reorder level", () => {
    expect(minimumStockError("1")).toBeNull();
    expect(minimumStockError("10")).toBeNull();
    expect(minimumStockError(" 12 ")).toBeNull();
    expect(minimumStockError("1,200")).toBeNull();
  });
});

describe("items saved before a minimum was required", () => {
  it("are recognised so they can be corrected", () => {
    expect(hasNoReorderLevel({ minimumStock: 0 })).toBe(true);
    expect(hasNoReorderLevel({ minimumStock: Number.NaN })).toBe(true);
    expect(hasNoReorderLevel({ minimumStock: 1 })).toBe(false);
    expect(hasNoReorderLevel({ minimumStock: 10 })).toBe(false);
  });
});

/**
 * The spreadsheet import is the other way an item reaches the store, so it has
 * to hold the same line — otherwise a bulk onboarding quietly recreates the
 * very items that can never warn.
 */
describe("inventory import", () => {
  const mapping = {
    A: "name",
    B: "category",
    C: "packingUnit",
    D: "minimumStock",
  };

  const context: ValidationContext = {
    now: "2026-09-16T07:00:00.000Z",
    existingPatients: [],
    existingTests: [],
    existingOrders: [],
    existingInventoryItems: [],
    existingInventoryBatches: [],
  };

  function importRow(minimumStock: string) {
    return validateImportRows(
      "inventory",
      [
        {
          rowNumber: 2,
          values: { A: "Malaria RDT", B: "Rapid test kit", C: "Kit", D: minimumStock },
        },
      ],
      mapping,
      context
    )[0];
  }

  /**
   * Caught in review: the row check alone would let someone map their columns,
   * be told the mapping is fine, and only then see every row rejected. The
   * column has to be demanded at the mapping step, where it is fixed once.
   */
  it("demands the column at the mapping step, not once per row", () => {
    const errors = validateMapping({ A: "name", B: "category" }, "inventory");
    expect(errors).toContain("Map a column to Minimum stock.");

    const mapped = validateMapping(
      { A: "name", B: "category", D: "minimumStock" },
      "inventory"
    );
    expect(mapped).not.toContain("Map a column to Minimum stock.");
  });

  it("blocks a row with no minimum stock", () => {
    const row = importRow("");
    expect(row.issues).toContain(MINIMUM_STOCK_REQUIRED);
    expect(row.state).toBe("attention");
    expect(row.record).toBeNull();
  });

  it("blocks a row whose minimum stock is zero", () => {
    const row = importRow("0");
    expect(row.issues).toContain(MINIMUM_STOCK_REQUIRED);
    expect(row.state).toBe("attention");
  });

  it("accepts a row carrying a real reorder level", () => {
    const row = importRow("10");
    expect(row.issues).toEqual([]);
    expect(row.state).toBe("ready");
  });
});
