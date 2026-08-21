"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "../lib/ProtectedRoute";
import AppNav from "../lib/AppNav";
import { useAuth } from "../lib/AuthContext";
import { getClinicDocs, isOwner, loadClinicNames } from "../lib/clinicScope";
import { actorLabel } from "../lib/identity";
import {
  canManageInventoryItems,
  canRecordSpecimenMovement,
  canRecordStockMovement,
  canViewInventory,
  landingPathForRole,
} from "../lib/permissions";
import {
  BATCH_STATE_CLASSES,
  BATCH_STATE_LABELS,
  BatchState,
  EXPIRY_WARNING_DAYS,
  INVENTORY_CATEGORIES,
  InventoryBatch,
  InventoryItem,
  InventoryMovement,
  LAB_DEPARTMENTS,
  SPECIMEN_STATUS_LABELS,
  SpecimenMovement,
  balanceFor,
  batchState,
  computeBalances,
  daysUntil,
  formatDateTime,
  formatQuantity,
  isSameLocalDay,
  mapBatch,
  mapItem,
  mapMovement,
  mapSpecimen,
  stockLevel,
} from "../lib/inventory";

const EXPIRY_FILTERS = [
  { value: "", label: "Any expiry" },
  { value: "expired", label: "Expired" },
  { value: "30", label: "Expiring within 30 days" },
  { value: "90", label: "Expiring within 90 days" },
] as const;

const STATE_FILTERS: { value: "" | BatchState; label: string }[] = [
  { value: "", label: "Any status" },
  { value: "ok", label: "In stock" },
  { value: "depleted", label: "Out of stock" },
  { value: "expiring", label: "Expiring soon" },
  { value: "expired", label: "Expired" },
  { value: "quarantine", label: "Quarantine" },
  { value: "rejected", label: "Rejected" },
];

function Metric({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4">
      <p className="text-sm text-gray-600">{label}</p>
      <p className="text-2xl font-semibold text-gray-900 mt-1">{value}</p>
      {hint && <p className="text-xs text-gray-400 mt-1">{hint}</p>}
    </div>
  );
}

function StateBadge({ state }: { state: BatchState }) {
  return (
    <span
      className={`text-xs uppercase tracking-wide border rounded px-2 py-0.5 ${BATCH_STATE_CLASSES[state]}`}
    >
      {BATCH_STATE_LABELS[state]}
    </span>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="py-2 pr-3 font-medium text-gray-600 whitespace-nowrap">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-2 pr-3 text-gray-900 align-top">{children}</td>;
}

function InventoryContent() {
  const { role, clinicId, loading: authLoading } = useAuth();
  const router = useRouter();
  const owner = isOwner(role);
  const allowed = canViewInventory(role);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [specimens, setSpecimens] = useState<SpecimenMovement[]>([]);
  const [clinicNames, setClinicNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [search, setSearch] = useState("");
  const [category, setCategory] = useState("");
  const [supplier, setSupplier] = useState("");
  const [department, setDepartment] = useState("");
  const [stateFilter, setStateFilter] = useState<"" | BatchState>("");
  const [expiryFilter, setExpiryFilter] = useState("");
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  useEffect(() => {
    if (!authLoading && !allowed) router.replace(landingPathForRole(role));
  }, [authLoading, allowed, router]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;

    async function load() {
      try {
        const [itemDocs, batchDocs, movementDocs, specimenDocs] = await Promise.all([
          getClinicDocs("inventoryItems", role, clinicId, { sortBy: "name" }),
          getClinicDocs("inventoryBatches", role, clinicId),
          getClinicDocs("inventoryMovements", role, clinicId, {
            sortBy: "occurredAt",
            direction: "desc",
          }),
          getClinicDocs("specimenMovements", role, clinicId, {
            sortBy: "occurredAt",
            direction: "desc",
          }),
        ]);

        const mappedItems = itemDocs.map(mapItem);
        const names = owner
          ? await loadClinicNames(role, mappedItems.map((i) => i.clinicId))
          : {};

        if (cancelled) return;
        setItems(mappedItems);
        setBatches(batchDocs.map(mapBatch));
        setMovements(movementDocs.map(mapMovement));
        setSpecimens(specimenDocs.map(mapSpecimen));
        setClinicNames(names);
      } catch (err) {
        console.error(err);
        const detail = err instanceof Error ? ` ${err.message}` : "";
        if (!cancelled) setError(`Could not load the store records.${detail}`);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [allowed, owner, role, clinicId]);

  const balances = useMemo(() => computeBalances(movements), [movements]);
  const itemsById = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);

  const suppliers = useMemo(() => {
    const set = new Set<string>();
    for (const item of items) if (item.supplier) set.add(item.supplier);
    for (const batch of batches) if (batch.supplier) set.add(batch.supplier);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [items, batches]);

  /** One row per lot — a lot is the unit an expiry date belongs to. */
  const lotRows = useMemo(() => {
    const today = new Date();
    return batches
      .map((batch) => {
        const item = itemsById.get(batch.itemId);
        const balance = balanceFor(balances, batch.id);
        return {
          batch,
          item,
          balance,
          onHand: balance.onHand,
          state: batchState(batch, balance.onHand, today),
          days: daysUntil(batch.expiryDate, today),
        };
      })
      .sort((a, b) => {
        const an = a.item?.name ?? a.batch.itemName;
        const bn = b.item?.name ?? b.batch.itemName;
        if (an !== bn) return an.localeCompare(bn);
        return (a.batch.expiryDate ?? "9999").localeCompare(b.batch.expiryDate ?? "9999");
      });
  }, [batches, itemsById, balances]);

  const itemStock = useMemo(() => {
    const totals = new Map<string, number>();
    for (const row of lotRows) {
      if (row.state === "expired" || row.state === "rejected") continue;
      totals.set(row.batch.itemId, (totals.get(row.batch.itemId) ?? 0) + Math.max(row.onHand, 0));
    }
    return totals;
  }, [lotRows]);

  const alerts = useMemo(() => {
    const low: { item: InventoryItem; onHand: number }[] = [];
    const out: { item: InventoryItem; onHand: number }[] = [];
    for (const item of items) {
      if (!item.active) continue;
      const onHand = itemStock.get(item.id) ?? 0;
      const level = stockLevel(onHand, item.minimumStock);
      if (level === "out") out.push({ item, onHand });
      else if (level === "low") low.push({ item, onHand });
    }
    const expiring = lotRows.filter((r) => r.state === "expiring" && r.onHand > 0);
    const expired = lotRows.filter((r) => r.state === "expired" && r.onHand > 0);
    return { low, out, expiring, expired };
  }, [items, itemStock, lotRows]);

  const withinRange = useMemo(() => {
    const from = fromDate ? new Date(`${fromDate}T00:00:00`).getTime() : null;
    const to = toDate ? new Date(`${toDate}T23:59:59`).getTime() : null;
    return (iso: string | null | undefined) => {
      if (!from && !to) return true;
      if (!iso) return false;
      const t = new Date(iso).getTime();
      if (Number.isNaN(t)) return false;
      if (from && t < from) return false;
      if (to && t > to) return false;
      return true;
    };
  }, [fromDate, toDate]);

  const matchesFilters = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return (batch: InventoryBatch, item: InventoryItem | undefined, state: BatchState) => {
      if (needle) {
        const haystack = [
          item?.name ?? batch.itemName,
          batch.lotNumber,
          item?.catalogueCode ?? "",
          item?.manufacturer ?? "",
          batch.supplier || item?.supplier || "",
        ]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (category && item?.category !== category) return false;
      if (supplier && (batch.supplier || item?.supplier) !== supplier) return false;
      if (department && item?.department !== department) return false;
      if (stateFilter && state !== stateFilter) return false;
      if (expiryFilter) {
        const days = daysUntil(batch.expiryDate);
        if (expiryFilter === "expired" && !(days !== null && days < 0)) return false;
        if (expiryFilter !== "expired") {
          const limit = Number(expiryFilter);
          if (days === null || days < 0 || days > limit) return false;
        }
      }
      return true;
    };
  }, [search, category, supplier, department, stateFilter, expiryFilter]);

  const visibleLots = useMemo(
    () => lotRows.filter((row) => matchesFilters(row.batch, row.item, row.state)),
    [lotRows, matchesFilters]
  );

  const filteredMovements = useMemo(() => {
    return movements.filter((m) => {
      if (!withinRange(m.occurredAt)) return false;
      const item = itemsById.get(m.itemId);
      const needle = search.trim().toLowerCase();
      if (needle) {
        const haystack = [m.itemName, m.lotNumber, m.supplier ?? "", m.department ?? ""]
          .join(" ")
          .toLowerCase();
        if (!haystack.includes(needle)) return false;
      }
      if (category && item?.category !== category) return false;
      if (supplier && (m.supplier || item?.supplier) !== supplier) return false;
      if (department && m.department !== department && item?.department !== department) return false;
      return true;
    });
  }, [movements, withinRange, itemsById, search, category, supplier, department]);

  const recentReceiving = useMemo(
    () => filteredMovements.filter((m) => m.type === "receipt").slice(0, 10),
    [filteredMovements]
  );

  const recentIssuing = useMemo(
    () => filteredMovements.filter((m) => m.type === "issue" || m.type === "transfer").slice(0, 10),
    [filteredMovements]
  );

  const today = useMemo(() => {
    const receivedToday = movements.filter(
      (m) => m.type === "receipt" && isSameLocalDay(m.occurredAt)
    ).length;
    const issuedToday = movements.filter(
      (m) => m.type === "issue" && isSameLocalDay(m.occurredAt)
    ).length;
    const specimensIn = specimens.filter(
      (s) => s.direction === "received" && isSameLocalDay(s.occurredAt)
    ).length;
    const specimensOut = specimens.filter(
      (s) => s.direction === "sent" && isSameLocalDay(s.occurredAt)
    ).length;
    return { receivedToday, issuedToday, specimensIn, specimensOut };
  }, [movements, specimens]);

  const recentSpecimens = useMemo(
    () => specimens.filter((s) => withinRange(s.occurredAt)).slice(0, 8),
    [specimens, withinRange]
  );

  function clinicLabel(id: string | null) {
    if (!id) return "—";
    return clinicNames[id] || id;
  }

  if (!allowed) return null;

  const canRecord = canRecordStockMovement(role);
  const empty =
    !loading && !error && items.length === 0 && movements.length === 0 && specimens.length === 0;

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex flex-wrap items-start justify-between gap-4 mb-1">
          <h1 className="text-2xl font-semibold text-gray-900">Store &amp; inventory</h1>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            {canRecord && (
              <a
                href="/inventory/movements"
                className="bg-gray-900 text-white rounded-lg px-4 py-2 font-medium hover:bg-gray-800 transition"
              >
                Record stock movement
              </a>
            )}
            {canManageInventoryItems(role) && (
              <a href="/inventory/items" className="text-gray-900 underline font-medium">
                Items
              </a>
            )}
            {canRecordSpecimenMovement(role) && (
              <a href="/inventory/specimens" className="text-gray-900 underline font-medium">
                Specimen register
              </a>
            )}
          </div>
        </div>
        <p className="text-gray-600 mb-8">
          {owner ? "All clinics" : "Your clinic"} — what came in, what went out, and what remains.
          Balances are calculated from the movement ledger, never typed in.
        </p>

        {loading && <p className="text-gray-600">Loading...</p>}
        {error && <p className="text-red-600">{error}</p>}

        {empty && (
          <div className="border border-gray-200 rounded-lg p-6">
            <p className="text-gray-900 font-medium mb-1">Nothing recorded yet.</p>
            <p className="text-sm text-gray-600">
              {canManageInventoryItems(role)
                ? "Add the items this laboratory stocks, then record the first delivery against a lot number."
                : "The store has no items or movements recorded yet."}
            </p>
          </div>
        )}

        {!loading && !error && !empty && (
          <>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-10">
              <Metric label="Stock items" value={String(items.filter((i) => i.active).length)} />
              <Metric
                label="Low stock"
                value={String(alerts.low.length)}
                hint="At or below minimum"
              />
              <Metric
                label="Expiring soon"
                value={String(alerts.expiring.length)}
                hint={`Lots within ${EXPIRY_WARNING_DAYS} days`}
              />
              <Metric label="Received today" value={String(today.receivedToday)} hint="Deliveries" />
              <Metric label="Issued today" value={String(today.issuedToday)} hint="Stock issues" />
            </div>

            <section className="border border-gray-200 rounded-lg p-4 mb-10">
              <h2 className="text-sm font-medium text-gray-900 mb-3">Stock alerts</h2>
              <div className="grid md:grid-cols-2 gap-x-8 gap-y-4">
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Out of stock ({alerts.out.length})
                  </p>
                  {alerts.out.length === 0 ? (
                    <p className="text-sm text-gray-500">None.</p>
                  ) : (
                    <ul className="text-sm text-gray-700 space-y-1">
                      {alerts.out.map(({ item }) => (
                        <li key={item.id}>
                          {item.name}{" "}
                          <span className="text-gray-400">
                            · minimum {item.minimumStock} {item.packingUnit}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Low stock ({alerts.low.length})
                  </p>
                  {alerts.low.length === 0 ? (
                    <p className="text-sm text-gray-500">None.</p>
                  ) : (
                    <ul className="text-sm text-gray-700 space-y-1">
                      {alerts.low.map(({ item, onHand }) => (
                        <li key={item.id}>
                          {item.name}{" "}
                          <span className="text-amber-700">
                            {onHand} left, reorder at {item.minimumStock}
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Expiring within {EXPIRY_WARNING_DAYS} days ({alerts.expiring.length})
                  </p>
                  {alerts.expiring.length === 0 ? (
                    <p className="text-sm text-gray-500">None.</p>
                  ) : (
                    <ul className="text-sm text-gray-700 space-y-1">
                      {alerts.expiring.map((row) => (
                        <li key={row.batch.id}>
                          {row.item?.name ?? row.batch.itemName}{" "}
                          <span className="text-gray-400">lot {row.batch.lotNumber}</span>{" "}
                          <span className="text-amber-700">
                            expires {row.batch.expiryDate} ({row.days} days)
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">
                    Expired, still on hand ({alerts.expired.length})
                  </p>
                  {alerts.expired.length === 0 ? (
                    <p className="text-sm text-gray-500">None.</p>
                  ) : (
                    <ul className="text-sm text-gray-700 space-y-1">
                      {alerts.expired.map((row) => (
                        <li key={row.batch.id}>
                          {row.item?.name ?? row.batch.itemName}{" "}
                          <span className="text-gray-400">lot {row.batch.lotNumber}</span>{" "}
                          <span className="text-red-700">
                            expired {row.batch.expiryDate} — quarantine and write off
                          </span>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>
              </div>
            </section>

            <section className="border border-gray-200 rounded-lg p-4 mb-6">
              <h2 className="text-sm font-medium text-gray-900 mb-3">Filters</h2>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Item, lot, catalogue code, supplier"
                  aria-label="Search"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                  aria-label="Category"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Any category</option>
                  {INVENTORY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
                <select
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  aria-label="Supplier"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Any supplier</option>
                  {suppliers.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  aria-label="Laboratory or department"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Any laboratory / department</option>
                  {LAB_DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
                <select
                  value={stateFilter}
                  onChange={(e) => setStateFilter(e.target.value as "" | BatchState)}
                  aria-label="Status"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  {STATE_FILTERS.map((s) => (
                    <option key={s.value} value={s.value}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <select
                  value={expiryFilter}
                  onChange={(e) => setExpiryFilter(e.target.value)}
                  aria-label="Expiry"
                  className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  {EXPIRY_FILTERS.map((f) => (
                    <option key={f.value} value={f.value}>
                      {f.label}
                    </option>
                  ))}
                </select>
                <label className="text-sm text-gray-600 flex items-center gap-2">
                  From
                  <input
                    type="date"
                    value={fromDate}
                    onChange={(e) => setFromDate(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-2 text-sm w-full"
                  />
                </label>
                <label className="text-sm text-gray-600 flex items-center gap-2">
                  To
                  <input
                    type="date"
                    value={toDate}
                    onChange={(e) => setToDate(e.target.value)}
                    className="border border-gray-300 rounded-lg px-2 py-2 text-sm w-full"
                  />
                </label>
              </div>
              <p className="text-xs text-gray-400 mt-3">
                The date range applies to the movement and specimen tables. Item, category,
                supplier, department, status and expiry apply to the stock table.
              </p>
            </section>

            <section className="mb-10">
              <h2 className="text-sm font-medium text-gray-900 mb-3">
                Recent receiving ({recentReceiving.length})
              </h2>
              <div className="border border-gray-200 rounded-lg p-4 overflow-x-auto">
                {recentReceiving.length === 0 ? (
                  <p className="text-sm text-gray-600">No deliveries recorded in this range.</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <Th>Item</Th>
                        <Th>Supplier</Th>
                        <Th>Batch / lot</Th>
                        <Th>Packing unit</Th>
                        <Th>Quantity</Th>
                        <Th>Delivery note</Th>
                        <Th>Received by</Th>
                        <Th>Date</Th>
                        <Th>Time</Th>
                        {owner && <Th>Clinic</Th>}
                      </tr>
                    </thead>
                    <tbody>
                      {recentReceiving.map((m) => {
                        const when = formatDateTime(m.occurredAt);
                        return (
                          <tr key={m.id} className="border-b border-gray-100 last:border-0">
                            <Td>{m.itemName}</Td>
                            <Td>{m.supplier || "—"}</Td>
                            <Td>{m.lotNumber || "—"}</Td>
                            <Td>{m.packingUnit}</Td>
                            <Td>
                              {formatQuantity(m.quantity, m.packingUnit, m.unitsPerPack, m.baseUnit)}
                            </Td>
                            <Td>{m.deliveryNote || "—"}</Td>
                            <Td>{actorLabel(m.actor)}</Td>
                            <Td>{when.date}</Td>
                            <Td>{when.time}</Td>
                            {owner && <Td>{clinicLabel(m.clinicId)}</Td>}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="mb-10">
              <h2 className="text-sm font-medium text-gray-900 mb-3">
                Recent issuing and transfers ({recentIssuing.length})
              </h2>
              <div className="border border-gray-200 rounded-lg p-4 overflow-x-auto">
                {recentIssuing.length === 0 ? (
                  <p className="text-sm text-gray-600">No issues recorded in this range.</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <Th>Item</Th>
                        <Th>Batch / lot</Th>
                        <Th>Quantity</Th>
                        <Th>Packing unit</Th>
                        <Th>Supplied to</Th>
                        <Th>Laboratory / department</Th>
                        <Th>Purpose</Th>
                        <Th>Issued by</Th>
                        <Th>Date</Th>
                        <Th>Time</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentIssuing.map((m) => {
                        const when = formatDateTime(m.occurredAt);
                        return (
                          <tr key={m.id} className="border-b border-gray-100 last:border-0">
                            <Td>
                              {m.itemName}
                              {m.type === "transfer" && (
                                <span className="text-xs text-gray-400"> · transfer</span>
                              )}
                            </Td>
                            <Td>{m.lotNumber || "—"}</Td>
                            <Td>
                              {formatQuantity(m.quantity, m.packingUnit, m.unitsPerPack, m.baseUnit)}
                            </Td>
                            <Td>{m.packingUnit}</Td>
                            <Td>{m.issuedTo || m.destination || "—"}</Td>
                            <Td>{m.department || "—"}</Td>
                            <Td>{m.purpose || m.reason || "—"}</Td>
                            <Td>{actorLabel(m.actor)}</Td>
                            <Td>{when.date}</Td>
                            <Td>{when.time}</Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section className="mb-10">
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-gray-900">
                  Stock by lot ({visibleLots.length} of {lotRows.length})
                </h2>
                <p className="text-xs text-gray-400">Ordered first-expire-first-out within item</p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4 overflow-x-auto">
                {visibleLots.length === 0 ? (
                  <p className="text-sm text-gray-600">
                    {lotRows.length === 0
                      ? "No lots recorded yet."
                      : "No lots match the current filters."}
                  </p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <Th>Item</Th>
                        <Th>Category</Th>
                        <Th>Batch / lot</Th>
                        <Th>Packing unit</Th>
                        <Th>On hand</Th>
                        <Th>Expiry</Th>
                        <Th>Received / first used</Th>
                        <Th>Supplier</Th>
                        <Th>Location</Th>
                        <Th>Status</Th>
                        {owner && <Th>Clinic</Th>}
                      </tr>
                    </thead>
                    <tbody>
                      {visibleLots.map((row) => (
                        <tr key={row.batch.id} className="border-b border-gray-100 last:border-0">
                          <Td>{row.item?.name ?? row.batch.itemName}</Td>
                          <Td>{row.item?.category ?? "—"}</Td>
                          <Td>{row.batch.lotNumber || "—"}</Td>
                          <Td>
                            {row.item
                              ? `${row.item.packingUnit} of ${row.item.unitsPerPack} ${row.item.baseUnit}`
                              : "—"}
                          </Td>
                          <Td>
                            {row.item
                              ? formatQuantity(
                                  row.onHand,
                                  row.item.packingUnit,
                                  row.item.unitsPerPack,
                                  row.item.baseUnit
                                )
                              : row.onHand}
                          </Td>
                          <Td>
                            {row.batch.expiryDate ?? "—"}
                            {row.days !== null && row.days >= 0 && row.days <= 90 && (
                              <span className="text-xs text-gray-400"> · {row.days} days</span>
                            )}
                          </Td>
                          <Td>
                            <span className="text-xs text-gray-500">
                              {formatDateTime(row.balance.firstReceivedAt).date} /{" "}
                              {row.balance.firstUsedAt
                                ? formatDateTime(row.balance.firstUsedAt).date
                                : "unopened"}
                            </span>
                          </Td>
                          <Td>{row.batch.supplier || row.item?.supplier || "—"}</Td>
                          <Td>{row.batch.location || "—"}</Td>
                          <Td>
                            <StateBadge state={row.state} />
                            {row.balance.outOfServiceAt && row.onHand <= 0 && (
                              <span className="block text-xs text-gray-400 mt-1">
                                Out of service {formatDateTime(row.balance.outOfServiceAt).date}
                              </span>
                            )}
                          </Td>
                          {owner && <Td>{clinicLabel(row.batch.clinicId)}</Td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
              </div>
            </section>

            <section>
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-medium text-gray-900">Specimen movement</h2>
                <p className="text-xs text-gray-400">
                  {today.specimensIn} received today · {today.specimensOut} sent today
                </p>
              </div>
              <div className="border border-gray-200 rounded-lg p-4 overflow-x-auto">
                {recentSpecimens.length === 0 ? (
                  <p className="text-sm text-gray-600">No specimen movements recorded.</p>
                ) : (
                  <table className="w-full text-left text-sm">
                    <thead>
                      <tr className="border-b border-gray-200">
                        <Th>Direction</Th>
                        <Th>Specimen type</Th>
                        <Th>Quantity</Th>
                        <Th>Order / Lab ID</Th>
                        <Th>Laboratory / department</Th>
                        <Th>Sent to</Th>
                        <Th>Condition</Th>
                        <Th>Status</Th>
                        <Th>Recorded by</Th>
                        <Th>Date</Th>
                        <Th>Time</Th>
                      </tr>
                    </thead>
                    <tbody>
                      {recentSpecimens.map((s) => {
                        const when = formatDateTime(s.occurredAt);
                        return (
                          <tr key={s.id} className="border-b border-gray-100 last:border-0">
                            <Td>{s.direction === "received" ? "Received" : "Sent"}</Td>
                            <Td>{s.specimenType}</Td>
                            <Td>
                              {s.quantity} {s.container || "container(s)"}
                            </Td>
                            <Td>{s.orderReference || "—"}</Td>
                            <Td>{s.department || "—"}</Td>
                            <Td>{s.destination || "—"}</Td>
                            <Td>{s.condition}</Td>
                            <Td>{SPECIMEN_STATUS_LABELS[s.status] ?? s.status}</Td>
                            <Td>{actorLabel(s.actor)}</Td>
                            <Td>{when.date}</Td>
                            <Td>{when.time}</Td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                )}
              </div>
            </section>
          </>
        )}
      </div>
    </main>
  );
}

export default function Inventory() {
  return (
    <ProtectedRoute>
      <InventoryContent />
    </ProtectedRoute>
  );
}
