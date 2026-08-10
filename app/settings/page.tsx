"use client";

import { useEffect, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { useRouter } from "next/navigation";
import { db } from "../lib/firebase";
import { collection, getDocs, doc, setDoc, query, orderBy } from "firebase/firestore";
import { TEST_CATALOG, LabTest } from "../lib/testCatalog";

export default function Settings() {
  const { user, role, loading } = useAuth();
  const router = useRouter();
  const [tests, setTests] = useState<LabTest[]>([]);
  const [loadingTests, setLoadingTests] = useState(true);
  const [editingCode, setEditingCode] = useState<string | null>(null);
  const [status, setStatus] = useState("");

  useEffect(() => {
    if (!loading && (!user || role !== "admin")) {
      router.push("/patients");
    }
  }, [user, role, loading, router]);

  useEffect(() => {
    async function loadCatalog() {
      try {
        const q = query(collection(db, "testCatalog"), orderBy("name"));
        const snapshot = await getDocs(q);
        if (snapshot.empty) {
          // First time: seed Firestore from the hardcoded catalog
          for (const test of TEST_CATALOG) {
            await setDoc(doc(db, "testCatalog", test.code), test);
          }
          setTests(TEST_CATALOG);
        } else {
          setTests(snapshot.docs.map((d) => d.data() as LabTest));
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingTests(false);
      }
    }
    if (role === "admin") loadCatalog();
  }, [role]);

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
      await setDoc(doc(db, "testCatalog", testCode), test);
      setStatus("Saved.");
      setEditingCode(null);
    } catch (err) {
      console.error(err);
      setStatus("Failed to save.");
    }
  }

  if (loading || loadingTests) {
    return <main className="min-h-screen flex items-center justify-center text-gray-600">Loading...</main>;
  }
  if (!user || role !== "admin") return null;

  return (
    <main className="min-h-screen bg-white px-6 py-16">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Clinic Settings</h1>
        <p className="text-gray-600 mb-6">Edit test units, reference ranges, and pricing.</p>
        {status && <p className="text-sm text-gray-600 mb-4">{status}</p>}

        <div className="space-y-4">
          {tests.map((test) => (
            <div key={test.code} className="border border-gray-200 rounded-lg p-4">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h2 className="font-medium text-gray-900">{test.name}</h2>
                  <p className="text-xs text-gray-500">{test.category}</p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="text-sm text-gray-600">Price (D):</label>
                  <input
                    type="number"
                    defaultValue={(test as any).price || 0}
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
