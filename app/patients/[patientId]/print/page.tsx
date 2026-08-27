"use client";

import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  doc,
  getDoc,
  getDocFromCache,
  getDocs,
  getDocsFromCache,
  where,
  type DocumentReference,
  type Query,
} from "firebase/firestore";
import { db } from "../../../lib/firebase";
import { useAuth } from "../../../lib/AuthContext";
import ProtectedRoute from "../../../lib/ProtectedRoute";
import PrintIcon from "../../../lib/PrintIcon";
import { clinicCollectionQuery, isOwner } from "../../../lib/clinicScope";
import { isPatientDeleted } from "../../../lib/patientSoftDelete";
import { LabTest, SPECIMEN_TYPE_LABELS } from "../../../lib/testCatalog";
import { isTestReviewed, UNREVIEWED_RANGE_CAVEAT } from "../../../lib/catalogSeed";
import { parameterFlag } from "../../../lib/resultFlag";
import {
  isProvisionalPrint,
  planReportPrint,
  printReadyToIssue,
  PROVISIONAL_HEADING,
  PROVISIONAL_NOTICE,
} from "../../../lib/provisionalReport";
import { canViewOwnRegisteredPatients, canViewPatients } from "../../../lib/permissions";
import ResultFlagMark from "../../../lib/ResultFlagMark";
import { interpretCollection, orderCollectionFromData, type OrderTestRef, type SampleCollections } from "../../../lib/sampleCollection";
import { orderDisplayLabel } from "../../../lib/orderLifecycle";
import { useStaffSession, useWriteIdentity } from "../../../lib/pinSession";
import { trackedSetDoc, writeActorFromUser } from "../../../lib/trackedWrites";
import { actorFromAuth, auditTargetLabel, safeLogAudit } from "../../../lib/audit";
import {
  changedResultValues,
  isReleasedResultStatus,
  latestAmendmentAt,
  originalReleasedAt,
  originalResultVersion,
} from "../../../lib/resultAmendment";

interface PatientRecord {
  clinicId?: string;
  createdByUid?: string;
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
  tests: OrderTestRef[];
  status: string;
  createdAt: string;
  sampleCollectedAt?: string | null;
  sampleCollections?: SampleCollections | null;
  results?: Record<string, Record<string, string>>;
  reviewedBy?: string | null;
  reviewedByUid?: string | null;
  reviewedAt?: string | null;
  resultVersions?: unknown;
  lastAmendedAt?: string | null;
  notYetSynced?: boolean;
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

async function docFromCacheOrServer(ref: DocumentReference) {
  try {
    return await getDocFromCache(ref);
  } catch {
    return getDoc(ref);
  }
}

async function docsFromCacheOrServer(q: Query) {
  try {
    const cached = await getDocsFromCache(q);
    if (!cached.empty) return cached;
  } catch {
    // No matching cache — fall through to the live query.
  }
  return getDocs(q);
}

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
  const { user, role, clinicId } = useAuth();
  const writer = useWriteIdentity();
  const { locked, needsSetup, ready } = useStaffSession();
  const staffGateOpen = !ready || locked || needsSetup;

  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [clinic, setClinic] = useState<ClinicRecord | null>(null);
  const [orders, setOrders] = useState<OrderRecord[]>([]);
  const [catalog, setCatalog] = useState<LabTest[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [printBlocked, setPrintBlocked] = useState("");
  const printed = useRef(false);

  useEffect(() => {
    async function load() {
      try {
        const patientSnap = await docFromCacheOrServer(doc(db, "patients", patientId));
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
        if (
          canViewOwnRegisteredPatients(role) &&
          !canViewPatients(role) &&
          data.createdByUid &&
          data.createdByUid !== writer.uid
        ) {
          setNotFound(true);
          return;
        }
        setPatient(data);

        const [clinicSnap, orderSnap, catalogSnap] = await Promise.all([
          data.clinicId ? docFromCacheOrServer(doc(db, "clinics", data.clinicId)) : Promise.resolve(null),
          docsFromCacheOrServer(
            clinicCollectionQuery("orders", role, clinicId, [where("patientId", "==", patientId)])
          ),
          docsFromCacheOrServer(clinicCollectionQuery("testCatalog", role, clinicId)),
        ]);

        if (clinicSnap?.exists()) setClinic(clinicSnap.data() as ClinicRecord);

        const loadedOrders = orderSnap.docs
          .map((d) => {
            const o = d.data();
            const parsed = orderCollectionFromData(d.id, o);
            return {
              id: parsed.id,
              tests: parsed.tests,
              status: parsed.status,
              createdAt: o.createdAt,
              sampleCollectedAt: parsed.sampleCollectedAt,
              sampleCollections: parsed.sampleCollections,
              results: o.results || {},
              reviewedBy: o.reviewedBy || null,
              reviewedByUid: o.reviewedByUid || null,
              reviewedAt: o.reviewedAt || null,
              resultVersions: o.resultVersions,
              lastAmendedAt: o.lastAmendedAt || null,
              notYetSynced: d.metadata.hasPendingWrites,
            };
          })
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setOrders(loadedOrders);
        setPrintBlocked(planReportPrint(loadedOrders).blockedReason || "");

        const catalogRows = catalogSnap.docs.map((d) => d.data() as LabTest);
        setCatalog(
          data.clinicId
            ? catalogRows.filter((t) => !t.clinicId || t.clinicId === data.clinicId)
            : catalogRows
        );
      } catch (err) {
        console.error(err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [patientId, role, clinicId, writer.uid]);

  useEffect(() => {
    if (
      !printReadyToIssue({
        loading,
        hasPatient: !!patient,
        blockedReason: printBlocked || null,
        staffGateOpen,
      })
    ) {
      return;
    }
    const timer = setTimeout(() => {
      if (printed.current) return;
      printed.current = true;
      const plan = planReportPrint(orders);
      const actor = writeActorFromUser(
        user ? { uid: writer.uid, email: writer.email } : null,
        writer.username
      );
      const auditActor = actorFromAuth(
        user ? { uid: writer.uid, email: writer.email } : null,
        writer.role,
        writer.shift
      );
      const provisional = orders.filter((order) => plan.provisionalOrderIds.includes(order.id));
      for (const order of provisional) {
        void trackedSetDoc(
          doc(db, "orders", order.id),
          {
            needsFinalReprint: true,
            provisionalPrintedAt: new Date().toISOString(),
          },
          { merge: true },
          {
            summary: `Provisional report printed for ${patient?.labId || patientId}`,
            actorUid: actor.actorUid,
            actorLabel: actor.actorLabel,
            clinicId: patient?.clinicId,
            patientLabId: patient?.labId,
            orderId: order.id,
          }
        );
      }
      if (auditActor && patient && plan.allowPrint) {
        safeLogAudit({
          clinicId: patient.clinicId || clinicId,
          actor: auditActor,
          action: plan.disclosureAction,
          targetCollection: "orders",
          targetId: plan.releasedOrderIds[0] || patientId,
          targetLabel: auditTargetLabel(patient.labId, "report"),
          detail: {
            orderIds: plan.releasedOrderIds,
            provisional: plan.provisionalOrderIds.length > 0,
            provisionalOrderIds: plan.provisionalOrderIds,
          },
        });
        if (provisional.length > 0) {
          safeLogAudit({
            clinicId: patient.clinicId || clinicId,
            actor: auditActor,
            action: "order.provisionalPrinted",
            targetCollection: "orders",
            targetId: provisional[0].id,
            targetLabel: auditTargetLabel(patient.labId, "report"),
            detail: { orderIds: provisional.map((order) => order.id) },
          });
        }
      }
      window.print();
    }, 300);
    return () => clearTimeout(timer);
  }, [
    loading,
    patient,
    printBlocked,
    staffGateOpen,
    orders,
    user?.uid,
    writer.uid,
    writer.email,
    writer.username,
    writer.role,
    writer.shift,
    clinicId,
    patientId,
  ]);

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

  if (printBlocked) {
    return (
      <main className="min-h-screen flex flex-col items-center justify-center gap-3 px-6 text-center">
        <p className="text-gray-900 font-medium">This report cannot be printed yet.</p>
        <p className="text-sm text-gray-600 max-w-md">{printBlocked}</p>
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
          {orders.some((order) =>
            isProvisionalPrint({
              released: isReleasedResultStatus(order.status),
              locallyConfirmed: true,
              synced: !order.notYetSynced,
            })
          ) && (
            <div className="mb-3 border-2 border-amber-700 bg-amber-50 px-3 py-2">
              <p className="text-sm font-semibold tracking-wide text-amber-950">{PROVISIONAL_HEADING}</p>
              <p className="text-xs text-amber-900 mt-1">{PROVISIONAL_NOTICE}</p>
            </div>
          )}
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
              const released = isReleasedResultStatus(order.status);
              const amended = order.status === "amended";
              const collection = interpretCollection(order, catalog);
              const original = originalResultVersion(order);
              const changes = amended ? changedResultValues(original?.values, order.results) : [];
              return (
                <div key={order.id} className="avoid-break border border-gray-300 rounded p-3">
                  {amended && (
                    <p className="text-sm font-semibold tracking-wide text-amber-950 mb-2">
                      AMENDED REPORT
                    </p>
                  )}
                  <div className="flex items-baseline justify-between mb-2">
                    <p className="text-sm font-medium text-gray-900">
                      {order.tests.map((t) => t.name).join(", ") || "No tests"}
                    </p>
                    <p className="text-[10px] uppercase tracking-wide text-gray-500">
                      {orderDisplayLabel(order, catalog).label}
                    </p>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">
                    Ordered {formatDateTime(order.createdAt)} ·{" "}
                    {collection.legacySingleCollection
                      ? `Sample ${formatDateTime(collection.latestCollectedAt)} (legacy)`
                      : collection.byType
                          .map(
                            (specimen) =>
                              `${SPECIMEN_TYPE_LABELS[specimen.type]} ${
                                specimen.collectedAt
                                  ? formatDateTime(specimen.collectedAt)
                                  : "not collected"
                              }`
                          )
                          .join(" · ") || `Sample ${formatDateTime(order.sampleCollectedAt)}`}
                    {released && !amended ? ` · Approved ${formatDateTime(order.reviewedAt)}` : ""}
                    {amended
                      ? ` · Original release ${formatDateTime(originalReleasedAt(order))} · Amended ${formatDateTime(latestAmendmentAt(order))}`
                      : ""}
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
                          return rows.map((p, i) => {
                            const value = values[p.name] || "";
                            const flag = parameterFlag(value, p, patient.sex);
                            return (
                            <tr key={`${t.code}-${i}`} className="border-b border-gray-100">
                              <td className="py-1 pr-3 text-gray-900">
                                {i === 0 ? `${t.name} — ` : ""}
                                {p.name}
                              </td>
                              <td className="py-1 pr-3 text-gray-900">
                                {value || "—"}
                                {flag ? (
                                  <span className="ml-1">
                                    <ResultFlagMark flag={flag} />
                                  </span>
                                ) : null}
                              </td>
                              <td className="py-1 pr-3 text-gray-600">{p.unit}</td>
                              <td className="py-1 text-gray-600">
                                {p.referenceRange}
                                {!isTestReviewed(definition) && (
                                  <span className="block text-amber-800">{UNREVIEWED_RANGE_CAVEAT}</span>
                                )}
                              </td>
                            </tr>
                            );
                          });
                        })}
                      </tbody>
                    </table>
                  ) : (
                    <p className="text-xs text-gray-600">
                      Results not released. Only approved or amended results are printed.
                    </p>
                  )}

                  {released && amended && changes.length > 0 && (
                    <div className="mt-3 border-t border-amber-200 pt-2">
                      <p className="text-[10px] uppercase tracking-wide text-amber-900 font-medium mb-1">
                        Values changed
                      </p>
                      <table className="w-full text-left text-xs border-collapse">
                        <thead>
                          <tr className="border-b border-amber-200">
                            <th className="py-1 pr-3 font-medium text-gray-700">Test / parameter</th>
                            <th className="py-1 pr-3 font-medium text-gray-700">Original</th>
                            <th className="py-1 font-medium text-gray-700">Amended</th>
                          </tr>
                        </thead>
                        <tbody>
                          {changes.map((change) => {
                            const test = order.tests.find((t) => t.code === change.testCode);
                            return (
                              <tr key={`${change.testCode}-${change.parameter}`} className="border-b border-gray-100">
                                <td className="py-1 pr-3 text-gray-900">
                                  {test?.name || change.testCode} — {change.parameter}
                                </td>
                                <td className="py-1 pr-3 text-gray-600">{change.previous || "—"}</td>
                                <td className="py-1 text-gray-900">{change.current || "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
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
    <ProtectedRoute require={(role) => canViewPatients(role) || canViewOwnRegisteredPatients(role)}>
      <PatientPrintContent />
    </ProtectedRoute>
  );
}
