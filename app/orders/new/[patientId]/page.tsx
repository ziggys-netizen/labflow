"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { db } from "../../../lib/firebase";
import { doc, getDoc, collection, where, getDocs } from "firebase/firestore";
import { LabTest, SPECIMEN_TYPE_LABELS, resolveSpecimenType } from "../../../lib/testCatalog";
import { catalogTestMayBeOrdered, orderSopBlockMessage } from "../../../lib/sopReference";
import ProtectedRoute from "../../../lib/ProtectedRoute";
import AppNav from "../../../lib/AppNav";
import { useAuth } from "../../../lib/AuthContext";
import { clinicCollectionQuery, isOwner, ownerActingCreateFields } from "../../../lib/clinicScope";
import ActingClinicPrompt from "../../../lib/ActingClinicPrompt";
import { canOrderTests } from "../../../lib/permissions";
import { isOrderForDeletedPatient, isPatientDeleted } from "../../../lib/patientSoftDelete";
import { isReleasedResultStatus } from "../../../lib/resultAmendment";
import { trackedAddDoc, writeActorFromUser } from "../../../lib/trackedWrites";
import { actorFromAuth, auditTargetLabel, safeLogAudit } from "../../../lib/audit";
import { orderTestsPayload, requiredSpecimenTypes } from "../../../lib/sampleCollection";

interface ExistingOrder {
  id: string;
  tests: { code: string; name: string }[];
  status: string;
  createdAt: string;
}

function NewOrderContent() {
  const params = useParams();
  const router = useRouter();
  const { user, role, clinicId, writeClinicId, username, shift } = useAuth();
  const searchParams = useSearchParams();
  const patientId = params.patientId as string;
  const recollectFrom = searchParams.get("recollectFrom")?.trim() || "";
  const allowed = canOrderTests(role);

  const [patientName, setPatientName] = useState("");
  const [patientLabId, setPatientLabId] = useState("");
  const [loadingPatient, setLoadingPatient] = useState(true);
  const [patientUnavailable, setPatientUnavailable] = useState(false);

  const [pendingOrders, setPendingOrders] = useState<ExistingOrder[]>([]);
  const [loadingPending, setLoadingPending] = useState(true);
  const [showNewOrderForm, setShowNewOrderForm] = useState(false);

  const [catalog, setCatalog] = useState<LabTest[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedTests, setSelectedTests] = useState<LabTest[]>([]);
  const [status, setStatus] = useState("");
  const [episodeAlreadyCharged, setEpisodeAlreadyCharged] = useState(false);

  useEffect(() => {
    async function loadPatient() {
      try {
        const snap = await getDoc(doc(db, "patients", patientId));
        if (snap.exists()) {
          const data = snap.data();
          if (
            isPatientDeleted(data) ||
            (!isOwner(role) && clinicId && data.clinicId && data.clinicId !== clinicId)
          ) {
            setPatientUnavailable(true);
            setPatientName("");
            setPatientLabId("");
          } else {
            setPatientUnavailable(false);
            setPatientName(data.name);
            setPatientLabId(data.labId);
          }
        } else {
          setPatientUnavailable(true);
        }
      } catch (err) {
        console.error(err);
        setPatientUnavailable(true);
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
          snapshot.docs
            .filter((d) => !isOrderForDeletedPatient(d.data()))
            .map((d) => {
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
        const rows = snapshot.docs.map((d) => d.data() as LabTest);
        const scopeId = writeClinicId || clinicId;
        setCatalog(scopeId ? rows.filter((t) => t.clinicId === scopeId) : []);
      } catch (err) {
        console.error(err);
        setCatalog([]);
      } finally {
        setLoadingCatalog(false);
      }
    }
    loadCatalog();
  }, [role, clinicId, writeClinicId]);

  useEffect(() => {
    if (!recollectFrom) {
      setEpisodeAlreadyCharged(false);
      return;
    }
    let cancelled = false;
    getDoc(doc(db, "orders", recollectFrom))
      .then((snap) => {
        if (cancelled || !snap.exists()) return;
        const data = snap.data();
        if (data.patientId && data.patientId !== patientId) return;
        setEpisodeAlreadyCharged(isReleasedResultStatus(data.status));
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [recollectFrom, patientId]);

  const filteredTests = catalog.filter(
    (t) =>
      t.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      t.code.toLowerCase().includes(searchTerm.toLowerCase())
  );

  function addTest(test: LabTest) {
    const check = catalogTestMayBeOrdered(test);
    if (!check.ok) {
      setStatus(check.reason);
      return;
    }
    if (!selectedTests.find((t) => t.code === test.code)) {
      setSelectedTests([...selectedTests, test]);
    }
    setSearchTerm("");
  }

  function removeTest(code: string) {
    setSelectedTests(selectedTests.filter((t) => t.code !== code));
  }

  async function handleCreateOrder() {
    if (!allowed) return;
    if (patientUnavailable || !patientName) {
      setStatus("This patient is not available for new orders.");
      return;
    }
    if (selectedTests.length === 0) {
      setStatus("Select at least one test.");
      return;
    }
    const sopBlock = orderSopBlockMessage(selectedTests);
    if (sopBlock) {
      setStatus(sopBlock);
      return;
    }
    if (!writeClinicId) {
      setStatus(
        isOwner(role)
          ? "Select a clinic from the menu above to create records."
          : "Your account is not linked to a clinic yet."
      );
      return;
    }
    setStatus("Creating order...");
    try {
      const docRef = await trackedAddDoc(
        collection(db, "orders"),
        {
          patientId,
          patientLabId,
          tests: orderTestsPayload(selectedTests),
          status: "pending",
          createdAt: new Date().toISOString(),
          clinicId: writeClinicId,
          ...(recollectFrom
            ? { recollectionOfOrderId: recollectFrom, episodeAlreadyCharged }
            : {}),
          ...ownerActingCreateFields(role),
        },
        {
          ...writeActorFromUser(user, username),
          summary: `Created order for ${patientLabId || "patient"}`,
          clinicId: writeClinicId,
          patientLabId,
          expected: { status: "pending", patientId },
        }
      );
      const actor = actorFromAuth(user, role, shift);
      if (actor) {
        safeLogAudit({
          clinicId: writeClinicId,
          actor,
          action: "order.create",
          targetCollection: "orders",
          targetId: docRef.id,
          targetLabel: auditTargetLabel(patientLabId, "order"),
          detail: { fields: ["tests", "status"], testCount: selectedTests.length },
        });
      }
      setStatus("Order created successfully.");
      router.push(`/orders/${docRef.id}`);
    } catch (err) {
      console.error(err);
      setStatus("Something went wrong. Please try again.");
    }
  }

  if (!allowed) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="px-6 py-16 text-center text-gray-600">Redirecting...</div>
      </main>
    );
  }

  if (loadingPatient) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="px-6 py-16 text-center text-gray-600">Loading patient...</div>
      </main>
    );
  }

  if (patientUnavailable) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="px-6 py-16 text-center">
          <p className="text-gray-600">This patient is not available for new orders.</p>
          <Link href="/patients" className="mt-3 inline-block text-sm text-gray-900 underline">
            Back to patients
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-lg mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">
          {recollectFrom ? "Recollection order" : "Order tests"}
        </h1>
        {isOwner(role) && !writeClinicId && <ActingClinicPrompt />}
        <p className="text-gray-600 mb-6">
          {patientName} — Lab ID: {patientLabId}
        </p>
        {recollectFrom && (
          <p className="text-sm text-amber-900 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mb-6">
            {episodeAlreadyCharged
              ? "This recollection will not be counted again. The original episode already carried a charge."
              : "Rejected samples are not charged. This recollection is the delivered test and will be counted once at release."}
          </p>
        )}

        {loadingPending && <p className="text-sm text-gray-500 mb-4">Checking for existing orders...</p>}

        {!loadingPending && pendingOrders.length > 0 && (
          <div className="mb-8">
            <h2 className="text-sm font-medium text-gray-700 mb-2">
              This patient has {pendingOrders.length} pending order{pendingOrders.length > 1 ? "s" : ""}
            </h2>
            <div className="space-y-2">
              {pendingOrders.map((o) => (
                <Link
                  key={o.id}
                  href={`/orders/${o.id}`}
                  className="block border border-gray-200 rounded-lg px-3 py-2 hover:bg-gray-50"
                >
                  <p className="text-sm text-gray-900">{o.tests.map((t) => t.name).join(", ")}</p>
                  <p className="text-xs text-gray-500">
                    Created {new Date(o.createdAt).toLocaleDateString()} — status: {o.status}
                  </p>
                </Link>
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
            {loadingCatalog && (
              <p className="text-sm text-gray-500 mb-2">Loading catalogue...</p>
            )}
            {!loadingCatalog && catalog.length === 0 && (writeClinicId || clinicId) && (
              <div className="border-2 border-red-300 bg-red-50 rounded-lg p-3 mb-3">
                <p className="font-semibold text-red-950 text-sm">This clinic has no test catalogue.</p>
                <p className="text-sm text-red-900 mt-1">
                  Product default tests are not used. Open Clinic Settings or ask the owner to seed
                  the catalogue before ordering.
                </p>
              </div>
            )}
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              disabled={catalog.length === 0 || loadingCatalog}
              placeholder="Type a test name, e.g. Malaria, FBC, Urinalysis..."
              className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-2 disabled:bg-gray-50"
            />

            {searchTerm && (
              <div className="border border-gray-200 rounded-lg mb-4 max-h-56 overflow-y-auto">
                {filteredTests.length === 0 && (
                  <p className="text-sm text-gray-500 px-3 py-2">No matching tests found.</p>
                )}
                {filteredTests.map((t) => {
                  const sopCheck = catalogTestMayBeOrdered(t);
                  if (!sopCheck.ok) {
                    return (
                      <div
                        key={t.code}
                        className="w-full text-left px-3 py-2 text-sm bg-gray-50 border-b border-gray-100 last:border-b-0"
                      >
                        <span className="font-medium text-gray-500">{t.name}</span>
                        <span className="text-gray-400 ml-2">{t.category}</span>
                        <p className="text-xs text-red-800 mt-0.5">
                          SOP reference required in Clinic Settings before this test can be ordered.
                        </p>
                      </div>
                    );
                  }
                  return (
                    <button
                      key={t.code}
                      onClick={() => addTest(t)}
                      className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
                    >
                      <span className="font-medium text-gray-900">{t.name}</span>
                      <span className="text-gray-400 ml-2">{t.category}</span>
                      <span className="text-gray-400 ml-2">
                        {SPECIMEN_TYPE_LABELS[resolveSpecimenType(t.specimenType, t.code)]}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}

            <h2 className="text-sm font-medium text-gray-700 mb-2">Selected tests</h2>
            {selectedTests.length === 0 && (
              <p className="text-sm text-gray-500 mb-4">No tests selected yet.</p>
            )}
            {selectedTests.length > 0 &&
              requiredSpecimenTypes({ tests: orderTestsPayload(selectedTests) }).length > 1 && (
                <p className="text-sm text-amber-800 mb-3">
                  This order will collect{" "}
                  {requiredSpecimenTypes({ tests: orderTestsPayload(selectedTests) })
                    .map((type) => SPECIMEN_TYPE_LABELS[type].toLowerCase())
                    .join(" and ")}
                  . Record each specimen separately on the order.
                </p>
              )}
            <ul className="space-y-2 mb-6">
              {selectedTests.map((t) => (
                <li key={t.code} className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2">
                  <span className="text-sm text-gray-900">
                    {t.name}
                    <span className="text-gray-500 ml-2">
                      {SPECIMEN_TYPE_LABELS[resolveSpecimenType(t.specimenType, t.code)]}
                    </span>
                  </span>
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
    <ProtectedRoute require={canOrderTests}>
      <Suspense
        fallback={
          <main className="min-h-screen flex items-center justify-center text-gray-600">Loading...</main>
        }
      >
        <NewOrderContent />
      </Suspense>
    </ProtectedRoute>
  );
}
