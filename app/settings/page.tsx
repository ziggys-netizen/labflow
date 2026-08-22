"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { db } from "../lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import {
  LabTest,
  parseSpecimenType,
  resolveSpecimenType,
  SPECIMEN_TYPE_LABELS,
  SPECIMEN_TYPES,
  TEST_CATALOG,
  TestParameter,
  type SpecimenType,
} from "../lib/testCatalog";
import AppNav from "../lib/AppNav";
import ProtectedRoute from "../lib/ProtectedRoute";
import ActingClinicPrompt from "../lib/ActingClinicPrompt";
import CatalogReviewBanner from "../lib/CatalogReviewBanner";
import { getClinicDocs, isOwner } from "../lib/clinicScope";
import { canEditTestCatalogue } from "../lib/permissions";
import { isTestReviewed, seedClinicCatalog } from "../lib/catalogSeed";
import { actorFromAuth, logAudit, safeLogAudit, type AuditActor } from "../lib/audit";
import { loadClinic } from "../lib/clinics";
import {
  RESULT_TYPES,
  RDT_VALUE_SET,
  normalizeParameter,
  type ResultType,
} from "../lib/resultModel";
import { testsForTier } from "../lib/testCatalog";
import type { ClinicTier } from "../lib/resultModel";

interface CatalogRow extends LabTest {
  firestoreId: string;
}

export default function Settings() {
  return (
    <ProtectedRoute require={canEditTestCatalogue}>
      <SettingsContent />
    </ProtectedRoute>
  );
}

function SettingsContent() {
  const { user, role, clinicId, writeClinicId, shift, loading } = useAuth();
  const [tests, setTests] = useState<CatalogRow[]>([]);
  const [loadingTests, setLoadingTests] = useState(true);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const [seeding, setSeeding] = useState(false);
  const allowed = canEditTestCatalogue(role);

  // --- Add New Test state ---
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTestName, setNewTestName] = useState("");
  const [newTestCategory, setNewTestCategory] = useState("");
  const [newTestPrice, setNewTestPrice] = useState("");
  const [newTestSpecimenType, setNewTestSpecimenType] = useState<SpecimenType | "">("");
  const [newTestParams, setNewTestParams] = useState<TestParameter[]>([
    { name: "", unit: "", referenceRange: "", resultType: "numeric" },
  ]);
  const [clinicTier, setClinicTier] = useState<ClinicTier | null>(null);
  const [addStatus, setAddStatus] = useState("");

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;
    async function loadCatalog() {
      try {
        const seedClinic = writeClinicId || clinicId;
        if (!seedClinic) {
          if (!cancelled) setTests([]);
          return;
        }
        try {
          const clinic = await loadClinic(seedClinic);
          if (!cancelled) setClinicTier(clinic?.tier ?? null);
        } catch (err) {
          console.error(err);
        }
        const catalogDocs = await getClinicDocs("testCatalog", role, clinicId, { sortBy: "name" });
        const scoped = catalogDocs.filter((d) => (d.data().clinicId as string) === seedClinic);
        if (cancelled) return;
        setTests(
          scoped.map((d) => {
            const data = d.data() as LabTest;
            return { ...data, firestoreId: d.id };
          })
        );
      } catch (err) {
        console.error(err);
      } finally {
        if (!cancelled) setLoadingTests(false);
      }
    }
    loadCatalog();
    return () => {
      cancelled = true;
    };
  }, [role, clinicId, writeClinicId, allowed]);

  async function updateParameter(
    testCode: string,
    paramIndex: number,
    field: "unit" | "referenceRange" | "resultType",
    value: string
  ) {
    const updated = tests.map((t) => {
      if (t.code !== testCode) return t;
      const newParams = [...t.parameters];
      const current = newParams[paramIndex];
      if (field === "resultType") {
        const resultType = value as ResultType;
        newParams[paramIndex] = {
          ...current,
          resultType,
          valueSet:
            resultType === "qualitative" || resultType === "semi_quantitative"
              ? current.valueSet && current.valueSet.length > 0
                ? current.valueSet
                : RDT_VALUE_SET
              : undefined,
        };
      } else {
        newParams[paramIndex] = { ...current, [field]: value };
      }
      return { ...t, parameters: newParams };
    });
    setTests(updated);
  }

  async function updatePrice(testCode: string, price: string) {
    const updated = tests.map((t) =>
      t.code === testCode ? { ...t, price: parseFloat(price) || 0 } : t
    );
    setTests(updated);
  }

  async function logReviewed(test: CatalogRow, actor: AuditActor) {
    try {
      await logAudit({
        clinicId: test.clinicId || writeClinicId || clinicId || null,
        actor,
        action: "catalogue.reviewed",
        targetCollection: "testCatalog",
        targetId: test.firestoreId,
        targetLabel: test.name,
        detail: { code: test.code },
      });
    } catch (err) {
      console.error(err);
    }
  }

  async function persistReviewed(testCodes: string[]) {
    const actor = actorFromAuth(user, role, shift);
    if (!actor) throw new Error("Not signed in");
    const reviewedAt = new Date().toISOString();
    for (const code of testCodes) {
      const test = tests.find((t) => t.code === code);
      if (!test) continue;
      await setDoc(
        doc(db, "testCatalog", test.firestoreId),
        {
          code: test.code,
          name: test.name,
          category: test.category,
          specimenType: resolveSpecimenType(test.specimenType, test.code),
          parameters: test.parameters.map((p) => normalizeParameter(p)),
          price: test.price || 0,
          clinicId: test.clinicId || writeClinicId || clinicId || null,
          reviewed: true,
          reviewedAt,
          reviewedBy: actor.email,
        },
        { merge: true }
      );
      await logReviewed(test, actor);
    }
    setTests((prev) =>
      prev.map((t) =>
        testCodes.includes(t.code)
          ? {
              ...t,
              reviewed: true,
              reviewedAt,
              reviewedBy: actor.email,
              specimenType: resolveSpecimenType(t.specimenType, t.code),
            }
          : t
      )
    );
  }

  async function saveSpecimenType(testCode: string, specimenType: SpecimenType) {
    const test = tests.find((t) => t.code === testCode);
    if (!test) return;
    setTests((prev) =>
      prev.map((t) => (t.code === testCode ? { ...t, specimenType } : t))
    );
    try {
      await setDoc(
        doc(db, "testCatalog", test.firestoreId),
        { specimenType },
        { merge: true }
      );
      const actor = actorFromAuth(user, role, shift);
      if (actor) {
        await safeLogAudit({
          clinicId: test.clinicId || writeClinicId || clinicId || null,
          actor,
          action: "catalogue.update",
          targetCollection: "testCatalog",
          targetId: test.firestoreId,
          targetLabel: test.name,
          detail: { fields: ["specimenType"], code: test.code },
        });
      }
    } catch (err) {
      console.error(err);
      setStatus("Failed to save specimen type.");
    }
  }

  async function saveTest(testCode: string) {
    const test = tests.find((t) => t.code === testCode);
    if (!test) return;
    setStatus("Saving...");
    try {
      await persistReviewed([testCode]);
      setStatus("Saved.");
      setEditingCode(null);
    } catch (err) {
      console.error(err);
      setStatus("Failed to save.");
    }
  }

  async function confirmRanges(testCodes: string[]) {
    setStatus("Confirming ranges...");
    try {
      await persistReviewed(testCodes);
      setStatus("Reference ranges confirmed for this clinic.");
    } catch (err) {
      console.error(err);
      setStatus("Failed to confirm ranges.");
    }
  }

  async function seedThisClinic() {
    const seedClinic = writeClinicId || clinicId;
    const actor = actorFromAuth(user, role, shift);
    if (!seedClinic || !actor || role !== "owner") return;
    setSeeding(true);
    setStatus("Seeding default catalogue...");
    try {
      const clinic = await loadClinic(seedClinic);
      const n = await seedClinicCatalog(seedClinic, { actor, onlyIfEmpty: true, tier: clinic?.tier });
      setClinicTier(clinic?.tier ?? null);
      const catalogDocs = await getClinicDocs("testCatalog", role, clinicId, { sortBy: "name" });
      const scoped = catalogDocs.filter((d) => (d.data().clinicId as string) === seedClinic);
      setTests(
        scoped.map((d) => {
          const data = d.data() as LabTest;
          return { ...data, firestoreId: d.id };
        })
      );
      setStatus(
        n === 0
          ? "This clinic already has a catalogue."
          : `Seeded ${n} tests for this clinic's tier. Confirm them for this laboratory.`
      );
    } catch (err) {
      console.error(err);
      setStatus("Failed to seed the catalogue.");
    } finally {
      setSeeding(false);
    }
  }

  // --- Add New Test logic ---

  function addParameterRow() {
    setNewTestParams([...newTestParams, { name: "", unit: "", referenceRange: "", resultType: "numeric" }]);
  }

  function removeParameterRow(index: number) {
    if (newTestParams.length <= 1) return;
    setNewTestParams(newTestParams.filter((_, i) => i !== index));
  }

  function updateNewParam(
    index: number,
    field: "name" | "unit" | "referenceRange" | "resultType",
    value: string
  ) {
    const updated = newTestParams.map((p, i) => {
      if (i !== index) return p;
      if (field === "resultType") {
        const resultType = value as ResultType;
        return {
          ...p,
          resultType,
          valueSet:
            resultType === "qualitative" || resultType === "semi_quantitative"
              ? p.valueSet && p.valueSet.length > 0
                ? p.valueSet
                : RDT_VALUE_SET
              : undefined,
        };
      }
      return { ...p, [field]: value };
    });
    setNewTestParams(updated);
  }

  function generateTestCode(name: string): string {
    let base = name
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
      .slice(0, 8);
    if (!base) base = "TEST";

    const existingCodes = tests.map((t) => t.code);
    let code = base;
    if (existingCodes.includes(code)) {
      const suffix = Math.floor(10 + Math.random() * 90);
      code = `${base}${suffix}`;
    }
    return code;
  }

  async function handleAddNewTest() {
    setAddStatus("");

    if (!newTestName.trim()) {
      setAddStatus("Test name is required.");
      return;
    }
    const specimenType = parseSpecimenType(newTestSpecimenType);
    if (!specimenType) {
      setAddStatus("Specimen type is required.");
      return;
    }
    const validParams = newTestParams.filter((p) => p.name.trim() !== "");
    if (validParams.length === 0) {
      setAddStatus("Add at least one parameter with a name.");
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

    const code = generateTestCode(newTestName);
    const newTest: CatalogRow = {
      firestoreId: `${writeClinicId}_${code}`,
      code,
      name: newTestName.trim(),
      category: newTestCategory.trim() || "Other",
      specimenType,
      parameters: validParams.map((p) => normalizeParameter(p)),
      price: parseFloat(newTestPrice) || 0,
      clinicId: writeClinicId,
    };

    setAddStatus("Saving...");
    try {
      await setDoc(doc(db, "testCatalog", newTest.firestoreId), {
        code: newTest.code,
        name: newTest.name,
        category: newTest.category,
        specimenType: newTest.specimenType,
        parameters: newTest.parameters,
        price: newTest.price,
        clinicId: writeClinicId,
        reviewed: true,
        reviewedAt: new Date().toISOString(),
        reviewedBy: user?.email ?? null,
      });
      const actor = actorFromAuth(user, role, shift);
      if (actor) {
        await safeLogAudit({
          clinicId: writeClinicId,
          actor,
          action: "catalogue.update",
          targetCollection: "testCatalog",
          targetId: newTest.firestoreId,
          targetLabel: newTest.name,
          detail: { fields: ["code", "name", "parameters", "price", "specimenType"], code: newTest.code },
        });
      }
      setTests((prev) => [...prev, { ...newTest, reviewed: true }].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTestName("");
      setNewTestCategory("");
      setNewTestPrice("");
      setNewTestSpecimenType("");
      setNewTestParams([{ name: "", unit: "", referenceRange: "", resultType: "numeric" }]);
      setShowAddForm(false);
      setAddStatus("New test added successfully.");
      setTimeout(() => setAddStatus(""), 3000);
    } catch (err) {
      console.error(err);
      setAddStatus("Failed to save new test. Please try again.");
    }
  }

  if (loading || loadingTests) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="min-h-[50vh] flex items-center justify-center text-gray-600">Loading...</div>
      </main>
    );
  }
  if (!allowed) return null;

  const unreviewed = tests.filter((t) => !isTestReviewed(t));

  const scopeId = writeClinicId || clinicId;
  const needsClinic = isOwner(role) && !writeClinicId;

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <CatalogReviewBanner />
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Clinic Settings</h1>
        <p className="text-gray-600 mb-6">Edit test units, reference ranges, and pricing.</p>
        {needsClinic && <ActingClinicPrompt />}
        {!needsClinic && tests.length === 0 && (
          <div className="border-2 border-red-300 bg-red-50 rounded-lg p-4 mb-6">
            <p className="font-semibold text-red-950">This clinic has no test catalogue.</p>
            <p className="text-sm text-red-900 mt-1">
              Product default ranges are not used. Seed the default catalogue or add tests below
              before ordering or entering results.
            </p>
            {role === "owner" && scopeId ? (
              <button
                type="button"
                onClick={seedThisClinic}
                disabled={seeding}
                className="mt-3 bg-gray-900 text-white text-sm rounded-lg px-3 py-1.5 disabled:opacity-50"
              >
                {seeding
                  ? "Seeding..."
                  : `Seed ${clinicTier ? testsForTier(clinicTier).length : TEST_CATALOG.length} tests`}
              </button>
            ) : (
              <p className="text-sm text-red-900 mt-2">
                Ask the platform owner to seed empty clinic catalogues from the Owner page.
              </p>
            )}
          </div>
        )}
        {unreviewed.length > 0 && (
          <div className="mb-6">
            <button
              type="button"
              onClick={() => confirmRanges(unreviewed.map((t) => t.code))}
              className="bg-gray-900 text-white text-sm rounded-lg px-3 py-1.5"
            >
              Confirm all as correct
            </button>
          </div>
        )}

        {/* --- Add New Test section --- */}
        <div className="mb-8">
          <button
            onClick={() => setShowAddForm(!showAddForm)}
            className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2"
          >
            {showAddForm ? "Cancel" : "+ Add New Test"}
          </button>

          {showAddForm && (
            <div className="border border-gray-200 rounded-lg p-4 mt-3 space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Test name</label>
                <input
                  type="text"
                  value={newTestName}
                  onChange={(e) => setNewTestName(e.target.value)}
                  placeholder="e.g. Thyroid Function Test"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
                <input
                  type="text"
                  value={newTestCategory}
                  onChange={(e) => setNewTestCategory(e.target.value)}
                  placeholder="e.g. Haematology, Serology, Clinical Chemistry"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Price (D)</label>
                <input
                  type="number"
                  value={newTestPrice}
                  onChange={(e) => setNewTestPrice(e.target.value)}
                  className="w-32 border border-gray-300 rounded-lg px-3 py-2 text-sm"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Specimen type <span className="font-normal text-red-600">(required)</span>
                </label>
                <select
                  value={newTestSpecimenType}
                  onChange={(e) =>
                    setNewTestSpecimenType((parseSpecimenType(e.target.value) || "") as SpecimenType | "")
                  }
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select specimen type</option>
                  {SPECIMEN_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {SPECIMEN_TYPE_LABELS[type]}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">Parameters</label>
                <div className="space-y-2">
                  {newTestParams.map((p, i) => (
                    <div key={i} className="grid grid-cols-5 gap-2 items-center">
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => updateNewParam(i, "name", e.target.value)}
                        placeholder="Parameter name"
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                      <select
                        value={p.resultType || "numeric"}
                        onChange={(e) => updateNewParam(i, "resultType", e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                      >
                        {RESULT_TYPES.filter((type) => type !== "calculated").map((type) => (
                          <option key={type} value={type}>
                            {type.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={p.unit}
                        onChange={(e) => updateNewParam(i, "unit", e.target.value)}
                        placeholder="Unit"
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                      <input
                        type="text"
                        value={p.referenceRange}
                        onChange={(e) => updateNewParam(i, "referenceRange", e.target.value)}
                        placeholder="Reference range"
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                      <button
                        onClick={() => removeParameterRow(i)}
                        className="text-sm text-red-600 hover:text-red-800 text-left"
                      >
                        Remove
                      </button>
                    </div>
                  ))}
                </div>
                <button
                  onClick={addParameterRow}
                  className="mt-2 text-sm text-gray-900 underline"
                >
                  + Add parameter
                </button>
              </div>

              <button
                onClick={handleAddNewTest}
                className="bg-gray-900 text-white text-sm rounded px-3 py-1.5"
              >
                Save new test
              </button>

              {addStatus && <p className="text-sm text-gray-600">{addStatus}</p>}
            </div>
          )}
        </div>

        {status && <p className="text-sm text-gray-600 mb-4">{status}</p>}

        <div className="space-y-4">
          {tests.map((test) => (
            <div key={test.firestoreId} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-medium text-gray-900">{test.name}</h2>
                  <p className="text-xs text-gray-500">{test.category}</p>
                  <label className="mt-2 flex items-center gap-2 text-xs text-gray-600">
                    Specimen
                    <select
                      value={parseSpecimenType(test.specimenType) || resolveSpecimenType(test.specimenType, test.code)}
                      onChange={(e) => {
                        const next = parseSpecimenType(e.target.value);
                        if (next) void saveSpecimenType(test.code, next);
                      }}
                      className="border border-gray-300 rounded px-2 py-1 text-xs text-gray-900"
                    >
                      {SPECIMEN_TYPES.map((type) => (
                        <option key={type} value={type}>
                          {SPECIMEN_TYPE_LABELS[type]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!isTestReviewed(test) && (
                    <span className="mt-1 inline-block rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900">
                      Not reviewed
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Price (D):</label>
                  <input
                    type="number"
                    defaultValue={test.price || 0}
                    onChange={(e) => updatePrice(test.code, e.target.value)}
                    className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
                  />
                  {!isTestReviewed(test) && (
                    <button
                      type="button"
                      onClick={() => confirmRanges([test.code])}
                      className="text-sm text-gray-900 underline"
                    >
                      Confirm ranges
                    </button>
                  )}
                  <button
                    onClick={() => setEditingCode(editingCode === test.code ? null : test.code)}
                    className="text-sm text-gray-900 underline"
                  >
                    {editingCode === test.code ? "Close" : "Edit parameters"}
                  </button>
                </div>
              </div>

              {editingCode === test.code && (
                <div className="space-y-2 mt-3 border-t border-gray-100 pt-3">
                  {test.parameters.map((p, i) => (
                    <div key={i} className="grid grid-cols-4 gap-2 items-center">
                      <span className="text-sm text-gray-700">{p.name}</span>
                      <select
                        value={normalizeParameter(p).resultType}
                        onChange={(e) => updateParameter(test.code, i, "resultType", e.target.value)}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                      >
                        {RESULT_TYPES.filter((type) => type !== "calculated").map((type) => (
                          <option key={type} value={type}>
                            {type.replace("_", " ")}
                          </option>
                        ))}
                      </select>
                      <input
                        type="text"
                        value={p.unit}
                        onChange={(e) => updateParameter(test.code, i, "unit", e.target.value)}
                        placeholder="Unit"
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                      <input
                        type="text"
                        value={p.referenceRange}
                        onChange={(e) => updateParameter(test.code, i, "referenceRange", e.target.value)}
                        placeholder="Reference range"
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                      />
                    </div>
                  ))}
                  <button
                    onClick={() => saveTest(test.code)}
                    className="mt-2 bg-gray-900 text-white text-sm rounded px-3 py-1.5"
                  >
                    Save changes
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}