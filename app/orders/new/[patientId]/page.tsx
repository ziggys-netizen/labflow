"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { db } from "../../../lib/firebase";
import { doc, getDoc, collection, addDoc, where, getDocs } from "firebase/firestore";
import { TEST_CATALOG, LabTest } from "../../../lib/testCatalog";
import ProtectedRoute from "../../../lib/ProtectedRoute";
import AppNav from "../../../lib/AppNav";
import { useAuth } from "../../../lib/AuthContext";
import { clinicCollectionQuery, isOwner } from "../../../lib/clinicScope";
import ActingClinicPrompt from "../../../lib/ActingClinicPrompt";

interface ExistingOrder {
  id: string;
  tests: { code: string; name: string }[];
  status: string;
  createdAt: string;
}

function NewOrderContent() {
  const params = useParams();
  const router = useRouter();
  const { role, clinicId } = useAuth();
  const patientId = params.patientId as string;

  const [patientName, setPatientName] = useState("");
  const [patientLabId, setPatientLabId] = useState("");
  const [loadingPatient, setLoadingPatient] = useState(true);

  const [pendingOrders, setPendingOrders] = useState<ExistingOrder[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [showNewOrderForm, setShowNewOrderForm] = useState(false);

  const [catalog, setCatalog] = useState<LabTest[]>(TEST_CATALOG);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTests, setSelectedTests] = useState<LabTest[]>([]);
  const [status, setStatus] = useState("");

  useEffect(() => {
    async function loadPatient() {
      try {
        const snap = await getDoc(doc(db, "patients", patientId));
        if (snap.exists()) {
          const data = snap.data();
          if (!isOwner(role) && clinicId && data.clinicId && data.clinicId !== clinicId) {
            setPatientName("");
            setPatientLabId("");
          } else {
            setPatientName(data.name);
            setPatientLabId(data.labId);
          }
        }
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingPatient(false);
      }
    }
    loadPatient();
  }, [patientId, role, clinicId]);

  useEffect(() => {
    async function loadPendingOrders() {
      try {
        const constraints = [where("patientId", "==", patientId), where("status", "==", "pending")];
        const snapshot = await getDocs(clinicCollectionQuery("orders", role, clinicId, constraints));
        setPendingOrders(
          snapshot.docs.map((d) => {
            const data = d.data();
            return {
              id: d.id,
              tests: data.tests || [],
              status: data.status,
              createdAt: data.createdAt,
            };
          })
        );
      } catch (err) {
        console.error(err);
      } finally {
        setLoadingPending(false);
      }
    }
    loadPendingOrders();
  }, [patientId, role, clinicId]);

  useEffect(() => {
    async function loadCatalog() {
      try {
        const snapshot = await getDocs(clinicCollectionQuery("testCatalog", role, clinicId));
        if (!snapshot.empty) {
          setCatalog(snapshot.docs.map((d) => d.data() as LabTest));
        }
      } catch (err) {
        console.error(err);
      }
    }
    loadCatalog();
  }, [role, clinicId]);

  const filteredTests = catalog.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  function addTest(test: LabTest) {
    if (!selectedTests.find((t) => t.code === test.code)) {
      setSelectedTests([...selectedTests, test]);
    }
    setSearchTerm("");
  }

  function removeTest(code: string) {
    setSelectedTests(selectedTests.filter((t) => t.code !== code));
  }

  async function handleCreateOrder() {
    if (selectedTests.length === 0) {
      setStatus("Select at least one test.");
      return;
    }
    if (!clinicId) {
      setStatus(
        isOwner(role)
          ? "Select a clinic in the header to create orders."
          : "Your account is not linked to a clinic yet."
      );
      return;
    }
    setStatus("Creating order...");
    try {
      const docRef = await addDoc(collection(db, "orders"), {
        patientId,
        patientName,
        patientLabId,
        tests: selectedTests.map((t) => ({ code: t.code, name: t.name })),
        status: "pending",
        createdAt: new Date().toISOString(),
        clinicId,
      });
      setStatus("Order created successfully.");
      router.push(`/orders/${docRef.id}`);
    } catch (err) {
      console.error(err);
      setStatus("Something went wrong. Please try again.");
    }
  }

  if (loadingPatient) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="px-6 py-16 text-center text-gray-600">Loading patient...</div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-lg mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Order tests</h1>
        {isOwner(role) && !clinicId && <ActingClinicPrompt action="create orders" />}
        <p className="text-gray-600 mb-6">
          {patientName} — Lab ID: {patientLabId}
        </p>

        {loadingPending && <p className="text-sm text-gray-500 mb-4">Checking for existing orders...</p>}

        {!loadingPending && pendingOrders.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-medium text-gray-700 mb-2">
              This patient has {pendingOrders.length} pending order{pendingOrders.length > 1 ? "s" : ""}
            </h2>
            <div className="space-y-2">
              {pendingOrders.map((o) => (
                <a
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className="block border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50"
                >
                  <p className="text-sm text-gray-900">{o.tests.map((t) => t.name).join(", ")}</p>
                  <p className="text-xs text-gray-500">
                    Created {new Date(o.createdAt).toLocaleDateString()} — status: {o.status}
                  </p>
                </a>
              ))}
            </div>
          </div>
        )}

        {!loadingPending && pendingOrders.length > 0 && !showNewOrderForm && (
          <button
            onClick={() => setShowNewOrderForm(true)}
            className="text-sm text-gray-900 underline mb-8"
          >
            + Create another new order for this patient
          </button>
        )}

        {(pendingOrders.length === 0 || showNewOrderForm) && (
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Search for a test</label>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Type a test name, e.g. Malaria, FBC, Urinalysis..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-2"
            />

            {searchTerm && (
              <div className="border border-gray-200 rounded-lg mb-4 max-h-56 overflow-y-auto">
                {filteredTests.length === 0 && (
                  <p className="text-sm text-gray-500 px-3 py-2">No matching tests found.</p>
                )}
                {filteredTests.map((t) => (
                  <button
                    key={t.code}
                    onClick={() => addTest(t)}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                  >
                    <span className="font-medium text-gray-900">{t.name}</span>
                    <span className="text-gray-400 ml-2">{t.category}</span>
                  </button>
                ))}
              </div>
            )}

            <h2 className="text-sm font-medium text-gray-700 mb-2">Selected tests</h2>
            {selectedTests.length === 0 && (
              <p className="text-sm text-gray-500 mb-4">No tests selected yet.</p>
            )}
            <ul className="space-y-2 mb-6">
              {selectedTests.map((t) => (
                <li key={t.code} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-900">{t.name}</span>
                  <button onClick={() => removeTest(t.code)} className="text-sm text-red-600 hover:text-red-800">
                    Remove
                  </button>
                </li>
              ))}
            </ul>

            <button
              onClick={handleCreateOrder}
              className="w-full bg-gray-900 text-white rounded-lg py-2 font-medium hover:bg-gray-800 transition"
            >
              Create order
            </button>

            {status && <p className="text-sm text-gray-600 mt-3">{status}</p>}
          </div>
        )}
      </div>
    </main>
  );
}

export default function NewOrder() {
  return (
    <ProtectedRoute>
      <NewOrderContent />
    </ProtectedRoute>
  );
}
