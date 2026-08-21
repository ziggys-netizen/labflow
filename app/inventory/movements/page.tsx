"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { collection, doc, writeBatch } from "firebase/firestore";
import ProtectedRoute from "../../lib/ProtectedRoute";
import AppNav from "../../lib/AppNav";
import { useAuth } from "../../lib/AuthContext";
import { db } from "../../lib/firebase";
import { getClinicDocs, isOwner } from "../../lib/clinicScope";
import { actorLabel, makeActorStamp } from "../../lib/identity";
import { canRecordStockMovement, canViewInventory, landingPathForRole } from "../../lib/permissions";
import { fromDateTimeLocal, toDateTimeLocal } from "../../lib/datetime";
import {
  ADJUSTMENT_REASONS,
  ARRIVAL_CONDITIONS,
  BATCH_ACCEPTANCE,
  ACCEPTANCE_LABELS,
  DISPOSAL_REASONS,
  InventoryBatch,
  InventoryItem,
  InventoryMovement,
  LAB_DEPARTMENTS,
  MOVEMENT_TYPES,
  MovementType,
  balanceFor,
  batchState,
  computeBalances,
  fefoSort,
  formatDateTime,
  formatQuantity,
  mapBatch,
  mapItem,
  mapMovement,
  movementDefinition,
  movementLabel,
  packDescription,
} from "../../lib/inventory";

const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm";

const OUT_TYPES: MovementType[] = ["issue", "transfer", "disposal"];

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="py-2 pr-3 font-medium text-gray-600 whitespace-nowrap">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-2 pr-3 text-gray-900 align-top">{children}</td>;
}

function MovementsContent() {
  const { user, role, clinicId, username, loading: authLoading } = useAuth();
  const router = useRouter();
  const owner = isOwner(role);
  const allowed = canViewInventory(role);
  const canRecord = canRecordStockMovement(role);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [batches, setBatches] = useState<InventoryBatch[]>([]);
  const [movements, setMovements] = useState<InventoryMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [reloadToken, setReloadToken] = useState(0);
  const [saving, setSaving] = useState(false);

  const [mode, setMode] = useState<"receive" | "issue">("receive");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("1");
  const [occurredAt, setOccurredAt] = useState(() => toDateTimeLocal(null));
  const [note, setNote] = useState("");

  // Receiving
  const [lotNumber, setLotNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [manufactureDate, setManufactureDate] = useState("");
  const [supplier, setSupplier] = useState("");
  const [deliveryNote, setDeliveryNote] = useState("");
  const [conditionOnArrival, setConditionOnArrival] = useState<string>(ARRIVAL_CONDITIONS[0]);
  const [acceptance, setAcceptance] = useState<string>(BATCH_ACCEPTANCE[0]);
  const [location, setLocation] = useState("");

  // Issuing and the other outward movements
  const [batchId, setBatchId] = useState("");
  const [movementType, setMovementType] = useState<MovementType>("issue");
  const [adjustmentDirection, setAdjustmentDirection] = useState<"in" | "out">("in");
  const [department, setDepartment] = useState<string>(LAB_DEPARTMENTS[1]);
  const [issuedTo, setIssuedTo] = useState("");
  const [purpose, setPurpose] = useState("");
  const [destination, setDestination] = useState("");
  const [reason, setReason] = useState("");

  const [filterType, setFilterType] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  useEffect(() => {
    if (!authLoading && !allowed) router.replace(landingPathForRole(role));
  }, [authLoading, allowed, router]);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;

    async function load() {
      try {
        const [itemDocs, batchDocs, movementDocs] = await Promise.all([
          getClinicDocs("inventoryItems", role, clinicId, { sortBy: "name" }),
          getClinicDocs("inventoryBatches", role, clinicId),
          getClinicDocs("inventoryMovements", role, clinicId, {
            sortBy: "occurredAt",
            direction: "desc",
          }),
        ]);
        if (cancelled) return;
        setItems(itemDocs.map(mapItem));
        setBatches(batchDocs.map(mapBatch));
        setMovements(movementDocs.map(mapMovement));
      } catch (err) {
        console.error(err);
        if (!cancelled) setStatus("Could not load the stock ledger.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [allowed, role, clinicId, reloadToken]);

  const balances = useMemo(() => computeBalances(movements), [movements]);
  const activeItems = useMemo(() => items.filter((i) => i.active), [items]);
  const selectedItem = useMemo(() => items.find((i) => i.id === itemId), [items, itemId]);

  /** Lots of the selected item, soonest expiry first — PRD 6.4 FEFO. */
  const itemLots = useMemo(() => {
    if (!itemId) return [];
    return fefoSort(batches.filter((b) => b.itemId === itemId)).map((batch) => {
      const onHand = balanceFor(balances, batch.id).onHand;
      return { batch, onHand, state: batchState(batch, onHand) };
    });
  }, [batches, itemId, balances]);

  const fefoRecommendation = useMemo(
    () => itemLots.find((l) => l.onHand > 0 && l.state !== "expired" && l.state !== "rejected"),
    [itemLots]
  );

  const selectedLot = useMemo(
    () => itemLots.find((l) => l.batch.id === batchId),
    [itemLots, batchId]
  );

  const filteredMovements = useMemo(() => {
    const from = filterFrom ? new Date(`${filterFrom}T00:00:00`).getTime() : null;
    const to = filterTo ? new Date(`${filterTo}T23:59:59`).getTime() : null;
    return movements.filter((m) => {
      if (filterType && m.type !== filterType) return false;
      if (from || to) {
        const t = new Date(m.occurredAt).getTime();
        if (Number.isNaN(t)) return false;
        if (from && t < from) return false;
        if (to && t > to) return false;
      }
      return true;
    });
  }, [movements, filterType, filterFrom, filterTo]);

  function resetForm() {
    setQuantity("1");
    setNote("");
    setLotNumber("");
    setExpiryDate("");
    setManufactureDate("");
    setDeliveryNote("");
    setIssuedTo("");
    setPurpose("");
    setDestination("");
    setReason("");
    setOccurredAt(toDateTimeLocal(null));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !selectedItem) {
      setStatus("Choose an item first.");
      return;
    }
    const targetClinicId = selectedItem.clinicId ?? clinicId;
    if (!targetClinicId) {
      setStatus("This item is not linked to a clinic.");
      return;
    }
    if (!owner && targetClinicId !== clinicId) {
      setStatus("That item belongs to another clinic.");
      return;
    }

    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setStatus("Enter a quantity greater than zero.");
      return;
    }
    const when = fromDateTimeLocal(occurredAt);
    if (!when) {
      setStatus("Enter a valid date and time.");
      return;
    }

    const type: MovementType = mode === "receive" ? "receipt" : movementType;
    const definition = movementDefinition(type);
    const direction =
      type === "adjustment" ? adjustmentDirection : definition?.direction ?? "in";

    setSaving(true);
    setStatus("");
    try {
      const write = writeBatch(db);
      let targetBatch: InventoryBatch | undefined;
      let targetBatchId: string;

      if (mode === "receive") {
        if (!lotNumber.trim()) {
          setStatus("A lot or batch number is required — ISO 15189 requires it on every receipt.");
          setSaving(false);
          return;
        }
        const existing = batches.find(
          (b) => b.itemId === selectedItem.id && b.lotNumber === lotNumber.trim()
        );
        if (existing) {
          targetBatch = existing;
          targetBatchId = existing.id;
          write.set(
            doc(db, "inventoryBatches", existing.id),
            {
              expiryDate: expiryDate || existing.expiryDate,
              manufactureDate: manufactureDate || existing.manufactureDate,
              supplier: supplier.trim() || existing.supplier,
              location: location.trim() || existing.location,
              acceptance,
            },
            { merge: true }
          );
        } else {
          const ref = doc(collection(db, "inventoryBatches"));
          targetBatchId = ref.id;
          write.set(ref, {
            clinicId: targetClinicId,
            itemId: selectedItem.id,
            itemName: selectedItem.name,
            lotNumber: lotNumber.trim(),
            expiryDate: expiryDate || null,
            manufactureDate: manufactureDate || null,
            supplier: supplier.trim() || selectedItem.supplier,
            location: location.trim(),
            acceptance,
            createdAt: new Date().toISOString(),
            createdBy: makeActorStamp(user, username),
          });
        }
      } else {
        if (!selectedLot) {
          setStatus("Choose the lot this movement applies to.");
          setSaving(false);
          return;
        }
        if (direction === "out" && qty > selectedLot.onHand) {
          setStatus(
            `Only ${selectedLot.onHand} on hand for lot ${selectedLot.batch.lotNumber}. Record an adjustment first if the shelf count differs.`
          );
          setSaving(false);
          return;
        }
        targetBatch = selectedLot.batch;
        targetBatchId = selectedLot.batch.id;
        if (type === "transfer" && destination.trim()) {
          write.set(
            doc(db, "inventoryBatches", targetBatchId),
            { location: destination.trim() },
            { merge: true }
          );
        }
      }

      const movementRef = doc(collection(db, "inventoryMovements"));
      write.set(movementRef, {
        clinicId: targetClinicId,
        itemId: selectedItem.id,
        itemName: selectedItem.name,
        batchId: targetBatchId,
        lotNumber: mode === "receive" ? lotNumber.trim() : targetBatch?.lotNumber ?? "",
        expiryDate:
          mode === "receive" ? expiryDate || null : targetBatch?.expiryDate ?? null,
        type,
        direction,
        quantity: qty,
        packingUnit: selectedItem.packingUnit,
        unitsPerPack: selectedItem.unitsPerPack,
        baseUnit: selectedItem.baseUnit,
        occurredAt: when,
        recordedAt: new Date().toISOString(),
        actor: makeActorStamp(user, username),
        supplier: mode === "receive" ? supplier.trim() || selectedItem.supplier : null,
        deliveryNote: mode === "receive" ? deliveryNote.trim() || null : null,
        conditionOnArrival: mode === "receive" ? conditionOnArrival : null,
        department: mode === "receive" ? null : department,
        issuedTo: type === "issue" ? issuedTo.trim() || null : null,
        purpose: type === "issue" ? purpose.trim() || null : null,
        destination: type === "transfer" ? destination.trim() || null : null,
        reason: type === "disposal" || type === "adjustment" || type === "return" ? reason || null : null,
        note: note.trim() || null,
      });

      await write.commit();
      setStatus(
        mode === "receive"
          ? `Recorded ${qty} ${selectedItem.packingUnit} of ${selectedItem.name} into lot ${lotNumber.trim()}.`
          : `Recorded ${movementLabel(type).toLowerCase()}: ${qty} ${selectedItem.packingUnit} of ${selectedItem.name}.`
      );
      resetForm();
      setReloadToken((n) => n + 1);
    } catch (err) {
      console.error(err);
      setStatus("Failed to record the movement.");
    } finally {
      setSaving(false);
    }
  }

  if (!allowed) return null;

  const outward = OUT_TYPES.includes(movementType) || (movementType === "adjustment" && adjustmentDirection === "out");

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
          <h1 className="text-2xl font-semibold text-gray-900">Stock movements</h1>
          <a href="/inventory" className="text-sm text-gray-900 underline font-medium">
            Back to store
          </a>
        </div>
        <p className="text-gray-600 mb-6">
          Every receipt, issue, transfer, return, adjustment and disposal, with the lot it applied
          to. Balances are summed from this ledger.
        </p>

        {status && <p className="text-sm text-gray-600 mb-4">{status}</p>}

        {!canRecord && (
          <p className="text-sm text-gray-500 mb-6">
            You can view the ledger but not record movements. Recording stock in and out is limited
            to the storekeeper, lab manager and owner.
          </p>
        )}

        {canRecord && (
          <form onSubmit={handleSubmit} className="border border-gray-200 rounded-lg p-4 mb-10 space-y-4">
            <div className="flex gap-2">
              {(["receive", "issue"] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setMode(m)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    mode === m
                      ? "bg-gray-900 text-white"
                      : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {m === "receive" ? "Receive stock" : "Issue or adjust"}
                </button>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Item">
                <select
                  value={itemId}
                  onChange={(e) => {
                    setItemId(e.target.value);
                    setBatchId("");
                  }}
                  className={inputClass}
                >
                  <option value="">Select item...</option>
                  {activeItems.map((i) => (
                    <option key={i.id} value={i.id}>
                      {i.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={`Quantity${selectedItem ? ` (${selectedItem.packingUnit})` : ""}`}
                hint={selectedItem ? packDescription(selectedItem) : "Counted in packing units."}
              >
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>

            {mode === "receive" && (
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Lot / batch number" hint="Required by ISO 15189 on every receipt.">
                  <input
                    type="text"
                    value={lotNumber}
                    onChange={(e) => setLotNumber(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Expiry date">
                  <input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Manufacture date" hint="Where printed on the packaging.">
                  <input
                    type="date"
                    value={manufactureDate}
                    onChange={(e) => setManufactureDate(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Supplier">
                  <input
                    type="text"
                    value={supplier}
                    onChange={(e) => setSupplier(e.target.value)}
                    placeholder={selectedItem?.supplier || ""}
                    className={inputClass}
                  />
                </Field>
                <Field label="Delivery note / purchase reference">
                  <input
                    type="text"
                    value={deliveryNote}
                    onChange={(e) => setDeliveryNote(e.target.value)}
                    className={inputClass}
                  />
                </Field>
                <Field label="Condition on arrival">
                  <select
                    value={conditionOnArrival}
                    onChange={(e) => setConditionOnArrival(e.target.value)}
                    className={inputClass}
                  >
                    {ARRIVAL_CONDITIONS.map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field
                  label="Acceptance"
                  hint="ISO 15189 expects untested, accepted and rejected material to be kept apart."
                >
                  <select
                    value={acceptance}
                    onChange={(e) => setAcceptance(e.target.value)}
                    className={inputClass}
                  >
                    {BATCH_ACCEPTANCE.map((a) => (
                      <option key={a} value={a}>
                        {ACCEPTANCE_LABELS[a]}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Storage location" hint="Where the lot is physically shelved.">
                  <input
                    type="text"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    placeholder="e.g. Fridge 1, shelf B"
                    className={inputClass}
                  />
                </Field>
              </div>
            )}

            {mode === "issue" && (
              <div className="grid sm:grid-cols-2 gap-4">
                <Field label="Movement type">
                  <select
                    value={movementType}
                    onChange={(e) => setMovementType(e.target.value as MovementType)}
                    className={inputClass}
                  >
                    {MOVEMENT_TYPES.filter((t) => t.value !== "receipt").map((t) => (
                      <option key={t.value} value={t.value}>
                        {t.label}
                      </option>
                    ))}
                  </select>
                  <span className="block text-xs text-gray-400 mt-1">
                    {movementDefinition(movementType)?.hint}
                  </span>
                </Field>
                <Field
                  label="Lot"
                  hint={
                    fefoRecommendation
                      ? `Recommended: lot ${fefoRecommendation.batch.lotNumber}, expiring ${
                          fefoRecommendation.batch.expiryDate ?? "unknown"
                        } — first expire, first out.`
                      : "No lot with stock on hand."
                  }
                >
                  <select
                    value={batchId}
                    onChange={(e) => setBatchId(e.target.value)}
                    className={inputClass}
                  >
                    <option value="">Select lot...</option>
                    {itemLots.map((l) => (
                      <option key={l.batch.id} value={l.batch.id}>
                        {l.batch.lotNumber} · exp {l.batch.expiryDate ?? "—"} · {l.onHand} on hand
                        {l.state === "expired" ? " · EXPIRED" : ""}
                      </option>
                    ))}
                  </select>
                </Field>
                {movementType === "adjustment" && (
                  <Field label="Adjustment direction">
                    <select
                      value={adjustmentDirection}
                      onChange={(e) => setAdjustmentDirection(e.target.value as "in" | "out")}
                      className={inputClass}
                    >
                      <option value="in">Add to stock</option>
                      <option value="out">Remove from stock</option>
                    </select>
                  </Field>
                )}
                <Field label="Laboratory / department">
                  <select
                    value={department}
                    onChange={(e) => setDepartment(e.target.value)}
                    className={inputClass}
                  >
                    {LAB_DEPARTMENTS.map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                </Field>
                {movementType === "issue" && (
                  <>
                    <Field label="Issued to" hint="The person or bench receiving the stock.">
                      <input
                        type="text"
                        value={issuedTo}
                        onChange={(e) => setIssuedTo(e.target.value)}
                        className={inputClass}
                      />
                    </Field>
                    <Field
                      label="Purpose"
                      hint="Stock issues record person and purpose only — they are deliberately not linked to individual test orders."
                    >
                      <input
                        type="text"
                        value={purpose}
                        onChange={(e) => setPurpose(e.target.value)}
                        placeholder="e.g. Routine malaria testing"
                        className={inputClass}
                      />
                    </Field>
                  </>
                )}
                {movementType === "transfer" && (
                  <Field label="New storage location">
                    <input
                      type="text"
                      value={destination}
                      onChange={(e) => setDestination(e.target.value)}
                      placeholder="e.g. Haematology bench fridge"
                      className={inputClass}
                    />
                  </Field>
                )}
                {(movementType === "disposal" || movementType === "adjustment") && (
                  <Field label="Reason">
                    <select
                      value={reason}
                      onChange={(e) => setReason(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">Select reason...</option>
                      {(movementType === "disposal" ? DISPOSAL_REASONS : ADJUSTMENT_REASONS).map(
                        (r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        )
                      )}
                    </select>
                  </Field>
                )}
                {selectedLot && outward && (
                  <p className="text-xs text-gray-500 sm:col-span-2">
                    Lot {selectedLot.batch.lotNumber} has {selectedLot.onHand}{" "}
                    {selectedItem?.packingUnit ?? "unit"} on hand.
                    {fefoRecommendation &&
                      selectedLot.batch.id !== fefoRecommendation.batch.id &&
                      ` A lot expiring sooner (${fefoRecommendation.batch.lotNumber}) is available — the choice is recorded as made.`}
                  </p>
                )}
              </div>
            )}

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Date and time" hint="Defaults to now; change it to back-date a record.">
                <input
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Note">
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>

            <button
              type="submit"
              disabled={saving || !itemId}
              className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2 disabled:opacity-50"
            >
              {saving ? "Recording..." : mode === "receive" ? "Record receipt" : "Record movement"}
            </button>
          </form>
        )}

        <div className="flex flex-wrap items-end gap-3 mb-3">
          <h2 className="text-sm font-medium text-gray-900 mr-auto">
            Ledger ({filteredMovements.length})
          </h2>
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            aria-label="Movement type"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">All movements</option>
            {MOVEMENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            aria-label="From date"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            aria-label="To date"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {loading && <p className="text-gray-600">Loading...</p>}

        {!loading && (
          <div className="border border-gray-200 rounded-lg p-4 overflow-x-auto">
            {filteredMovements.length === 0 ? (
              <p className="text-sm text-gray-600">No movements recorded.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <Th>Type</Th>
                    <Th>Item</Th>
                    <Th>Batch / lot</Th>
                    <Th>Quantity</Th>
                    <Th>Supplier / issued to</Th>
                    <Th>Laboratory / department</Th>
                    <Th>Reference</Th>
                    <Th>Recorded by</Th>
                    <Th>Date</Th>
                    <Th>Time</Th>
                  </tr>
                </thead>
                <tbody>
                  {filteredMovements.map((m) => {
                    const when = formatDateTime(m.occurredAt);
                    const sign = m.direction === "in" ? "+" : m.direction === "out" ? "−" : "±";
                    return (
                      <tr key={m.id} className="border-b border-gray-100 last:border-0">
                        <Td>{movementLabel(m.type)}</Td>
                        <Td>{m.itemName}</Td>
                        <Td>{m.lotNumber || "—"}</Td>
                        <Td>
                          {sign}
                          {formatQuantity(m.quantity, m.packingUnit, m.unitsPerPack, m.baseUnit)}
                        </Td>
                        <Td>{m.supplier || m.issuedTo || m.destination || "—"}</Td>
                        <Td>{m.department || "—"}</Td>
                        <Td>{m.deliveryNote || m.purpose || m.reason || m.note || "—"}</Td>
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
        )}
      </div>
    </main>
  );
}

export default function InventoryMovements() {
  return (
    <ProtectedRoute>
      <MovementsContent />
    </ProtectedRoute>
  );
}
