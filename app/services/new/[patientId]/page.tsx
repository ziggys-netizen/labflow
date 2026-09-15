"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { db } from "../../../lib/firebase";
import { doc, getDoc, collection, getDocs } from "firebase/firestore";
import ProtectedRoute from "../../../lib/ProtectedRoute";
import AppNav from "../../../lib/AppNav";
import { useAuth } from "../../../lib/AuthContext";
import { clinicCollectionQuery, isOwner, ownerActingCreateFields } from "../../../lib/clinicScope";
import ActingClinicPrompt from "../../../lib/ActingClinicPrompt";
import { canRecordPayment, paymentRequiredOnOrder } from "../../../lib/permissions";
import { useWriteIdentity } from "../../../lib/pinSession";
import { buildOrderPayment, orderChargeTotal, paymentInputError } from "../../../lib/orderPayment";
import PaymentFieldset from "../../../lib/PaymentFieldset";
import { matchesServiceSearch, serviceIsActive, type ClinicService } from "../../../lib/serviceCatalog";
import { isPatientDeleted } from "../../../lib/patientSoftDelete";
import { trackedAddDoc, writeActorFromUser } from "../../../lib/trackedWrites";
import { actorFromAuth, auditTargetLabel, safeLogAudit } from "../../../lib/audit";

function BillServiceContent() {
  const params = useParams();
  const router = useRouter();
  const { user, role, clinicId, writeClinicId, username, shift } = useAuth();
  const writer = useWriteIdentity();
  const patientId = params.patientId as string;
  const allowed = canRecordPayment(role);
  const paymentRequired = paymentRequiredOnOrder(role);

  const [patientName, setPatientName] = useState("");
  const [patientLabId, setPatientLabId] = useState("");
  const [loadingPatient, setLoadingPatient] = useState(true);
  const [patientUnavailable, setPatientUnavailable] = useState(false);

  const [catalog, setCatalog] = useState<ClinicService[]>([]);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [searchTerm, setSearchTerm] = useState("");
  const [selected, setSelected] = useState<ClinicService | null>(null);
  const [status, setStatus] = useState("");

  const [paymentMethod, setPaymentMethod] = useState("");
  const [paymentReference, setPaymentReference] = useState("");

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
    async function loadCatalog() {
      try {
        const snapshot = await getDocs(clinicCollectionQuery("serviceCatalog", role, clinicId));
        const rows = snapshot.docs.map((d) => d.data() as ClinicService);
        const scopeId = writeClinicId || clinicId;
        setCatalog(scopeId ? rows.filter((s) => s.clinicId === scopeId && serviceIsActive(s)) : []);
      } catch (err) {
        console.error(err);
        setCatalog([]);
      } finally {
        setLoadingCatalog(false);
      }
    }
    loadCatalog();
  }, [role, clinicId, writeClinicId]);

  const filtered = catalog.filter((s) => matchesServiceSearch(s, searchTerm));

  async function handleCharge() {
    if (!allowed) return;
    if (patientUnavailable || !patientName) {
      setStatus("This patient is not available.");
      return;
    }
    if (!selected) {
      setStatus("Select a service.");
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
    const charge = orderChargeTotal([selected]);
    if (!charge.ok) {
      setStatus(`No price is set for ${selected.name}. Ask the lab manager to add it in Services.`);
      return;
    }
    const inputError = paymentInputError({ method: paymentMethod, reference: paymentReference });
    if (inputError) {
      setStatus(inputError);
      return;
    }
    const createdAt = new Date().toISOString();
    const payment = buildOrderPayment({
      input: { method: paymentMethod, reference: paymentReference },
      amount: charge.amount,
      recordedAt: createdAt,
      recordedByUid: writer.uid || user?.uid || "",
      recordedByRole: isOwner(role) ? "owner" : writer.role || role || "",
    });

    setStatus("Recording payment...");
    try {
      const docRef = await trackedAddDoc(
        collection(db, "serviceCharges"),
        {
          patientId,
          patientLabId,
          serviceCode: selected.code,
          serviceName: selected.name,
          payment,
          createdAt,
          clinicId: writeClinicId,
          ...ownerActingCreateFields(role),
        },
        {
          ...writeActorFromUser(user, username),
          summary: `Billed ${selected.name} for ${patientLabId || "patient"}`,
          clinicId: writeClinicId,
          patientLabId,
          expected: { serviceCode: selected.code, patientId },
        }
      );
      const actor = actorFromAuth(user, role, shift);
      if (actor) {
        safeLogAudit({
          clinicId: writeClinicId,
          actor,
          action: "service.charged",
          targetCollection: "serviceCharges",
          targetId: docRef.id,
          targetLabel: auditTargetLabel(patientLabId, "serviceCharge"),
          detail: {
            serviceCode: selected.code,
            method: payment.method,
            amount: payment.amount,
            currency: payment.currency,
            hasReference: payment.reference !== null,
          },
        });
      }
      router.push(`/services/${docRef.id}/receipt`);
    } catch (err) {
      console.error(err);
      setStatus("Something went wrong. Please try again.");
    }
  }

  if (!allowed) {
    return (
      <main className="min-h-screen">
        <AppNav />
        <div className="px-6 py-16 text-center text-gray-600">Redirecting...</div>
      </main>
    );
  }

  if (loadingPatient) {
    return (
      <main className="min-h-screen">
        <AppNav />
        <div className="px-6 py-16 text-center text-gray-600">Loading patient...</div>
      </main>
    );
  }

  if (patientUnavailable) {
    return (
      <main className="min-h-screen">
        <AppNav />
        <div className="px-6 py-16 text-center">
          <p className="text-gray-600">This patient is not available.</p>
          <Link href="/register" className="mt-3 inline-block text-sm text-gray-900 underline">
            Back
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen">
      <AppNav />
      <div className="max-w-lg mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Bill a service</h1>
        {isOwner(role) && !writeClinicId && <ActingClinicPrompt />}
        <p className="text-gray-600 mb-6">
          {patientName} — Lab ID: {patientLabId}
        </p>

        <label className="block text-sm font-medium text-gray-700 mb-1">Search for a service</label>
        {loadingCatalog && <p className="text-sm text-gray-500 mb-2">Loading services...</p>}
        {!loadingCatalog && catalog.length === 0 && (writeClinicId || clinicId) && (
          <div className="border-2 border-amber-300 bg-amber-50 rounded-lg p-3 mb-3">
            <p className="font-semibold text-amber-950 text-sm">No services set up yet.</p>
            <p className="text-sm text-amber-900 mt-1">
              Ask the lab manager to add services (consultation, dressing, etc.) in Settings.
            </p>
          </div>
        )}
        <input
          type="text"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          disabled={catalog.length === 0 || loadingCatalog}
          placeholder="Type a service name, e.g. Consultation..."
          className="w-full border border-gray-300 rounded-lg px-3 py-2 mb-2 disabled:bg-gray-50"
        />
        {searchTerm && (
          <div className="border border-gray-200 rounded-lg mb-4 max-h-56 overflow-y-auto">
            {filtered.length === 0 && (
              <p className="text-sm text-gray-500 px-3 py-2">No matching services found.</p>
            )}
            {filtered.map((s) => (
              <button
                key={s.code}
                onClick={() => {
                  setSelected(s);
                  setSearchTerm("");
                }}
                className="w-full text-left px-3 py-2 text-sm hover:bg-gray-50 border-b border-gray-100 last:border-b-0"
              >
                <span className="font-medium text-gray-900">{s.name}</span>
              </button>
            ))}
          </div>
        )}

        <h2 className="text-sm font-medium text-gray-700 mb-2">Selected service</h2>
        {!selected && <p className="text-sm text-gray-500 mb-4">No service selected yet.</p>}
        {selected && (
          <div className="flex items-center justify-between bg-gray-50 rounded-lg px-3 py-2 mb-6">
            <span className="text-sm text-gray-900">{selected.name}</span>
            <button onClick={() => setSelected(null)} className="text-sm text-red-600 hover:text-red-800">
              Remove
            </button>
          </div>
        )}

        <PaymentFieldset
          required={paymentRequired}
          charge={selected ? orderChargeTotal([selected]) : null}
          emptyMessage="Select a service to see the amount due."
          method={paymentMethod}
          onMethodChange={setPaymentMethod}
          reference={paymentReference}
          onReferenceChange={setPaymentReference}
        />

        <button
          onClick={handleCharge}
          className="w-full bg-gray-900 text-white rounded-lg py-2 font-medium hover:bg-gray-800 transition"
        >
          Record payment
        </button>

        {status && <p className="text-sm text-gray-600 mt-3">{status}</p>}
      </div>
    </main>
  );
}

export default function BillService() {
  return (
    <ProtectedRoute require={canRecordPayment}>
      <BillServiceContent />
    </ProtectedRoute>
  );
}
