"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc, getDocs, where } from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuth } from "../../../lib/AuthContext";
import ProtectedRoute from "../../../lib/ProtectedRoute";
import PrintIcon from "../../../lib/PrintIcon";
import { clinicCollectionQuery, isOwner } from "../../../lib/clinicScope";
import { canViewPatients } from "../../../lib/permissions";
import { isPatientDeleted } from "../../../lib/patientSoftDelete";
import { TEST_CATALOG, LabTest } from "../../../lib/testCatalog";

interface PatientRecord {
  clinicId?: string;
  labId?: string;
  name?: string;
  preferredName?: string | null;
  sex?: string;
  dob?: string;
  phone?: string;
  address?: string;
  nationalId?: string | null;
  nextOfKin?: string | null;
  referringClinician?: string;
  reasonForVisit?: string | null;
  createdAt?: string;
}

interface ClinicRecord {
  name?: string;
  address?: string;
  tin?: string;
  businessRegNumber?: string;
  responsiblePerson?: string;
}

interface OrderRecord {
  id: string;
  tests: { code: string; name: string }[];
  status: string;
  createdAt: string;
  sampleCollectedAt?: string | null;
  results?: Record<string, Record<string, string>>;
  reviewedBy?: string | null;
  reviewedAt?: string | null;
}

const PRINT_CSS = `
  @page { size: A4; margin: 15mm; }
  @media print {
    .no-print { display: none !important; }
    body { background: #fff; }
    .print-sheet { box-shadow: none !important; border: 0 !important; margin: 0 !important; padding: 0 !important; width: auto !important; }
    .avoid-break { break-inside: avoid; }
  }
`;

function formatDateTime(iso?: string | null) {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function Field({
  label,
  value,
  valueClassName,
}: {
  label: string;
  value?: string | null;
  valueClassName?: string;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-gray-500">{label}</p>
      <p className={`text-sm text-gray-900${valueClassName ? ` ${valueClassName}` : ""}`}>
        {value || "—"}
      </p>
    </div>
  );
}

function PatientPrintContent() {
  const params = useParams();
  const patientId = params.patientId as string;
  const { role, clinicId } = useAuth();

  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [clinic, setClinic] = useState<ClinicRecord | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [catalog, setCatalog] = useState<LabTest[]>(TEST_CATALOG);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const printed = useRef(false);

  useEffect(() => {
    async function load() {
      try {
        const patientSnap = await getDoc(doc(db, "patients", patientId));
        if (!patientSnap.exists()) {
          setNotFound(true);
          return;
        }
        const data = patientSnap.data() as PatientRecord & { deleted?: boolean };
        if (isPatientDeleted(data)) {
          setNotFound(true);
          return;
        }
        if (!isOwner(role) && clinicId && data.clinicId && data.clinicId !== clinicId) {
          setNotFound(true);
          return;
        }
        setPatient(data);

        const [clinicSnap, orderSnap, catalogSnap] = await Promise.all([
          data.clinicId ? getDoc(doc(db, "clinics", data.clinicId)) : Promise.resolve(null),
          getDocs(
            clinicCollectionQuery("orders", role, clinicId, [where("patientId", "==", patientId)])
          ),
          getDocs(clinicCollectionQuery("testCatalog", role, clinicId)),
        ]);

        if (clinicSnap?.exists()) setClinic(clinicSnap.data() as ClinicRecord);

        setOrders(
          orderSnap.docs
            .map((d) => {
              const o = d.data();
              return {
                id: d.id,
                tests: o.tests || [],
                status: o.status || "pending",
                createdAt: o.createdAt,
                sampleCollectedAt: o.sampleCollectedAt || null,
                results: o.results || {},
                reviewedBy: o.reviewedBy || null,
                reviewedAt: o.reviewedAt || null,
              };
            })
            .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1))
        );

        if (!catalogSnap.empty) {
          setCatalog(catalogSnap.docs.map((d) => d.data() as LabTest));
        }
      } catch (err) {
        console.error(err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [patientId, role, clinicId]);

  useEffect(() => {
    if (loading || !patient || printed.current) return;
    printed.current = true;
    // Wait for layout so the dialog previews the finished sheet.
    const timer = setTimeout(() => window.print(), 300);
    return () => clearTimeout(timer);
  }, [loading, patient]);

  if (loading) {
    return <main className="min-h-screen flex items-center justify-center text-gray-600">Loading record...</main>;
  }

  if (notFound || !patient) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 text-gray-600">
        <p>Patient record not found.</p>
        <a href="/patients" className="text-gray-900 underline">
          Back to patients
        </a>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-100 py-8 print:bg-white print:py-0">
      <style>{PRINT_CSS}</style>

      <div className="no-print max-w-[210mm] mx-auto mb-4 flex items-center justify-between px-4">
        <a href="/patients" className="text-sm text-gray-700 underline">
          Back to patients
        </a>
        <button
          onClick={() => window.print()}
          className="inline-flex items-center gap-2 bg-gray-900 text-white rounded-lg px-4 py-2 text-sm font-medium hover:bg-gray-800 transition"
        >
          <PrintIcon />
          Print
        </button>
      </div>

      <div className="print-sheet bg-white mx-auto w-[210mm] min-h-[297mm] p-[15mm] shadow-sm">
        <header className="border-b border-gray-300 pb-4 mb-6">
          <h1 className="text-xl font-semibold text-gray-900">{clinic?.name || "Clinic"}</h1>
          {clinic?.address && <p className="text-sm text-gray-600">{clinic.address}</p>}
          <p className="text-xs text-gray-500 mt-1">
            {clinic?.tin ? `TIN ${clinic.tin}` : ""}
            {clinic?.tin && clinic?.businessRegNumber ? " · " : ""}
            {clinic?.businessRegNumber ? `Reg. ${clinic.businessRegNumber}` : ""}
            {clinic?.responsiblePerson ? ` · Responsible person: ${clinic.responsiblePerson}` : ""}
          </p>
        </header>

        <section className="avoid-break mb-6">
          <div className="flex items-baseline justify-between mb-3">
            <h2 className="text-base font-semibold text-gray-900">Patient record</h2>
          </div>
          <div className="grid grid-cols-3 gap-x-6 gap-y-3">
            <Field label="Clinic ID" value={patient.clinicId} />
            <Field label="Lab ID" value={patient.labId} valueClassName="font-semibold font-mono" />
            <Field label="Name" value={patient.name} />
            <Field label="Preferred name" value={patient.preferredName} />
            <Field label="Sex" value={patient.sex} />
            <Field label="Date of birth" value={patient.dob} />
            <Field label="Phone" value={patient.phone} />
            <Field label="Address" value={patient.address} />
            <Field label="National ID" value={patient.nationalId} />
            <Field label="Next of kin" value={patient.nextOfKin} />
            <Field label="Referring clinician" value={patient.referringClinician} />
            <Field label="Reason for visit" value={patient.reasonForVisit} />
            <Field label="Registered" value={formatDateTime(patient.createdAt)} />
          </div>
        </section>

        <section>
          <h2 className="text-base font-semibold text-gray-900 mb-3">Laboratory record</h2>
          {orders.length === 0 && <p className="text-sm text-gray-600">No tests ordered.</p>}

          <div className="space-y-4">
            {orders.map((order) => {
              const released = order.status === "approved";
              return (
                <div key={order.id} className="avoid-break border border-gray-300 rounded p-3">
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="text-sm font-medium text-gray-900">
                      {order.tests.map((t) => t.name).join(", ") || "No tests"}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-gray-500">
                      {order.sampleCollectedAt ? order.status.replace("_", " ") : "Awaiting sample"}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    Ordered {formatDateTime(order.createdAt)} · Sample{" "}
                    {formatDateTime(order.sampleCollectedAt)}
                    {released ? ` · Approved ${formatDateTime(order.reviewedAt)}` : ""}
                  </p>

                  {released ? (
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="border-b border-gray-300">
                          <th className="py-1 pr-3 font-medium text-gray-700">Test / parameter</th>
                          <th className="py-1 pr-3 font-medium text-gray-700">Result</th>
                          <th className="py-1 pr-3 font-medium text-gray-700">Unit</th>
                          <th className="py-1 font-medium text-gray-700">Reference range</th>
                        </tr>
                      </thead>
                      <tbody>
                        {order.tests.flatMap((t) => {
                          const definition = catalog.find((c) => c.code === t.code);
                          const values = order.results?.[t.code] || {};
                          const rows = definition?.parameters || [];
                          if (rows.length === 0) {
                            return [
                              <tr key={t.code} className="border-b border-gray-100">
                                <td className="py-1 pr-3 text-gray-900">{t.name}</td>
                                <td className="py-1 pr-3 text-gray-900" colSpan={3}>
                                  Definition unavailable
                                </td>
                              </tr>,
                            ];
                          }
                          return rows.map((p, i) => (
                            <tr key={`${t.code}-${i}`} className="border-b border-gray-100">
                              <td className="py-1 pr-3 text-gray-900">
                                {i === 0 ? `${t.name} — ` : ""}
                                {p.name}
                              </td>
                              <td className="py-1 pr-3 text-gray-900">{values[p.name] || "—"}</td>
                              <td className="py-1 pr-3 text-gray-600">{p.unit}</td>
                              <td className="py-1 text-gray-600">{p.referenceRange}</td>
                            </tr>
                          ));
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-xs text-gray-600">
                      Results not released. Only approved results are printed.
                    </p>
                  )}

                  {released && order.reviewedBy && (
                    <p className="text-[10px] text-gray-500 mt-2">
                      Approved by {order.reviewedBy} on {formatDateTime(order.reviewedAt)}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        </section>

        <footer className="mt-8 pt-3 border-t border-gray-300 text-[10px] text-gray-500">
          Printed {new Date().toLocaleString()} · LabFlow
        </footer>
      </div>
    </main>
  );
}

export default function PatientPrint() {
  return (
    <ProtectedRoute require={canViewPatients}>
      <PatientPrintContent />
    </ProtectedRoute>
  );
}
