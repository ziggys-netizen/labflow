/**
 * Medical report — structured clinical document (SOAP-style) for a patient,
 * separate from lab results. Owner / clinic_admin / lab_manager only.
 * Draft is freely editable; finalize locks it (v1) and further edits
 * require a reason code and append a version (see app/lib/medicalReport.ts).
 */
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import {
  collection,
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
import AppNav from "../../../lib/AppNav";
import { clinicCollectionQuery, isOwner } from "../../../lib/clinicScope";
import { isPatientDeleted } from "../../../lib/patientSoftDelete";
import { requireSurface } from "../../../lib/surfaces";
import { useStaffSession, useWriteIdentity } from "../../../lib/pinSession";
import { SensitivePinPrompt } from "../../../lib/PinGate";
import { trackedSetDoc, writeActorFromUser } from "../../../lib/trackedWrites";
import { actorFromAuth, auditTargetLabel, safeLogAudit } from "../../../lib/audit";
import { formatHistoryReleaser } from "../../../lib/patientHistory";
import { patientDisplayName } from "../../../lib/patientDisplay";
import { formatSexAge } from "../../../lib/patientList";
import ReasonCodeField from "../../../lib/ReasonCodeField";
import { REPORT_AMENDMENT_CODES } from "../../../lib/reasonCodes";
import {
  amendReport,
  cloneReportContent,
  emptyReportContent,
  finalizeReport,
  MEDICAL_REPORT_FIELDS,
  MEDICAL_REPORT_FIELD_LABELS,
  parseMedicalReportVersions,
  reportContentChanged,
  reportContentComplete,
  type MedicalReportContent,
} from "../../../lib/medicalReport";

interface PatientRecord {
  clinicId?: string;
  labId?: string;
  name?: string;
  preferredName?: string | null;
  sex?: string;
  dob?: string | null;
  ageYears?: number | null;
}

interface ClinicRecord {
  name?: string;
  address?: string;
}

interface MedicalReportRecord {
  id: string;
  status: string;
  content: MedicalReportContent;
  createdBy: string | null;
  createdByUid: string | null;
  createdByRole: string | null;
  createdAt: string;
  finalizedBy: string | null;
  finalizedAt: string | null;
  currentVersion: number;
  versions: unknown;
  notYetSynced: boolean;
}

const PRINT_CSS = `
  @page { size: A4; margin: 15mm; }
  @media screen { .print-sheet { display: none !important; } }
  @media print {
    .no-print { display: none !important; }
    body { background: #fff; }
    .print-sheet { display: block !important; box-shadow: none !important; border: 0 !important; margin: 0 !important; padding: 0 !important; width: auto !important; }
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

function parseReport(id: string, data: Record<string, unknown>, notYetSynced: boolean): MedicalReportRecord {
  return {
    id,
    status: typeof data.status === "string" ? data.status : "draft",
    content: cloneReportContent(data as Partial<MedicalReportContent>),
    createdBy: typeof data.createdBy === "string" ? data.createdBy : null,
    createdByUid: typeof data.createdByUid === "string" ? data.createdByUid : null,
    createdByRole: typeof data.createdByRole === "string" ? data.createdByRole : null,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    finalizedBy: typeof data.finalizedBy === "string" ? data.finalizedBy : null,
    finalizedAt: typeof data.finalizedAt === "string" ? data.finalizedAt : null,
    currentVersion: typeof data.currentVersion === "number" ? data.currentVersion : 0,
    versions: data.versions,
    notYetSynced,
  };
}

function formatDateTime(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleString();
}

function Textarea({
  field,
  value,
  disabled,
  onChange,
}: {
  field: (typeof MEDICAL_REPORT_FIELDS)[number];
  value: string;
  disabled: boolean;
  onChange: (field: (typeof MEDICAL_REPORT_FIELDS)[number], value: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-sm text-lf-ink">
      {MEDICAL_REPORT_FIELD_LABELS[field]}
      <textarea
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(field, e.target.value)}
        rows={3}
        className="rounded-lf-md border border-lf-line bg-lf-surface px-3 py-2 text-sm text-lf-ink disabled:bg-lf-ground disabled:text-lf-ink-2"
      />
    </label>
  );
}

function ReportContentContent() {
  const params = useParams<{ patientId: string }>();
  const patientId = params.patientId;
  const { user, role, clinicId } = useAuth();
  const writer = useWriteIdentity();
  const { locked, needsSetup, ready } = useStaffSession();
  const staffGateOpen = !ready || locked || needsSetup;

  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [clinic, setClinic] = useState<ClinicRecord | null>(null);
  const [reports, setReports] = useState<MedicalReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [content, setContent] = useState<MedicalReportContent>(emptyReportContent());
  const [amending, setAmending] = useState(false);
  const [amendCode, setAmendCode] = useState("");
  const [amendNote, setAmendNote] = useState("");
  const [status, setStatus] = useState("");
  const [pinAction, setPinAction] = useState<null | (() => void)>(null);
  const [printingId, setPrintingId] = useState<string | null>(null);
  const printed = useRef(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setNotFound(false);
      setLoadError(null);
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
        setPatient(data);

        const [clinicSnap, reportsSnap] = await Promise.all([
          data.clinicId ? docFromCacheOrServer(doc(db, "clinics", data.clinicId)) : Promise.resolve(null),
          docsFromCacheOrServer(
            clinicCollectionQuery("medicalReports", role, clinicId, [where("patientId", "==", patientId)])
          ),
        ]);

        if (clinicSnap?.exists()) setClinic(clinicSnap.data() as ClinicRecord);

        const loaded = reportsSnap.docs
          .map((d) => parseReport(d.id, d.data(), d.metadata.hasPendingWrites))
          .sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
        setReports(loaded);
      } catch (err) {
        console.error(err);
        setLoadError(err instanceof Error ? err.message : "Unknown error.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [patientId, role, clinicId, reloadToken]);

  const selected = reports.find((r) => r.id === selectedId) || null;

  function writeMeta(summary: string, expected: Record<string, unknown>) {
    return {
      ...writeActorFromUser({ uid: writer.uid || user?.uid || "", email: writer.email }, writer.username),
      operation: "update" as const,
      summary,
      clinicId: patient?.clinicId || clinicId || undefined,
      patientLabId: patient?.labId,
      expected,
    };
  }

  function audit(
    action: "medicalReport.finalized" | "medicalReport.amended" | "medicalReport.printed",
    reportId: string,
    detail?: Record<string, unknown>
  ) {
    const actor = actorFromAuth({ uid: writer.uid || user?.uid || "", email: writer.email }, writer.role, writer.shift);
    if (!actor) return;
    safeLogAudit({
      clinicId: patient?.clinicId || clinicId || null,
      actor,
      action,
      targetCollection: "medicalReports",
      targetId: reportId,
      targetLabel: auditTargetLabel(patient?.labId, "medicalReport"),
      detail,
    });
  }

  function selectReport(report: MedicalReportRecord) {
    setSelectedId(report.id);
    setContent(report.content);
    setAmending(false);
    setAmendCode("");
    setAmendNote("");
    setStatus("");
  }

  async function startNewReport() {
    if (!user) return;
    const ref = doc(collection(db, "medicalReports"));
    const now = new Date().toISOString();
    const empty = emptyReportContent();
    await trackedSetDoc(
      ref,
      {
        clinicId: patient?.clinicId || clinicId || undefined,
        patientId,
        patientLabId: patient?.labId || null,
        status: "draft",
        ...empty,
        createdBy: writer.email,
        createdByUid: writer.uid,
        createdByRole: writer.role,
        createdAt: now,
      },
      { merge: true },
      writeMeta(`Started medical report for ${patient?.labId ?? "patient"}`, { status: "draft" })
    );
    const record = parseReport(ref.id, { patientId, status: "draft", ...empty, createdAt: now }, true);
    setReports((prev) => [record, ...prev]);
    selectReport(record);
    setStatus("Draft started.");
    setTimeout(() => setStatus(""), 2000);
  }

  async function saveDraft() {
    if (!selected || selected.status !== "draft") return;
    await trackedSetDoc(
      doc(db, "medicalReports", selected.id),
      { ...content },
      { merge: true },
      writeMeta(`Saved medical report draft for ${patient?.labId ?? "patient"}`, { status: "draft" })
    );
    setReports((prev) => prev.map((r) => (r.id === selected.id ? { ...r, content } : r)));
    setStatus("Draft saved.");
    setTimeout(() => setStatus(""), 2000);
  }

  function requestFinalize() {
    if (!selected || !user) return;
    if (!reportContentComplete(content)) {
      setStatus("Fill in chief complaint, findings, assessment, and plan before finalizing.");
      return;
    }
    setPinAction(() => () => void commitFinalize());
  }

  async function commitFinalize() {
    if (!selected) return;
    const actor = { uid: writer.uid, email: writer.email, role: writer.role, shift: writer.shift };
    const result = finalizeReport({ content, actor });
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    await trackedSetDoc(
      doc(db, "medicalReports", selected.id),
      result.updates,
      { merge: true },
      writeMeta(`Finalized medical report for ${patient?.labId ?? "patient"}`, { status: "final" })
    );
    const updated: MedicalReportRecord = {
      ...selected,
      ...(result.updates as Partial<MedicalReportRecord>),
      content,
      status: "final",
    };
    setReports((prev) => prev.map((r) => (r.id === selected.id ? updated : r)));
    selectReport(updated);
    audit("medicalReport.finalized", selected.id, { version: 1 });
    setStatus("Report finalized.");
    setTimeout(() => setStatus(""), 2500);
  }

  function requestAmend() {
    if (!selected) return;
    const result = amendReport({
      status: selected.status,
      versions: selected.versions,
      currentContent: selected.content,
      newContent: content,
      reasonCode: amendCode,
      reasonNote: amendNote,
      actor: { uid: writer.uid, email: writer.email, role: writer.role, shift: writer.shift },
    });
    if (!result.ok) {
      setStatus(result.error);
      return;
    }
    setPinAction(() => () => void commitAmend(result.updates, result.newVersion));
  }

  async function commitAmend(updates: Record<string, unknown>, newVersion: number) {
    if (!selected) return;
    await trackedSetDoc(
      doc(db, "medicalReports", selected.id),
      updates,
      { merge: true },
      writeMeta(`Amended medical report for ${patient?.labId ?? "patient"}`, { currentVersion: newVersion })
    );
    const updated: MedicalReportRecord = {
      ...selected,
      ...(updates as Partial<MedicalReportRecord>),
      content,
    };
    setReports((prev) => prev.map((r) => (r.id === selected.id ? updated : r)));
    selectReport(updated);
    setAmending(false);
    audit("medicalReport.amended", selected.id, { version: newVersion, reasonCode: amendCode });
    setStatus("Amendment saved.");
    setTimeout(() => setStatus(""), 2500);
  }

  function requestPrint(reportId: string) {
    setPinAction(() => () => {
      printed.current = false;
      setPrintingId(reportId);
    });
  }

  useEffect(() => {
    if (!printingId || staffGateOpen) return;
    if (printed.current) return;
    const timer = window.setTimeout(() => {
      if (printed.current) return;
      printed.current = true;
      const report = reports.find((r) => r.id === printingId);
      if (report) audit("medicalReport.printed", report.id, { version: report.currentVersion });
      window.print();
    }, 300);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [printingId, staffGateOpen]);

  if (loading) {
    return (
      <main className="min-h-screen bg-lf-ground">
        <div className="no-print">
          <AppNav />
        </div>
        <p className="lf-shell py-8 text-lf-ink-2">Loading medical reports...</p>
      </main>
    );
  }

  if (loadError) {
    return (
      <main className="min-h-screen bg-lf-ground">
        <div className="no-print">
          <AppNav />
        </div>
        <div className="lf-shell flex flex-col gap-4 py-8">
          <p className="text-lf-ink-2">Could not load medical reports. {loadError}</p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => setReloadToken((n) => n + 1)}
              className="lf-touch inline-flex items-center justify-center rounded-lf-md border border-lf-line bg-lf-surface px-4 text-sm font-medium text-lf-ink"
            >
              Retry
            </button>
            <Link href={`/patients/${patientId}`} className="lf-touch inline-flex items-center text-sm text-lf-accent">
              Back to patient
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (notFound || !patient) {
    return (
      <main className="min-h-screen bg-lf-ground">
        <div className="no-print">
          <AppNav />
        </div>
        <div className="lf-shell flex flex-col gap-4 py-8">
          <p className="text-lf-ink-2">Patient record not found.</p>
          <Link href="/patients" className="lf-touch inline-flex items-center text-sm text-lf-accent">
            Back to patients
          </Link>
        </div>
      </main>
    );
  }

  const displayName = patientDisplayName(patient) || patient.name || "Patient";
  const sexAge = formatSexAge(patient);
  const printing = reports.find((r) => r.id === printingId) || null;

  return (
    <main className="min-h-screen bg-lf-ground print:bg-white">
      <style>{PRINT_CSS}</style>
      <div className="no-print">
        <AppNav />
        <div className="lf-shell flex flex-col gap-6 py-8">
          <Link href={`/patients/${patientId}`} className="lf-touch inline-flex items-center text-sm text-lf-accent">
            Back to patient
          </Link>
          <div className="flex flex-col gap-2">
            <p className="lf-num text-sm text-lf-ink-2">{patient.labId || "—"}</p>
            <h1 className="text-2xl font-semibold text-lf-ink">Medical reports</h1>
            <p className="text-sm text-lf-ink-2">
              {displayName} · {sexAge}
            </p>
          </div>

          <div className="flex flex-col gap-4 lg:flex-row">
            <section className="flex flex-col gap-2 lg:w-64 lg:shrink-0">
              <button
                type="button"
                onClick={() => void startNewReport()}
                className="lf-touch inline-flex items-center justify-center rounded-lf-md bg-lf-accent px-4 text-sm font-medium text-lf-on-accent"
              >
                New report
              </button>
              <ul className="flex flex-col gap-2">
                {reports.length === 0 && <p className="text-sm text-lf-ink-2">No reports yet.</p>}
                {reports.map((report) => (
                  <li key={report.id}>
                    <button
                      type="button"
                      onClick={() => selectReport(report)}
                      className={`lf-touch flex w-full flex-col items-start gap-1 rounded-lf-md border px-3 text-left text-sm ${
                        report.id === selectedId
                          ? "border-lf-accent bg-lf-accent-soft"
                          : "border-lf-line bg-lf-surface"
                      }`}
                    >
                      <span className="text-lf-ink">{formatDateTime(report.createdAt)}</span>
                      <span className="text-lf-ink-2">
                        {report.status === "final" ? `Final · v${report.currentVersion}` : "Draft"}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>

            {selected && (
              <section className="flex flex-1 flex-col gap-4 rounded-lf-md border border-lf-line bg-lf-surface p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-lf-ink-2">
                    {selected.status === "final"
                      ? `Finalized ${formatDateTime(selected.finalizedAt)} by ${formatHistoryReleaser(selected.finalizedBy)}`
                      : `Draft started ${formatDateTime(selected.createdAt)} by ${formatHistoryReleaser(selected.createdBy)}`}
                  </p>
                  {selected.status === "final" && (
                    <button
                      type="button"
                      onClick={() => requestPrint(selected.id)}
                      className="lf-touch inline-flex items-center justify-center rounded-lf-md border border-lf-line bg-lf-surface px-3 text-sm font-medium text-lf-ink"
                    >
                      Print
                    </button>
                  )}
                </div>

                {selected.status === "draft" || amending ? (
                  <div className="flex flex-col gap-3">
                    {MEDICAL_REPORT_FIELDS.map((field) => (
                      <Textarea
                        key={field}
                        field={field}
                        value={content[field]}
                        disabled={false}
                        onChange={(f, v) => setContent((prev) => ({ ...prev, [f]: v }))}
                      />
                    ))}
                    {amending && (
                      <ReasonCodeField
                        list={REPORT_AMENDMENT_CODES}
                        code={amendCode}
                        note={amendNote}
                        onCode={setAmendCode}
                        onNote={setAmendNote}
                        label="Reason for amendment"
                      />
                    )}
                    <div className="flex flex-wrap gap-2">
                      {selected.status === "draft" ? (
                        <>
                          <button
                            type="button"
                            onClick={() => void saveDraft()}
                            className="lf-touch inline-flex items-center justify-center rounded-lf-md border border-lf-line bg-lf-surface px-4 text-sm font-medium text-lf-ink"
                          >
                            Save draft
                          </button>
                          <button
                            type="button"
                            onClick={requestFinalize}
                            className="lf-touch inline-flex items-center justify-center rounded-lf-md bg-lf-accent px-4 text-sm font-medium text-lf-on-accent"
                          >
                            Finalize
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={requestAmend}
                            disabled={!reportContentChanged(selected.content, content)}
                            className="lf-touch inline-flex items-center justify-center rounded-lf-md bg-lf-accent px-4 text-sm font-medium text-lf-on-accent disabled:opacity-50"
                          >
                            Save amendment
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setAmending(false);
                              setContent(selected.content);
                              setStatus("");
                            }}
                            className="lf-touch inline-flex items-center justify-center rounded-lf-md border border-lf-line bg-lf-surface px-4 text-sm font-medium text-lf-ink"
                          >
                            Cancel
                          </button>
                        </>
                      )}
                    </div>
                  </div>
                ) : (
                  <div className="flex flex-col gap-3">
                    {MEDICAL_REPORT_FIELDS.map((field) => (
                      <div key={field} className="flex flex-col gap-1">
                        <p className="text-[10px] uppercase tracking-[0.06em] text-lf-ink-3">
                          {MEDICAL_REPORT_FIELD_LABELS[field]}
                        </p>
                        <p className="whitespace-pre-wrap text-sm text-lf-ink">{selected.content[field] || "—"}</p>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() => setAmending(true)}
                      className="lf-touch inline-flex w-fit items-center justify-center rounded-lf-md border border-lf-line bg-lf-surface px-4 text-sm font-medium text-lf-ink"
                    >
                      Amend
                    </button>
                  </div>
                )}

                {status && <p className="text-sm text-lf-ink-2">{status}</p>}
              </section>
            )}
          </div>
        </div>
      </div>

      {printing && (
        <div className="print-sheet bg-white mx-auto w-[210mm] p-[15mm]">
          <header className="border-b border-gray-300 pb-3 mb-4">
            <p className="text-sm font-semibold text-gray-900">{clinic?.name || "Clinic"}</p>
            {clinic?.address && <p className="text-xs text-gray-600">{clinic.address}</p>}
            <p className="text-xs text-gray-700 mt-2">
              {displayName} · Lab ID {patient.labId || "—"} · {sexAge}
            </p>
            <p className="text-xs text-gray-600">
              {printing.status === "final"
                ? `Finalized ${formatDateTime(printing.finalizedAt)} by ${formatHistoryReleaser(printing.finalizedBy)} · v${printing.currentVersion}`
                : ""}
            </p>
          </header>
          <h1 className="text-lg font-semibold text-gray-900 mb-4">Medical report</h1>
          <div className="flex flex-col gap-4">
            {MEDICAL_REPORT_FIELDS.map((field) => (
              <div key={field}>
                <p className="text-[10px] uppercase tracking-wide text-gray-500">
                  {MEDICAL_REPORT_FIELD_LABELS[field]}
                </p>
                <p className="whitespace-pre-wrap text-sm text-gray-900">{printing.content[field] || "—"}</p>
              </div>
            ))}
          </div>
          {parseMedicalReportVersions(printing.versions).length > 1 && (
            <div className="mt-6 border-t border-gray-300 pt-2">
              <p className="text-[10px] uppercase tracking-wide text-gray-500 mb-1">Amendment history</p>
              {parseMedicalReportVersions(printing.versions)
                .filter((v) => v.version > 1)
                .map((v) => (
                  <p key={v.version} className="text-[10px] text-gray-600">
                    v{v.version} — {formatDateTime(v.at)} by {formatHistoryReleaser(v.authorEmail)}
                    {v.reasonNote ? ` — ${v.reasonNote}` : ""}
                  </p>
                ))}
            </div>
          )}
          <footer className="mt-8 pt-2 border-t border-gray-300 text-[10px] text-gray-500">
            {clinic?.name || "Clinic"} · {displayName} · Lab ID {patient.labId || "—"} · Printed{" "}
            {new Date().toLocaleString()} by {formatHistoryReleaser(writer.email)}
          </footer>
        </div>
      )}

      {pinAction && (
        <SensitivePinPrompt
          action="medicalReport"
          onClose={() => setPinAction(null)}
          onConfirmed={() => {
            const run = pinAction;
            setPinAction(null);
            run?.();
          }}
        />
      )}
    </main>
  );
}

export default function ReportPage() {
  return (
    <ProtectedRoute require={requireSurface("medicalReport")}>
      <ReportContentContent />
    </ProtectedRoute>
  );
}
