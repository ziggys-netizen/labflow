"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useAuth } from "../../lib/AuthContext";
import { db } from "../../lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import AppNav from "../../lib/AppNav";
import ProtectedRoute from "../../lib/ProtectedRoute";
import ActingClinicPrompt from "../../lib/ActingClinicPrompt";
import { getClinicDocs, isOwner, ownerActingCreateFields } from "../../lib/clinicScope";
import { requireSurface } from "../../lib/surfaces";
import { actorFromAuth, safeLogAudit } from "../../lib/audit";
import { priceFieldLabel } from "../../lib/currency";
import { generateServiceCode, serviceIsActive, type ClinicService } from "../../lib/serviceCatalog";

interface ServiceRow extends ClinicService {
  firestoreId: string;
}

export default function ServicesSettings() {
  return (
    <ProtectedRoute require={requireSurface("services")}>
      <ServicesContent />
    </ProtectedRoute>
  );
}

function ServicesContent() {
  const { user, role, clinicId, writeClinicId, shift, loading } = useAuth();
  const [services, setServices] = useState<ServiceRow[]>([]);
  const [loadingServices, setLoadingServices] = useState(true);
  const [status, setStatus] = useState("");

  const [showAddForm, setShowAddForm] = useState(false);
  const [newName, setNewName] = useState("");
  const [newPrice, setNewPrice] = useState("");
  const [addStatus, setAddStatus] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function loadServices() {
      try {
        const seedClinic = writeClinicId || clinicId;
        if (!seedClinic) {
          if (!cancelled) setServices([]);
          return;
        }
        const docs = await getClinicDocs("serviceCatalog", role, clinicId, { sortBy: "name" });
        const scoped = docs.filter((d) => (d.data().clinicId as string) === seedClinic);
        if (cancelled) return;
        setServices(
          scoped.map((d) => {
            const data = d.data() as ClinicService;
            return { ...data, firestoreId: d.id };
          })
        );
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoadingServices(false);
      }
    }
    loadServices();
    return () => {
      cancelled = true;
    };
  }, [role, clinicId, writeClinicId]);

  async function savePrice(firestoreId: string, code: string, name: string, priceRaw: string) {
    const price = parseFloat(priceRaw);
    const clean = Number.isFinite(price) && price >= 0 ? price : 0;
    setServices((prev) =>
      prev.map((s) => (s.firestoreId === firestoreId ? { ...s, price: clean } : s))
    );
    try {
      await setDoc(doc(db, "serviceCatalog", firestoreId), { price: clean }, { merge: true });
      const actor = actorFromAuth(user, role, shift);
      if (actor) {
        await safeLogAudit({
          clinicId: writeClinicId || clinicId,
          actor,
          action: "service.catalogueUpdate",
          targetCollection: "serviceCatalog",
          targetId: firestoreId,
          targetLabel: name,
          detail: { fields: ["price"], code },
        });
      }
    } catch (err) {
      console.error(err);
      setStatus("Failed to save price.");
    }
  }

  async function toggleActive(firestoreId: string, code: string, name: string, active: boolean) {
    setServices((prev) =>
      prev.map((s) => (s.firestoreId === firestoreId ? { ...s, active } : s))
    );
    try {
      await setDoc(doc(db, "serviceCatalog", firestoreId), { active }, { merge: true });
      const actor = actorFromAuth(user, role, shift);
      if (actor) {
        await safeLogAudit({
          clinicId: writeClinicId || clinicId,
          actor,
          action: "service.catalogueUpdate",
          targetCollection: "serviceCatalog",
          targetId: firestoreId,
          targetLabel: name,
          detail: { fields: ["active"], code },
        });
      }
    } catch (err) {
      console.error(err);
      setStatus("Failed to save.");
    }
  }

  async function handleAddNewService() {
    setAddStatus("");
    if (!newName.trim()) {
      setAddStatus("Service name is required.");
      return;
    }
    if (!writeClinicId) {
      setAddStatus(
        isOwner(role)
          ? "Select a clinic from the menu above to create records."
          : "Your account is not linked to a clinic yet."
      );
      return;
    }
    const code = generateServiceCode(newName, services.map((s) => s.code));
    const price = parseFloat(newPrice);
    const clean = Number.isFinite(price) && price >= 0 ? price : 0;
    const firestoreId = `${writeClinicId}_${code}`;
    setAddStatus("Saving...");
    try {
      await setDoc(doc(db, "serviceCatalog", firestoreId), {
        code,
        name: newName.trim(),
        price: clean,
        active: true,
        clinicId: writeClinicId,
        ...ownerActingCreateFields(role),
      });
      const actor = actorFromAuth(user, role, shift);
      if (actor) {
        await safeLogAudit({
          clinicId: writeClinicId,
          actor,
          action: "service.catalogueUpdate",
          targetCollection: "serviceCatalog",
          targetId: firestoreId,
          targetLabel: newName.trim(),
          detail: { fields: ["code", "name", "price"], code },
        });
      }
      setServices((prev) =>
        [...prev, { code, name: newName.trim(), price: clean, active: true, clinicId: writeClinicId, firestoreId }].sort(
          (a, b) => a.name.localeCompare(b.name)
        )
      );
      setNewName("");
      setNewPrice("");
      setShowAddForm(false);
      setAddStatus("Service added.");
      setTimeout(() => setAddStatus(""), 3000);
    } catch (err) {
      console.error(err);
      setAddStatus("Failed to save. Please try again.");
    }
  }

  if (loading || loadingServices) {
    return (
      <main className="min-h-screen">
        <AppNav />
        <div className="min-h-[50vh] flex items-center justify-center text-gray-600">Loading...</div>
      </main>
    );
  }

  const needsClinic = isOwner(role) && !writeClinicId;

  return (
    <main className="min-h-screen">
      <AppNav />
      <div className="max-w-2xl mx-auto px-6 py-16">
        <div className="flex items-center justify-between mb-2">
          <h1 className="text-2xl font-semibold text-gray-900">Services</h1>
          <Link href="/settings/catalogue" className="text-sm text-gray-900 underline">
            Catalogue →
          </Link>
        </div>
        <p className="text-gray-600 mb-6">
          Non-lab items a cashier can bill — consultation, a dressing, a procedure fee. Not a lab
          test: nothing here creates an order or goes through sample collection or results.
          Examples clinics commonly bill this way: Consultation, Wound dressing, Minor procedure,
          Vaccination, Referral letter — add only what your clinic actually charges for.
        </p>
        {needsClinic && <ActingClinicPrompt />}

        {!needsClinic && (
          <div className="mb-8">
            <button
              onClick={() => setShowAddForm(!showAddForm)}
              className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2"
            >
              {showAddForm ? "Cancel" : "+ Add service"}
            </button>
            {showAddForm && (
              <div className="border border-gray-200 rounded-lg p-4 mt-3 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Service name</label>
                  <input
                    type="text"
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="e.g. Consultation"
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">{priceFieldLabel()}</label>
                  <input
                    type="number"
                    min={0}
                    value={newPrice}
                    onChange={(e) => setNewPrice(e.target.value)}
                    className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <button
                  onClick={handleAddNewService}
                  className="bg-gray-900 text-white text-sm rounded px-3 py-1.5"
                >
                  Save service
                </button>
                {addStatus && <p className="text-sm text-gray-600">{addStatus}</p>}
              </div>
            )}
          </div>
        )}

        {status && <p className="text-sm text-gray-600 mb-4">{status}</p>}

        {!needsClinic && services.length === 0 && (
          <p className="text-sm text-gray-500">No services yet. Add one above.</p>
        )}

        <div className="space-y-3">
          {services.map((service) => (
            <div
              key={service.firestoreId}
              className="border border-gray-200 rounded-lg p-4 flex items-center justify-between gap-3"
            >
              <div>
                <p className="font-medium text-gray-900">{service.name}</p>
                <p className="text-xs text-gray-500 lf-num">{service.code}</p>
              </div>
              <div className="flex items-center gap-3">
                <label className="text-sm text-gray-600">{priceFieldLabel()}:</label>
                <input
                  type="number"
                  min={0}
                  defaultValue={service.price || 0}
                  onBlur={(e) => void savePrice(service.firestoreId, service.code, service.name, e.target.value)}
                  className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
                />
                <label className="flex items-center gap-1.5 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={serviceIsActive(service)}
                    onChange={(e) =>
                      void toggleActive(service.firestoreId, service.code, service.name, e.target.checked)
                    }
                  />
                  Active
                </label>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
