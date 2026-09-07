"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc, getDocFromCache, type DocumentReference } from "firebase/firestore";
import { db } from "../../lib/firebase";
import ProtectedRoute from "../../lib/ProtectedRoute";
import AppNav from "../../lib/AppNav";
import { useAuth } from "../../lib/AuthContext";
import { useWriteIdentity } from "../../lib/pinSession";
import { isOwner } from "../../lib/clinicScope";
import { isPatientDeleted } from "../../lib/patientSoftDelete";
import {
  canApproveResults,
  canViewOwnRegisteredPatients,
  canViewPatients,
  roleLabel,
} from "../../lib/permissions";
import { patientDisplayName } from "../../lib/patientDisplay";
import { formatSexAge } from "../../lib/patientList";
import IconButton from "../../lib/IconButton";
import PrintIcon from "../../lib/PrintIcon";
import { ICON_ACTION_LABELS } from "../../lib/iconAction";
import { patientHistoryHref } from "../../lib/patientHistory";

/**
 * Identity page for fields that left the patient list (E1).
 * Not a history view — do not add visit/result chronology here (that is E3).
 */

interface PatientRecord {
  clinicId?: string;
  createdByUid?: string;
  createdByRole?: string;
  labId?: string;
  name?: string;
  preferredName?: string | null;
  sex?: string;
  dob?: string | null;
  ageYears?: number | null;
  ageMonths?: number | null;
  phone?: string | null;
  address?: string | null;
  nationalId?: string | null;
  nextOfKin?: string | null;
  referringClinician?: string | null;
  createdAt?: string;
}

async function docFromCacheOrServer(ref: DocumentReference) {
  try {
    return await getDocFromCache(ref);
  } catch {
    return getDoc(ref);
  }
}

function Field({ label, value, mono }: { label: string; value?: string | null; mono?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      <p className="text-[10px] uppercase tracking-[0.06em] text-lf-ink-3">{label}</p>
      <p className={`text-sm text-lf-ink ${mono ? "lf-num" : ""}`}>{value || "—"}</p>
    </div>
  );
}

function PatientRecordContent() {
  const params = useParams<{ patientId: string }>();
  const patientId = params.patientId;
  const { role, clinicId } = useAuth();
  const writer = useWriteIdentity();
  const [patient, setPatient] = useState<PatientRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const snap = await docFromCacheOrServer(doc(db, "patients", patientId));
        if (!snap.exists()) {
          setNotFound(true);
          return;
        }
        const data = snap.data() as PatientRecord & { deleted?: boolean };
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
      } catch (err) {
        console.error(err);
        setNotFound(true);
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [patientId, role, clinicId, writer.uid]);

  const displayName = patientDisplayName(patient) || patient?.name || "Patient";

  return (
    <main className="min-h-screen bg-lf-ground">
      <AppNav />
      <div className="lf-shell flex flex-col gap-6 py-8">
        <Link href="/patients" className="lf-touch inline-flex items-center text-sm text-lf-accent">
          Back to patients
        </Link>
        {loading && <p className="text-lf-ink-2">Loading...</p>}
        {!loading && notFound && <p className="text-lf-ink-2">Patient not found.</p>}
        {!loading && patient && (
          <div className="flex flex-col gap-6">
            <div className="flex items-start justify-between gap-3">
              <div className="flex min-w-0 flex-col gap-2">
                <p className="lf-num text-sm text-lf-ink-2">{patient.labId || "—"}</p>
                <h1 className="text-2xl font-semibold text-lf-ink">{displayName}</h1>
                <p className="text-sm text-lf-ink-2">{formatSexAge(patient)}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canApproveResults(role) && (
                  <Link
                    href={patientHistoryHref(patientId)}
                    className="lf-touch inline-flex items-center justify-center rounded-lf-md border border-lf-line bg-lf-surface px-3 text-sm font-medium text-lf-ink hover:bg-lf-surface-2"
                  >
                    History
                  </Link>
                )}
                <IconButton label={ICON_ACTION_LABELS.print} href={`/patients/${patientId}/print`}>
                  <PrintIcon />
                </IconButton>
              </div>
            </div>
            <div className="grid grid-cols-1 gap-4 rounded-lf-md border border-lf-line bg-lf-surface p-4 sm:grid-cols-2">
              <Field label="Phone" value={patient.phone} />
              <Field label="National ID" value={patient.nationalId} />
              <Field label="Address" value={patient.address} />
              <Field label="Next of kin" value={patient.nextOfKin} />
              <Field label="Referring clinician" value={patient.referringClinician} />
              <Field label="Clinic ID" value={patient.clinicId} mono />
              <Field label="Registered" value={patient.createdAt ? new Date(patient.createdAt).toLocaleString() : "—"} />
              <Field label="Registered by" value={roleLabel(patient.createdByRole)} />
            </div>
          </div>
        )}
      </div>
    </main>
  );
}

export default function PatientRecordPage() {
  return (
    <ProtectedRoute require={(role) => canViewPatients(role) || canViewOwnRegisteredPatients(role)}>
      <PatientRecordContent />
    </ProtectedRoute>
  );
}
