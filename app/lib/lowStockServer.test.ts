import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The nightly reorder digest run for real, with only the trusted-server edges
 * faked: Firestore, Resend and the audit writer.
 */

type Row = { id: string; data: Record<string, unknown> };

const hoisted = vi.hoisted(() => ({
  store: {} as Record<string, Row[]>,
  writes: [] as Array<{ collection: string; id: string; data: Record<string, unknown> }>,
  send: vi.fn(),
  logAudit: vi.fn(),
}));

vi.mock("./firebaseAdmin", () => {
  type Filter = [string, string, unknown];
  function matches(row: Row, filters: Filter[]) {
    return filters.every(([field, op, value]) => {
      const actual = row.data[field];
      if (op === "array-contains") return Array.isArray(actual) && actual.includes(value);
      return actual === value;
    });
  }
  function makeQuery(name: string, filters: Filter[]) {
    return {
      where: (field: string, op: string, value: unknown) =>
        makeQuery(name, [...filters, [field, op, value] as Filter]),
      get: async () => {
        const rows = (hoisted.store[name] || []).filter((row) => matches(row, filters));
        return {
          empty: rows.length === 0,
          docs: rows.map((row) => ({ id: row.id, data: () => row.data })),
        };
      },
    };
  }
  return {
    getAdminDb: () => ({
      collection: (name: string) => ({
        ...makeQuery(name, []),
        doc: (id: string) => ({
          set: async (data: Record<string, unknown>) => {
            hoisted.writes.push({ collection: name, id, data });
          },
        }),
      }),
    }),
    isAdminCredentialError: () => false,
  };
});

vi.mock("./auditAdmin", () => ({ logAudit: hoisted.logAudit }));

vi.mock("./resendMail", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./resendMail")>();
  return {
    ...actual,
    getResend: () => ({ emails: { send: hoisted.send } }),
    resendFromAddress: () => "LabFlow <stock@labflowgambia.test>",
  };
});

const { alertRecipients, runClinicReorderDigest } = await import("./lowStockServer");

const CLINIC = "c1";
const NOW = new Date("2026-09-16T07:00:00.000Z");

function item(overrides: Record<string, unknown> = {}): Row {
  return {
    id: "rdt",
    data: {
      clinicId: CLINIC,
      name: "Malaria RDT",
      department: "Parasitology",
      packingUnit: "Kit",
      unitsPerPack: 25,
      baseUnit: "test",
      minimumStock: 10,
      active: true,
      ...overrides,
    },
  };
}

function batch(overrides: Record<string, unknown> = {}): Row {
  return {
    id: "b1",
    data: {
      clinicId: CLINIC,
      itemId: "rdt",
      itemName: "Malaria RDT",
      lotNumber: "LOT-1",
      expiryDate: "2030-01-01",
      acceptance: "accepted",
      ...overrides,
    },
  };
}

function movement(id: string, type: string, quantity: number): Row {
  return {
    id,
    data: {
      clinicId: CLINIC,
      itemId: "rdt",
      batchId: "b1",
      type,
      quantity,
      packingUnit: "Kit",
      unitsPerPack: 25,
      baseUnit: "test",
      occurredAt: "2026-09-01T09:00:00.000Z",
    },
  };
}

function staff(id: string, role: string, email: string, status = "approved"): Row {
  return {
    id,
    data: {
      email,
      clinicIds: [CLINIC],
      clinicRoles: { [CLINIC]: { role, status } },
    },
  };
}

/** Receipts minus issues, so on-hand lands exactly where each test wants it. */
function stockOf(onHand: number): Row[] {
  if (onHand >= 20) return [movement("m1", "receipt", onHand)];
  return [movement("m1", "receipt", 20), movement("m2", "issue", 20 - onHand)];
}

function seed(options: { onHand: number; reorderAlert?: unknown; staffRows?: Row[] }) {
  hoisted.store.clinics = [{ id: CLINIC, data: { name: "Medic Aid" } }];
  hoisted.store.inventoryItems = [
    item(options.reorderAlert === undefined ? {} : { reorderAlert: options.reorderAlert }),
  ];
  hoisted.store.inventoryBatches = [batch()];
  hoisted.store.inventoryMovements = stockOf(options.onHand);
  hoisted.store.users = options.staffRows ?? [staff("u1", "lab_manager", "lm@lab.test")];
}

function alertWrites() {
  return hoisted.writes.filter((write) => write.collection === "inventoryItems");
}

beforeEach(() => {
  hoisted.store = {};
  hoisted.writes = [];
  hoisted.send.mockReset();
  hoisted.logAudit.mockReset();
  hoisted.send.mockResolvedValue({ error: null, data: { id: "mail-1" } });
});

describe("recipients", () => {
  it("includes the lab manager, clinic administrator and storekeeper only", async () => {
    hoisted.store.users = [
      staff("u1", "lab_manager", "lm@lab.test"),
      staff("u2", "clinic_admin", "ca@lab.test"),
      staff("u3", "storekeeper", "store@lab.test"),
      staff("u4", "technician", "tech@lab.test"),
      staff("u5", "lab_supervisor", "sup@lab.test"),
    ];
    expect(await alertRecipients(CLINIC)).toEqual([
      "ca@lab.test",
      "lm@lab.test",
      "store@lab.test",
    ]);
  });

  it("leaves out staff whose membership is not approved", async () => {
    hoisted.store.users = [staff("u1", "lab_manager", "pending@lab.test", "pending")];
    expect(await alertRecipients(CLINIC)).toEqual([]);
  });

  it("finds staff whose document predates the memberships map", async () => {
    hoisted.store.users = [
      { id: "u9", data: { email: "old@lab.test", clinicId: CLINIC, role: "storekeeper", status: "approved" } },
    ];
    expect(await alertRecipients(CLINIC)).toEqual(["old@lab.test"]);
  });

  it("does not repeat an address held under both shapes", async () => {
    hoisted.store.users = [
      {
        id: "u1",
        data: {
          email: "lm@lab.test",
          clinicId: CLINIC,
          clinicIds: [CLINIC],
          role: "lab_manager",
          status: "approved",
          clinicRoles: { [CLINIC]: { role: "lab_manager", status: "approved" } },
        },
      },
    ];
    expect(await alertRecipients(CLINIC)).toEqual(["lm@lab.test"]);
  });
});

describe("nightly digest", () => {
  it("says nothing while stock is above the minimum", async () => {
    seed({ onHand: 40 });
    const result = await runClinicReorderDigest(CLINIC, "Medic Aid", NOW);
    expect(result.skipped).toBe("no-alerts");
    expect(hoisted.send).not.toHaveBeenCalled();
    expect(alertWrites()).toHaveLength(0);
  });

  it("sends the first message when stock reaches the minimum, and records it", async () => {
    seed({ onHand: 10 });
    const result = await runClinicReorderDigest(CLINIC, "Medic Aid", NOW);

    expect(result.skipped).toBeNull();
    expect(result.alerted).toBe(1);
    expect(result.lowCount).toBe(1);
    expect(hoisted.send).toHaveBeenCalledTimes(1);

    const mail = hoisted.send.mock.calls[0][0];
    expect(mail.to).toEqual(["lm@lab.test"]);
    expect(mail.subject).toContain("1 low");
    expect(mail.text).toContain("Malaria RDT");
    expect(mail.text).toContain("10 Kits left, minimum 10 Kits");

    expect(alertWrites()).toHaveLength(1);
    expect(alertWrites()[0].data.reorderAlert).toMatchObject({
      lastAlertedOnHand: 10,
      zeroAlertSent: false,
    });
  });

  it("stays quiet when the same level is seen again", async () => {
    seed({ onHand: 10, reorderAlert: { lastAlertedOnHand: 10, zeroAlertSent: false } });
    const result = await runClinicReorderDigest(CLINIC, "Medic Aid", NOW);
    expect(result.skipped).toBe("no-alerts");
    expect(hoisted.send).not.toHaveBeenCalled();
  });

  it("sends again on every further fall", async () => {
    seed({ onHand: 9, reorderAlert: { lastAlertedOnHand: 10, zeroAlertSent: false } });
    const result = await runClinicReorderDigest(CLINIC, "Medic Aid", NOW);
    expect(result.alerted).toBe(1);
    expect(hoisted.send.mock.calls[0][0].text).toContain("9 Kits left");
    expect(alertWrites()[0].data.reorderAlert).toMatchObject({ lastAlertedOnHand: 9 });
  });

  it("sends one final message in words when the shelf is empty", async () => {
    seed({ onHand: 0, reorderAlert: { lastAlertedOnHand: 3, zeroAlertSent: false } });
    const result = await runClinicReorderDigest(CLINIC, "Medic Aid", NOW);

    expect(result.outCount).toBe(1);
    const mail = hoisted.send.mock.calls[0][0];
    expect(mail.subject).toContain("1 out of stock");
    expect(mail.text).toContain("OUT OF STOCK");
    expect(mail.html).toContain("OUT OF STOCK");
    expect(alertWrites()[0].data.reorderAlert).toMatchObject({ zeroAlertSent: true });
  });

  it("does not repeat the empty-shelf message", async () => {
    seed({ onHand: 0, reorderAlert: { lastAlertedOnHand: 0, zeroAlertSent: true } });
    const result = await runClinicReorderDigest(CLINIC, "Medic Aid", NOW);
    expect(result.skipped).toBe("no-alerts");
    expect(hoisted.send).not.toHaveBeenCalled();
  });

  it("keeps the alert unsent when the mail service refuses, so it retries", async () => {
    hoisted.send.mockResolvedValue({
      error: { name: "rate_limit_exceeded", statusCode: 429, message: "slow down" },
      data: null,
    });
    seed({ onHand: 10 });

    const result = await runClinicReorderDigest(CLINIC, "Medic Aid", NOW);

    expect(result.skipped).toBe("send-failed");
    expect(result.alerted).toBe(0);
    expect(alertWrites()).toHaveLength(0);
    expect(hoisted.logAudit).not.toHaveBeenCalled();
  });

  it("does not record an alert nobody could receive", async () => {
    seed({ onHand: 10, staffRows: [staff("u4", "technician", "tech@lab.test")] });
    const result = await runClinicReorderDigest(CLINIC, "Medic Aid", NOW);

    expect(result.skipped).toBe("no-recipients");
    expect(hoisted.send).not.toHaveBeenCalled();
    expect(alertWrites()).toHaveLength(0);
  });

  it("re-baselines a partial delivery without sending anything", async () => {
    seed({ onHand: 5, reorderAlert: { lastAlertedOnHand: 0, zeroAlertSent: true } });
    const result = await runClinicReorderDigest(CLINIC, "Medic Aid", NOW);

    expect(result.skipped).toBe("no-alerts");
    expect(hoisted.send).not.toHaveBeenCalled();
    expect(alertWrites()[0].data.reorderAlert).toMatchObject({
      lastAlertedOnHand: 5,
      zeroAlertSent: false,
    });
  });

  it("closes the cycle once a delivery clears the minimum", async () => {
    seed({ onHand: 40, reorderAlert: { lastAlertedOnHand: 2, zeroAlertSent: false } });
    await runClinicReorderDigest(CLINIC, "Medic Aid", NOW);
    expect(alertWrites()[0].data.reorderAlert).toMatchObject({
      lastAlertedOnHand: null,
      zeroAlertSent: false,
    });
  });

  it("ignores retired items", async () => {
    seed({ onHand: 0 });
    hoisted.store.inventoryItems = [item({ active: false })];
    const result = await runClinicReorderDigest(CLINIC, "Medic Aid", NOW);
    expect(result.skipped).toBe("no-alerts");
  });

  /**
   * The whole cascade over consecutive days, through the real digest, with the
   * stored state fed back between runs exactly as Firestore would.
   */
  it("runs Isaac's RDT scenario day by day", async () => {
    seed({ onHand: 40 });

    function setStock(onHand: number) {
      hoisted.store.inventoryMovements = stockOf(onHand);
    }
    function carryStateForward() {
      const write = alertWrites().at(-1);
      if (!write) return;
      hoisted.store.inventoryItems[0].data.reorderAlert = write.data.reorderAlert;
    }
    async function day(onHand: number) {
      hoisted.writes = [];
      hoisted.send.mockClear();
      setStock(onHand);
      await runClinicReorderDigest(CLINIC, "Medic Aid", NOW);
      carryStateForward();
      const mail = hoisted.send.mock.calls[0]?.[0];
      return mail ? String(mail.subject) : null;
    }

    expect(await day(40)).toBeNull(); // healthy
    expect(await day(10)).toContain("1 low"); // reaches the minimum
    expect(await day(10)).toBeNull(); // nothing moved
    expect(await day(9)).toContain("1 low"); // fell by one
    expect(await day(8)).toContain("1 low"); // fell again
    expect(await day(6)).toContain("1 low"); // fell by two
    expect(await day(0)).toContain("1 out of stock"); // empty, final message
    expect(await day(0)).toBeNull(); // stays quiet at zero
    expect(await day(5)).toBeNull(); // partial delivery, re-baselined
    expect(await day(4)).toContain("1 low"); // heard again after that
    expect(await day(40)).toBeNull(); // delivery clears the minimum
    expect(await day(10)).toContain("1 low"); // a fresh cycle starts
  });

  it("writes one audit entry naming what was sent", async () => {
    seed({ onHand: 10 });
    await runClinicReorderDigest(CLINIC, "Medic Aid", NOW);

    expect(hoisted.logAudit).toHaveBeenCalledTimes(1);
    const entry = hoisted.logAudit.mock.calls[0][0];
    expect(entry.action).toBe("inventory.lowStockAlert");
    expect(entry.clinicId).toBe(CLINIC);
    expect(entry.detail).toMatchObject({ lowCount: 1, outCount: 0, recipients: 1 });
  });
});
