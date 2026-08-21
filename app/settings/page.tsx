"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { db } from "../lib/firebase";
import { doc, setDoc } from "firebase/firestore";
import { TEST_CATALOG, LabTest, TestParameter } from "../lib/testCatalog";
import AppNav from "../lib/AppNav";
import ProtectedRoute from "../lib/ProtectedRoute";
import ActingClinicPrompt from "../lib/ActingClinicPrompt";
import { getClinicDocs, isOwner } from "../lib/clinicScope";
import { canEditTestCatalogue } from "../lib/permissions";

interface CatalogRow extends LabTest {
  firestoreId: string;
  clinicId?: string | null;
}

export default function Settings() {
  return (
    <ProtectedRoute require={canEditTestCatalogue}>
      <SettingsContent />
    </ProtectedRoute>
  );
}

function SettingsContent() {
  const { role, clinicId, writeClinicId, loading } = useAuth();
  const [tests, setTests] = useState<CatalogRow[]>([]);
  const [loadingTests, setLoadingTests] = useState(true);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [status, setStatus] = useState("");
  const allowed = canEditTestCatalogue(role);

  // --- Add New Test state ---
  const [showAddForm, setShowAddForm] = useState(false);
  const [newTestName, setNewTestName] = useState("");
  const [newTestCategory, setNewTestCategory] = useState("");
  const [newTestPrice, setNewTestPrice] = useState("");
  const [newTestParams, setNewTestParams] = useState<TestParameter[]>([
    { name: "", unit: "", referenceRange: "" },
  ]);
  const [addStatus, setAddStatus] = useState("");

  useEffect(() => {
    if (!allowed) return;
    async function loadCatalog() {
      try {
        const catalogDocs = await getClinicDocs("testCatalog", role, clinicId, { sortBy: "name" });

        const existingCodes = catalogDocs.map((d) => (d.data().code as string) || d.id);
        const missingTests = TEST_CATALOG.filter((t) => !existingCodes.includes(t.code));
        if (clinicId) {
          for (const test of missingTests) {
            await setDoc(doc(db, "testCatalog", `${clinicId}_${test.code}`), { ...test, clinicId });
          }
        }
        const finalDocs =
          missingTests.length > 0 && clinicId
            ? await getClinicDocs("testCatalog", role, clinicId, { sortBy: "name" })
            : catalogDocs;
        setTests(
          finalDocs.map((d) => {
            const data = d.data() as LabTest;
            return { ...data, firestoreId: d.id };
          })
        );
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingTests(false);
      }
    }
    loadCatalog();
  }, [role, clinicId, allowed]);

  async function updateParameter(
    testCode: string,
    paramIndex: number,
    field: "unit" | "referenceRange",
    value: string
  ) {
    const updated = tests.map((t) => {
      if (t.code !== testCode) return t;
      const newParams = [...t.parameters];
      newParams[paramIndex] = { ...newParams[paramIndex], [field]: value };
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

  async function saveTest(testCode: string) {
    const test = tests.find((t) => t.code === testCode);
    if (!test) return;
    setStatus("Saving...");
    try {
      await setDoc(doc(db, "testCatalog", test.firestoreId), {
        code: test.code,
        name: test.name,
        category: test.category,
        parameters: test.parameters,
        price: test.price || 0,
        clinicId: test.clinicId || writeClinicId || clinicId || null,
      });
      setStatus("Saved.");
      setEditingCode(null);
    } catch (err) {
      console.error(err);
      setStatus("Failed to save.");
    }
  }

  // --- Add New Test logic ---

  function addParameterRow() {
    setNewTestParams([...newTestParams, { name: "", unit: "", referenceRange: "" }]);
  }

  function removeParameterRow(index: number) {
    if (newTestParams.length <= 1) return;
    setNewTestParams(newTestParams.filter((_, i) => i !== index));
  }

  function updateNewParam(
    index: number,
    field: "name" | "unit" | "referenceRange",
    value: string
  ) {
    const updated = newTestParams.map((p, i) =>
      i === index ? { ...p, [field]: value } : p
    );
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
      parameters: validParams,
      price: parseFloat(newTestPrice) || 0,
      clinicId: writeClinicId,
    };

    setAddStatus("Saving...");
    try {
      await setDoc(doc(db, "testCatalog", newTest.firestoreId), {
        code: newTest.code,
        name: newTest.name,
        category: newTest.category,
        parameters: newTest.parameters,
        price: newTest.price,
        clinicId: writeClinicId,
      });
      setTests((prev) => [...prev, newTest].sort((a, b) => a.name.localeCompare(b.name)));
      setNewTestName("");
      setNewTestCategory("");
      setNewTestPrice("");
      setNewTestParams([{ name: "", unit: "", referenceRange: "" }]);
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

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Clinic Settings</h1>
        <p className="text-gray-600 mb-6">Edit test units, reference ranges, and pricing.</p>
        {isOwner(role) && !writeClinicId && <ActingClinicPrompt />}

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
                <label className="block text-sm font-medium text-gray-700 mb-2">Parameters</label>
                <div className="space-y-2">
                  {newTestParams.map((p, i) => (
                    <div key={i} className="grid grid-cols-4 gap-2 items-center">
                      <input
                        type="text"
                        value={p.name}
                        onChange={(e) => updateNewParam(i, "name", e.target.value)}
                        placeholder="Parameter name"
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                      />
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
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Price (D):</label>
                  <input
                    type="number"
                    defaultValue={test.price || 0}
                    onChange={(e) => updatePrice(test.code, e.target.value)}
                    className="w-24 border border-gray-300 rounded px-2 py-1 text-sm"
                  />
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
                    <div key={i} className="grid grid-cols-3 gap-2 items-center">
                      <span className="text-sm text-gray-700">{p.name}</span>
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