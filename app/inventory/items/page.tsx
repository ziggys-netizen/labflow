"use client";

import { useEffect, useState } from "react";
import { addDoc, collection, doc, updateDoc } from "firebase/firestore";
import ProtectedRoute from "../../lib/ProtectedRoute";
import AppNav from "../../lib/AppNav";
import { useAuth } from "../../lib/AuthContext";
import { db } from "../../lib/firebase";
import { getClinicDocs, isOwner, loadClinicNames, ownerActingCreateFields } from "../../lib/clinicScope";
import ActingClinicPrompt from "../../lib/ActingClinicPrompt";
import { makeActorStamp } from "../../lib/identity";
import { canManageInventoryItems, canViewInventory } from "../../lib/permissions";
import {
  BASE_UNITS,
  INVENTORY_CATEGORIES,
  InventoryItem,
  LAB_DEPARTMENTS,
  PACKING_UNITS,
  STORAGE_CONDITIONS,
  mapItem,
  packDescription,
} from "../../lib/inventory";

interface CatalogOption {
  code: string;
  name: string;
}

interface FormState {
  name: string;
  category: string;
  testCode: string;
  manufacturer: string;
  supplier: string;
  catalogueCode: string;
  packingUnit: string;
  unitsPerPack: string;
  baseUnit: string;
  unitSize: string;
  packsPerCarton: string;
  storageCondition: string;
  department: string;
  minimumStock: string;
  clinicId: string;
}

const BLANK: FormState = {
  name: "",
  category: "Rapid test kit",
  testCode: "",
  manufacturer: "",
  supplier: "",
  catalogueCode: "",
  packingUnit: "Box",
  unitsPerPack: "1",
  baseUnit: "test",
  unitSize: "",
  packsPerCarton: "",
  storageCondition: "Room temperature",
  department: "Main store",
  minimumStock: "0",
  clinicId: "",
};

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}

const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm";

function ItemsContent() {
  const { user, role, clinicId, writeClinicId, username } = useAuth();
  const owner = isOwner(role);
  const allowed = canViewInventory(role);
  const canEdit = canManageInventoryItems(role);

  const [items, setItems] = useState<InventoryItem[]>([]);
  const [catalog, setCatalog] = useState<CatalogOption[]>([]);
  const [clinicNames, setClinicNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [reloadToken, setReloadToken] = useState(0);

  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(BLANK);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;

    async function load() {
      try {
        const [itemDocs, catalogDocs] = await Promise.all([
          getClinicDocs("inventoryItems", role, clinicId, { sortBy: "name" }),
          getClinicDocs("testCatalog", role, clinicId, { sortBy: "name" }),
        ]);
        const mapped = itemDocs.map(mapItem);
        const names = await loadClinicNames(role, [clinicId, ...mapped.map((i) => i.clinicId)]);

        if (cancelled) return;
        setItems(mapped);
        setClinicNames(names);
        const seen = new Set<string>();
        setCatalog(
          catalogDocs
            .map((d) => ({
              code: (d.data().code as string) || d.id,
              name: (d.data().name as string) || d.id,
            }))
            .filter((t) => (seen.has(t.code) ? false : seen.add(t.code)))
        );
      } catch (err) {
        console.error(err);
        if (!cancelled) setStatus("Could not load the item list.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [allowed, role, clinicId, reloadToken]);

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((prev) => ({ ...prev, [key]: value }));
  }

  function startCreate() {
    if (!canEdit) return;
    setEditingId(null);
    setForm({ ...BLANK, clinicId: writeClinicId || "" });
    setShowForm(true);
    setStatus("");
  }

  function startEdit(item: InventoryItem) {
    if (!canEdit) return;
    setEditingId(item.id);
    setForm({
      name: item.name,
      category: item.category,
      testCode: item.testCode ?? "",
      manufacturer: item.manufacturer,
      supplier: item.supplier,
      catalogueCode: item.catalogueCode,
      packingUnit: item.packingUnit,
      unitsPerPack: String(item.unitsPerPack),
      baseUnit: item.baseUnit,
      unitSize: item.unitSize,
      packsPerCarton: item.packsPerCarton === null ? "" : String(item.packsPerCarton),
      storageCondition: item.storageCondition,
      department: item.department,
      minimumStock: String(item.minimumStock),
      clinicId: item.clinicId ?? "",
    });
    setShowForm(true);
    setStatus("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !canEdit) return;
    setStatus("");

    const targetClinicId = editingId && owner ? form.clinicId : writeClinicId;
    if (!form.name.trim()) {
      setStatus("Item name is required.");
      return;
    }
    if (!targetClinicId) {
      setStatus(
        owner
          ? "Select a clinic from the menu above to create records."
          : "Your account is not linked to a clinic yet."
      );
      return;
    }
    const unitsPerPack = Number(form.unitsPerPack);
    if (!Number.isFinite(unitsPerPack) || unitsPerPack < 1) {
      setStatus("Units per pack must be 1 or more.");
      return;
    }
    const minimumStock = Number(form.minimumStock);
    if (!Number.isFinite(minimumStock) || minimumStock < 0) {
      setStatus("Minimum stock cannot be negative.");
      return;
    }

    const payload = {
      clinicId: targetClinicId,
      name: form.name.trim(),
      category: form.category,
      testCode: form.testCode || null,
      manufacturer: form.manufacturer.trim(),
      supplier: form.supplier.trim(),
      catalogueCode: form.catalogueCode.trim(),
      packingUnit: form.packingUnit,
      unitsPerPack,
      baseUnit: form.baseUnit,
      unitSize: form.unitSize.trim(),
      packsPerCarton: form.packsPerCarton ? Number(form.packsPerCarton) : null,
      storageCondition: form.storageCondition,
      department: form.department,
      minimumStock,
      active: true,
      updatedAt: new Date().toISOString(),
    };

    setSaving(true);
    try {
      if (editingId) {
        await updateDoc(doc(db, "inventoryItems", editingId), payload);
        setStatus("Item updated.");
      } else {
        await addDoc(collection(db, "inventoryItems"), {
          ...payload,
          createdAt: new Date().toISOString(),
          createdBy: makeActorStamp(user, username),
          ...ownerActingCreateFields(role),
        });
        setStatus("Item added.");
      }
      setShowForm(false);
      setEditingId(null);
      setForm(BLANK);
      setReloadToken((n) => n + 1);
    } catch (err) {
      console.error(err);
      setStatus("Failed to save the item.");
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(item: InventoryItem) {
    if (!canEdit) return;
    setStatus("");
    try {
      await updateDoc(doc(db, "inventoryItems", item.id), {
        active: !item.active,
        updatedAt: new Date().toISOString(),
      });
      setStatus(item.active ? "Item retired." : "Item restored.");
      setReloadToken((n) => n + 1);
    } catch (err) {
      console.error(err);
      setStatus("Failed to update the item.");
    }
  }

  if (!allowed) return null;

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-4xl mx-auto px-6 py-16">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
          <h1 className="text-2xl font-semibold text-gray-900">Stock items</h1>
          <a href="/inventory" className="text-sm text-gray-900 underline font-medium">
            Back to store
          </a>
        </div>
        <p className="text-gray-600 mb-6">
          What this laboratory stocks, and how each product is packed. Lot numbers and expiry dates
          belong to a delivery, not to the item, so they are recorded when stock is received.
        </p>

        {status && <p className="text-sm text-gray-600 mb-4">{status}</p>}
        {owner && !writeClinicId && canEdit && <ActingClinicPrompt />}

        {canEdit && !showForm && (
          <button
            onClick={startCreate}
            className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2 mb-6"
          >
            + Add item
          </button>
        )}

        {canEdit && showForm && (
          <form onSubmit={handleSubmit} className="border border-gray-200 rounded-lg p-4 mb-8 space-y-4">
            <h2 className="font-medium text-gray-900">{editingId ? "Edit item" : "New item"}</h2>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Item name">
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => set("name", e.target.value)}
                  placeholder="e.g. Malaria RDT cassettes"
                  className={inputClass}
                />
              </Field>
              <Field label="Category">
                <select
                  value={form.category}
                  onChange={(e) => set("category", e.target.value)}
                  className={inputClass}
                >
                  {INVENTORY_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Associated test" hint="Links usage to the test catalogue where relevant.">
                <select
                  value={form.testCode}
                  onChange={(e) => set("testCode", e.target.value)}
                  className={inputClass}
                >
                  <option value="">Not test specific</option>
                  {catalog.map((t) => (
                    <option key={t.code} value={t.code}>
                      {t.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Manufacturer" hint="Required for ISO 15189 traceability.">
                <input
                  type="text"
                  value={form.manufacturer}
                  onChange={(e) => set("manufacturer", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Supplier">
                <input
                  type="text"
                  value={form.supplier}
                  onChange={(e) => set("supplier", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Catalogue / product code">
                <input
                  type="text"
                  value={form.catalogueCode}
                  onChange={(e) => set("catalogueCode", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Packing unit" hint="How stock is counted on the shelf.">
                <select
                  value={form.packingUnit}
                  onChange={(e) => set("packingUnit", e.target.value)}
                  className={inputClass}
                >
                  {PACKING_UNITS.map((u) => (
                    <option key={u.value} value={u.value}>
                      {u.value} — {u.hint}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Units per pack" hint="e.g. 25 for a box of 25 tests. Use 1 if not divisible.">
                <input
                  type="number"
                  min={1}
                  value={form.unitsPerPack}
                  onChange={(e) => set("unitsPerPack", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Unit consumed" hint="What one unit inside the pack is.">
                <select
                  value={form.baseUnit}
                  onChange={(e) => set("baseUnit", e.target.value)}
                  className={inputClass}
                >
                  {BASE_UNITS.map((u) => (
                    <option key={u} value={u}>
                      {u}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Volume / unit size" hint="Optional, e.g. 100 mL or 25 strips.">
                <input
                  type="text"
                  value={form.unitSize}
                  onChange={(e) => set("unitSize", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Packs per carton" hint="Optional packaging hierarchy.">
                <input
                  type="number"
                  min={1}
                  value={form.packsPerCarton}
                  onChange={(e) => set("packsPerCarton", e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Storage condition">
                <select
                  value={form.storageCondition}
                  onChange={(e) => set("storageCondition", e.target.value)}
                  className={inputClass}
                >
                  {STORAGE_CONDITIONS.map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Usual laboratory / department">
                <select
                  value={form.department}
                  onChange={(e) => set("department", e.target.value)}
                  className={inputClass}
                >
                  {LAB_DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Minimum stock" hint="Packs. Triggers the low-stock flag at or below this.">
                <input
                  type="number"
                  min={0}
                  value={form.minimumStock}
                  onChange={(e) => set("minimumStock", e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>

            <div className="flex items-center gap-3">
              <button
                type="submit"
                disabled={saving}
                className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2 disabled:opacity-50"
              >
                {saving ? "Saving..." : editingId ? "Save changes" : "Add item"}
              </button>
              <button
                type="button"
                onClick={() => {
                  setShowForm(false);
                  setEditingId(null);
                }}
                className="text-sm text-gray-700 underline"
              >
                Cancel
              </button>
            </div>
          </form>
        )}

        {loading && <p className="text-gray-600">Loading...</p>}
        {!loading && items.length === 0 && (
          <p className="text-gray-600">No items recorded yet.</p>
        )}

        <div className="space-y-3">
          {items.map((item) => (
            <div
              key={item.id}
              className={`border rounded-lg p-4 ${
                item.active ? "border-gray-200" : "border-gray-100 bg-gray-50"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="font-medium text-gray-900">
                    {item.name}
                    {!item.active && <span className="text-sm text-gray-500"> — retired</span>}
                  </p>
                  <p className="text-sm text-gray-600">
                    {item.category} · {packDescription(item)}
                  </p>
                  <p className="text-xs text-gray-400 mt-1">
                    {[
                      item.manufacturer && `Manufacturer: ${item.manufacturer}`,
                      item.supplier && `Supplier: ${item.supplier}`,
                      item.catalogueCode && `Cat. ${item.catalogueCode}`,
                      `Store at ${item.storageCondition}`,
                      `Minimum ${item.minimumStock} ${item.packingUnit}`,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </p>
                  {owner && item.clinicId && (
                    <p className="text-xs text-gray-400">
                      Clinic: {clinicNames[item.clinicId] || item.clinicId}
                    </p>
                  )}
                </div>
                {canEdit && (
                  <div className="flex items-center gap-3">
                    <button onClick={() => startEdit(item)} className="text-sm text-gray-900 underline">
                      Edit
                    </button>
                    <button onClick={() => toggleActive(item)} className="text-sm text-gray-600 underline">
                      {item.active ? "Retire" : "Restore"}
                    </button>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}

export default function InventoryItems() {
  return (
    <ProtectedRoute require={canViewInventory}>
      <ItemsContent />
    </ProtectedRoute>
  );
}
