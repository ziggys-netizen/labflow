/**
 * Specimen container label. Print-only surface: one label, sized to the
 * clinic's own stock, carrying the Lab ID as text and as a Code 128 barcode.
 * No patient name — see app/lib/specimenLabel.ts.
 */
"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { useParams } from "next/navigation";
import { doc, getDoc, getDocFromCache, type DocumentReference } from "firebase/firestore";
import JsBarcode from "jsbarcode";
import { db } from "../../../lib/firebase";
import { useAuth } from "../../../lib/AuthContext";
import ProtectedRoute from "../../../lib/ProtectedRoute";
import AppNav from "../../../lib/AppNav";
import { isOwner } from "../../../lib/clinicScope";
import { isPatientDeleted } from "../../../lib/patientSoftDelete";
import { canViewPatients, canViewOwnRegisteredPatients } from "../../../lib/permissions";
import { useWriteIdentity } from "../../../lib/pinSession";
import { actorFromAuth, auditTargetLabel, safeLogAudit } from "../../../lib/audit";
import { formatSexAge } from "../../../lib/patientList";
import {
  defaultLabelSize,
  labelPageCss,
  parseLabelSize,
  printableSpecimenLabel,
  type LabelSize,
  type SpecimenLabel,
} from "../../../lib/specimenLabel";

interface PatientRecord {
  clinicId?: string;
  labId?: string;
  sex?: string;
  dob?: string | null;
  ageYears?: number | null;
  ageMonths?: number | null;
}

async function docFromCacheOrServer(ref: DocumentReference) {
  try {
    return await getDocFromCache(ref);
  } catch {
    return getDoc(ref);
  }
}

function LabelContent() {
  const params = useParams<{ patientId: string }>();
  const patientId = params.patientId;
  const { user, role, clinicId } = useAuth();
  const writer = useWriteIdentity();

  const [label, setLabel] = useState<SpecimenLabel | null>(null);
  const [size, setSize] = useState<LabelSize>(defaultLabelSize());
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [labelError, setLabelError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const barcodeRef = useRef<SVGSVGElement>(null);
  const audited = useRef(false);

  useEffect(() => {
    async function load() {
      setLoading(true);
      setNotFound(false);
      setLoadError(null);
      setLabelError(null);
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

        const clinicSnap = data.clinicId
          ? await docFromCacheOrServer(doc(db, "clinics", data.clinicId))
          : null;
        const clinicData = clinicSnap?.exists()
          ? (clinicSnap.data() as Record<string, unknown>)
          : null;
        setSize(parseLabelSize(clinicData));

        const result = printableSpecimenLabel({
          labId: data.labId,
          sexAge: formatSexAge(data),
          clinicName: typeof clinicData?.name === "string" ? clinicData.name : "",
        });
        if (!result.ok) {
          setLabelError(result.error);
          return;
        }
        setLabel(result.label);
      } catch (err) {
        console.error(err);
        setLoadError(err instanceof Error ? err.message : "Unknown error.");
      } finally {
        setLoading(false);
      }
    }
    void load();
  }, [patientId, role, clinicId, reloadToken]);

  // Code 128 encodes the Lab ID exactly. displayValue is off because the Lab
  // ID is already set in text above it at a size a person can read.
  // printableSpecimenLabel has already rejected anything Code 128 cannot
  // carry, so a throw here is genuinely exceptional and only worth logging.
  useEffect(() => {
    if (!label || !barcodeRef.current) return;
    try {
      JsBarcode(barcodeRef.current, label.barcodeValue, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        height: 38,
        width: 1.6,
      });
    } catch (err) {
      console.error(err);
    }
  }, [label]);

  useEffect(() => {
    if (!label || audited.current) return;
    audited.current = true;
    const actor = actorFromAuth(
      { uid: writer.uid || user?.uid || "", email: writer.email },
      writer.role,
      writer.shift
    );
    if (!actor) return;
    safeLogAudit({
      clinicId: clinicId || null,
      actor,
      action: "label.printed",
      targetCollection: "patients",
      targetId: patientId,
      targetLabel: auditTargetLabel(label.labId, "specimenLabel"),
    });
  }, [label, clinicId, patientId, user, writer]);

  if (loading) {
    return (
      <main className="min-h-screen bg-lf-ground">
        <div className="no-print">
          <AppNav />
        </div>
        <p className="lf-shell py-8 text-lf-ink-2">Loading label...</p>
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
          <p className="text-lf-ink-2">Could not load the label. {loadError}</p>
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

  if (notFound) {
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

  if (labelError || !label) {
    return (
      <main className="min-h-screen bg-lf-ground">
        <div className="no-print">
          <AppNav />
        </div>
        <div className="lf-shell flex flex-col gap-4 py-8">
          <p className="text-lf-ink-2">{labelError}</p>
          <Link href={`/patients/${patientId}`} className="lf-touch inline-flex items-center text-sm text-lf-accent">
            Back to patient
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-lf-ground print:bg-white">
      <style>{labelPageCss(size)}</style>
      <div className="no-print">
        <AppNav />
        <div className="lf-shell flex flex-col gap-4 py-8">
          <Link href={`/patients/${patientId}`} className="lf-touch inline-flex items-center text-sm text-lf-accent">
            Back to patient
          </Link>
          <h1 className="text-2xl font-semibold text-lf-ink">Specimen label</h1>
          <p className="text-sm text-lf-ink-2">
            {size.widthMm}×{size.heightMm}mm. Choose the label printer in the print dialog. Change the
            size in Clinic profile if it does not match your stock.
          </p>
          <button
            type="button"
            onClick={() => window.print()}
            className="lf-touch inline-flex w-fit items-center justify-center rounded-lf-md bg-lf-accent px-4 text-sm font-medium text-lf-on-accent"
          >
            Print label
          </button>
        </div>
      </div>

      <div className="label-sheet mx-auto box-border flex flex-col justify-between bg-white p-[2mm] text-black">
        <div className="leading-none">
          <p className="lf-num text-[4.2mm] font-bold tracking-tight">{label.labId}</p>
          <p className="mt-[1mm] text-[2.6mm]">{label.sexAge}</p>
        </div>
        <svg ref={barcodeRef} className="block w-full" aria-label={`Barcode for ${label.labId}`} />
        <p className="text-[2.2mm] leading-none">
          {label.clinicName} · {label.printedAt}
        </p>
      </div>
    </main>
  );
}

export default function SpecimenLabelPage() {
  return (
    <ProtectedRoute require={(role) => canViewPatients(role) || canViewOwnRegisteredPatients(role)}>
      <LabelContent />
    </ProtectedRoute>
  );
}
