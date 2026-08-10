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
  const [saving, setSaving] = useState(false);
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

        const existingCodes = snapshot.docs.map((d) => d.id);
        const missingTests = TEST_CATALOG.filter((t) => !existingCodes.includes(t.code));
        for (const test of missingTests) {
          await setDoc(doc(db, "testCatalog", test.code), test);
        }
        const finalSnapshot =
          missingTests.length > 0
            ? await getDocs(query(collection(db, "testCatalog"), orderBy("name")))
            : snapshot;
        setTests(finalSnapshot.docs.map((d) => d.data() as LabTest));
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
      t.code === testCode ? { ...t, price: Number(price) } : t
    );
    setTests(updated);
  }

  async function saveAll() {
    setSaving(true);
    setStatus("");
    try {
      for (const test of tests) {
        await setDoc(doc(db, "testCatalog", test.code), test);
      }
      setStatus("Saved successfully.");
    } catch (err) {
      console.error(err);
      setStatus("Error saving changes.");
    } finally {
      setSaving(false);
    }
  }

  if (loading || loadingTests) {
    return <div className="p-6">Loading...</div>;
  }

  if (!user || role !== "admin") {
    return null;
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-semibold mb-4">Test Catalog Settings</h1>

      {status && (
        <div className="mb-4 text-sm px-3 py-2 rounded bg-gray-100 border">
          {status}
        </div>
      )}

      <div className="space-y-6">
        {tests.map((test) => (
          <div key={test.code} className="border rounded-lg p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-medium">
                {test.name} <span className="text-gray-400 text-sm">({test.code})</span>
              </h2>
              <div className="flex items-center gap-2">
                <label className="text-sm text-gray-500">Price</label>
                <input
                  type="number"
                  className="border rounded px-2 py-1 w-24 text-sm"
                  value={test.price ?? ""}
                  onChange={(e) => updatePrice(test.code, e.target.value)}
                />
              </div>
            </div>

            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-gray-500 border-b">
                  <th className="py-1 pr-4">Parameter</th>
                  <th className="py-1 pr-4">Unit</th>
                  <th className="py-1 pr-4">Reference Range</th>
                </tr>
              </thead>
              <tbody>
                {test.parameters.map((param, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-1 pr-4">{param.name}</td>
                    <td className="py-1 pr-4">
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={param.unit}
                        onChange={(e) =>
                          updateParameter(test.code, i, "unit", e.target.value)
                        }
                      />
                    </td>
                    <td className="py-1 pr-4">
                      <input
                        className="border rounded px-2 py-1 w-full"
                        value={param.referenceRange}
                        onChange={(e) =>
                          updateParameter(test.code, i, "referenceRange", e.target.value)
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ))}
      </div>

      <button
        onClick={saveAll}
        disabled={saving}
        className="mt-6 px-4 py-2 bg-black text-white rounded disabled:opacity-50"
      >
        {saving ? "Saving..." : "Save All Changes"}
      </button>
    </div>
  );
}