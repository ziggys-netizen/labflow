"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { db } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import ProtectedRoute from "../lib/ProtectedRoute";
import AppNav from "../lib/AppNav";
import PrintIcon from "../lib/PrintIcon";
import NotYetSynced from "../lib/NotYetSynced";
import { useAuth } from "../lib/AuthContext";
import { useClinicCollection } from "../lib/clinicListen";
import { trackedSetDoc, writeActorFromUser } from "../lib/trackedWrites";
import { actorFromAuth, auditTargetLabel, safeLogAudit } from "../lib/audit";
import { isOrderForDeletedPatient, isPatientDeleted, softDeletePatient } from "../lib/patientSoftDelete";
import { isReleasedResultStatus } from "../lib/resultAmendment";
import {
  canDeletePatient,
  canOrderTests,
  canRecordSampleCollection,
  canRegisterPatient,
  canViewOwnRegisteredPatients,
  canViewPatients,
} from "../lib/permissions";
import { PATIENT_DELETE_CODES, formatJustification, justificationReady } from "../lib/reasonCodes";
import ReasonCodeField from "../lib/ReasonCodeField";
import { useWriteIdentity } from "../lib/pinSession";
import {
  SAMPLE_COLLECTED_SOURCE,
  getPatientCollectionCheckboxState,
  interpretCollection,
  mergeSpecimenCollections,
  orderCollectionFromData,
  parseSampleCollections,
  specimenCollectionWrite,
  type OrderCollectionFields,
  type SampleCollections,
} from "../lib/sampleCollection";

interface Patient {
  id: string;
  clinicId: string;
  labId: string;
  name: string;
  preferredName: string;
  sex: string;
  dob: string;
  phone: string;
  address: string;
  nationalId: string;
  nextOfKin: string;
  referringClinician: string;
  createdAt: string;
  notYetSynced?: boolean;
}

function sampleActionTitle(
  canCollect: boolean,
  state: ReturnType<typeof getPatientCollectionCheckboxState>
) {
    if (!canCollect) {
    return "Only a technician, laboratory lead, or owner can record sample collection";
  }
  if (state.multiSpecimenExplanation) {
    return state.multiSpecimenExplanation;
  }
  if (state.currentOrders.length === 0) {
    return "No current order is available; create or open an order to record collection";
  }
  if (state.uncollectedOrders.length === 1) {
    return "Record collection on the one current order still awaiting a sample";
  }
  if (state.uncollectedOrders.length > 1) {
    return "Multiple current orders await samples; open the intended order to record collection";
  }
  if (state.reversibleOrders.length === 1) {
    return "Undo the collection recorded from this patient-list checkbox";
  }
  return "Collection is recorded on the orders; open the intended order to change it";
}

function PatientsContent() {
  const { user, role, clinicId, username, shift } = useAuth();
  const writer = useWriteIdentity();
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [savingSampleId, setSavingSampleId] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{
    id: string;
    name: string;
    labId: string;
    clinicId: string;
  } | null>(null);
  const [deletionReason, setDeletionReason] = useState("");
  const [deletionCode, setDeletionCode] = useState("");
  const [deleteError, setDeleteError] = useState("");

  const canCollect = canRecordSampleCollection(role);
  const canDelete = canDeletePatient(role);
  const canOrder = canOrderTests(role);
  const canRegister = canRegisterPatient(role);

  const patientsQuery = useClinicCollection("patients", role, clinicId, {
    sortBy: "createdAt",
    direction: "desc",
  });
  const ordersQuery = useClinicCollection("orders", role, clinicId);

  const patients = useMemo<Patient[]>(
    () =>
      patientsQuery.docs
        .filter((docSnap) => {
          if (isPatientDeleted(docSnap.data())) return false;
          if (canViewOwnRegisteredPatients(role) && !canViewPatients(role)) {
            return docSnap.data().createdByUid === writer.uid;
          }
          return true;
        })
        .map((docSnap) => {
          const data = docSnap.data();
          return {
            id: docSnap.id,
            clinicId: data.clinicId || "",
            labId: data.labId || "—",
            name: data.name,
            preferredName: data.preferredName || "—",
            sex: data.sex || "—",
            dob: data.dob,
            phone: data.phone,
            address: data.address || "—",
            nationalId: data.nationalId || "—",
            nextOfKin: data.nextOfKin || "—",
            referringClinician: data.referringClinician || "—",
            createdAt: data.createdAt,
            notYetSynced: docSnap.metadata.hasPendingWrites,
          };
        }),
    [patientsQuery.docs, role, writer.uid]
  );

  const ordersByPatient = useMemo(() => {
    const grouped: Record<string, OrderCollectionFields[]> = {};
    for (const orderDoc of ordersQuery.docs) {
      const data = orderDoc.data();
      if (!data.patientId || isOrderForDeletedPatient(data)) continue;
      (grouped[data.patientId] ||= []).push(
        orderCollectionFromData(orderDoc.id, data, orderDoc.metadata.hasPendingWrites)
      );
    }
    return grouped;
  }, [ordersQuery.docs]);

  const loading = patientsQuery.loading || ordersQuery.loading;
  const error = patientsQuery.error
    ? `Could not load patients. ${patientsQuery.error}`
    : ordersQuery.error
      ? `Could not load patients. ${ordersQuery.error}`
      : "";

  useEffect(() => {
    if (patientsQuery.error) {
      console.error(patientsQuery.error);
    }
    if (ordersQuery.error) {
      console.error(ordersQuery.error);
    }
  }, [patientsQuery.error, ordersQuery.error]);

  async function toggleSampleCollected(patient: Patient, collected: boolean) {
    if (!user || !canCollect) return;
    const state = getPatientCollectionCheckboxState(ordersByPatient[patient.id] || []);
    const target = collected
      ? state.uncollectedOrders.length === 1
        ? state.uncollectedOrders[0]
        : undefined
      : state.checked && state.reversibleOrders.length === 1
        ? state.reversibleOrders[0]
        : undefined;

    if (!target) return;

    setSavingSampleId(patient.id);
    const timestamp = collected ? new Date().toISOString() : null;
    const source = collected ? SAMPLE_COLLECTED_SOURCE.patientCheckbox : null;

    try {
      const orderRef = doc(db, "orders", target.id);
      const snapshot = await getDoc(orderRef);
      const current = snapshot.exists()
        ? orderCollectionFromData(target.id, snapshot.data() || {})
        : null;
      const stillCurrent = current && !isReleasedResultStatus(current.status);
      const collection = current ? interpretCollection(current) : null;
      const canApply = collected
        ? Boolean(stillCurrent && collection && !collection.allCollected && !collection.isMultiSpecimen)
        : Boolean(
            stillCurrent &&
              collection?.allCollected &&
              current.sampleCollectedSource === SAMPLE_COLLECTED_SOURCE.patientCheckbox
          );

      if (!canApply || !current || !collection) {
        return;
      }

      let sampleCollections: SampleCollections;
      if (collected && timestamp) {
        const updates: SampleCollections = {};
        for (const type of collection.required) {
          updates[type] = specimenCollectionWrite(timestamp, user.email, SAMPLE_COLLECTED_SOURCE.patientCheckbox);
        }
        sampleCollections = mergeSpecimenCollections(current.sampleCollections, updates);
      } else {
        sampleCollections = parseSampleCollections(current.sampleCollections);
        for (const type of collection.required) {
          delete sampleCollections[type];
        }
      }

      await trackedSetDoc(
        orderRef,
        {
          sampleCollections,
          sampleCollectedSource: source,
          sampleCollectionQuickAction: null,
        },
        { merge: true },
        {
          ...writeActorFromUser(user, username),
          operation: "update",
          summary: collected
            ? `Recorded sample collection for ${patient.name}`
            : `Cleared sample collection for ${patient.name}`,
          clinicId: patient.clinicId,
          patientName: patient.name,
          patientLabId: patient.labId,
          orderId: target.id,
          expected: { sampleCollections },
        }
      );
      if (collected) {
        const actor = actorFromAuth(user, role, shift);
        if (actor) {
          await safeLogAudit({
            clinicId: patient.clinicId || clinicId,
            actor,
            action: "order.sampleCollected",
            targetCollection: "orders",
            targetId: target.id,
            targetLabel: auditTargetLabel(patient.labId, "patient"),
            detail: { source: SAMPLE_COLLECTED_SOURCE.patientCheckbox },
          });
        }
      }
    } catch (err) {
      console.error(err);
      alert("Could not update sample collection status. Please try again.");
    } finally {
      setSavingSampleId(null);
    }
  }

  function openDelete(id: string, name: string, labId: string, patientClinicId: string) {
    if (!canDelete) return;
    setPendingDelete({ id, name, labId, clinicId: patientClinicId });
    setDeletionReason("");
    setDeletionCode("");
    setDeleteError("");
  }

  function closeDelete() {
    if (deletingId) return;
    setPendingDelete(null);
    setDeletionReason("");
    setDeletionCode("");
    setDeleteError("");
  }

  async function confirmDelete() {
    if (!canDelete || !user || !pendingDelete) return;
    if (!justificationReady(PATIENT_DELETE_CODES, deletionCode, deletionReason)) {
      setDeleteError("Choose a reason.");
      return;
    }
    const reason = formatJustification(PATIENT_DELETE_CODES, deletionCode, deletionReason);

    setDeletingId(pendingDelete.id);
    setDeleteError("");
    try {
      await softDeletePatient({
        patientId: pendingDelete.id,
        reason,
        actor: { uid: user.uid, email: user.email, role, shift },
        role,
        clinicId,
        targetLabel: auditTargetLabel(pendingDelete.labId, "patient"),
        patientClinicId: pendingDelete.clinicId,
      });
      setPendingDelete(null);
      setDeletionReason("");
      setDeletionCode("");
    } catch (err) {
      console.error(err);
      setDeleteError("Could not remove patient. Please try again.");
    } finally {
      setDeletingId(null);
    }
  }

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-6xl mx-auto px-6 py-16">
        <div className="flex items-center justify-between mb-6">
          <h1 className="text-2xl font-semibold text-gray-900">Patients</h1>
          <div className="flex items-center gap-4">
            {canDelete && (
              <Link href="/patients/deleted" className="text-sm font-medium text-gray-700 underline">
                Recycle bin
              </Link>
            )}
            {canRegister && (
              <Link href="/register" className="text-sm font-medium text-gray-900 underline">
                Register a patient
              </Link>
            )}
          </div>
        </div>

        {loading && <p className="text-gray-600">Loading...</p>}
        {error && <p className="text-red-600">{error}</p>}

        {!loading && !error && patients.length === 0 && (
          <p className="text-gray-600">No patients registered yet.</p>
        )}

        {!loading && patients.length > 0 && (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="border-b border-gray-300">
                  <th className="py-2 pr-2 w-8" aria-label="Print" />
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Clinic ID</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Lab ID</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Name</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Preferred name</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Sex</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">DOB</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Phone</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Address</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">National ID</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Next of kin</th>
                  <th className="py-2 pr-4 font-medium text-gray-700 whitespace-nowrap">Referring clinician</th>
                  <th className="py-2 pr-4"></th>
                </tr>
              </thead>
              <tbody>
                {patients.map((p) => {
                  const sampleState = getPatientCollectionCheckboxState(
                    ordersByPatient[p.id] || []
                  );
                  const sampleDisabled =
                    !canCollect || !sampleState.canToggle || savingSampleId === p.id;
                  return (
                    <tr key={p.id} className="border-b border-gray-100">
                      <td className="py-2 pr-2 align-middle">
                        <Link
                          href={`/patients/${p.id}/print`}
                          target="_blank"
                          rel="noopener noreferrer"
                          title={`Print record for ${p.name}`}
                          aria-label={`Print record for ${p.name}`}
                          className="inline-flex text-gray-500 hover:text-gray-900"
                        >
                          <PrintIcon />
                        </Link>
                      </td>
                      <td
                        className="py-2 pr-4 text-gray-600 whitespace-nowrap font-mono text-xs"
                        title={p.clinicId}
                      >
                        {p.clinicId || "—"}
                      </td>
                      <td className="py-2 pr-4 text-gray-900 whitespace-nowrap">{p.labId}</td>
                      <td className="py-2 pr-4 text-gray-900 whitespace-nowrap">
                        <span className="inline-flex items-center gap-2">
                          {p.name}
                          <NotYetSynced
                            show={
                              p.notYetSynced ||
                              (ordersByPatient[p.id] || []).some((o) => o.notYetSynced)
                            }
                          />
                        </span>
                      </td>
                      <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{p.preferredName}</td>
                      <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{p.sex}</td>
                      <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{p.dob}</td>
                      <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{p.phone}</td>
                      <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{p.address}</td>
                      <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{p.nationalId}</td>
                      <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{p.nextOfKin}</td>
                      <td className="py-2 pr-4 text-gray-600 whitespace-nowrap">{p.referringClinician}</td>
                      <td className="py-2 pr-4 whitespace-nowrap">
                        {canOrder && (
                          <Link href={`/orders/new/${p.id}`} className="text-gray-900 underline mr-3">
                            Order tests
                          </Link>
                        )}
                        {canDelete && (
                          <button
                            onClick={() => openDelete(p.id, p.name, p.labId, p.clinicId)}
                            disabled={deletingId === p.id}
                            className="text-red-600 hover:text-red-800 disabled:opacity-50"
                          >
                            {deletingId === p.id ? "Removing..." : "Delete"}
                          </button>
                        )}
                        <label
                          className={`inline-flex items-center gap-1.5 ml-3 ${
                            canCollect && sampleState.canToggle
                              ? "cursor-pointer"
                              : "cursor-not-allowed"
                          } ${canCollect ? "" : "opacity-60"}`}
                          title={sampleActionTitle(canCollect, sampleState)}
                        >
                          <input
                            type="checkbox"
                            checked={sampleState.checked}
                            ref={(el) => {
                              if (el) el.indeterminate = sampleState.indeterminate;
                            }}
                            disabled={sampleDisabled}
                            onChange={(e) => toggleSampleCollected(p, e.target.checked)}
                            className="h-4 w-4 accent-gray-900 disabled:opacity-50"
                          />
                          <span className="text-gray-700">Sample collected</span>
                        </label>
                        {sampleState.multiSpecimenExplanation && (
                          <p className="text-xs text-gray-500 max-w-[14rem] mt-1 ml-3">
                            Mixed specimens — collect each on the order. The checkbox would be a lie.
                          </p>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {pendingDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="delete-patient-title"
            onSubmit={(e) => {
              e.preventDefault();
              void confirmDelete();
            }}
            className="w-full max-w-md rounded-lg bg-white p-6 shadow-lg"
          >
            <h2 id="delete-patient-title" className="text-lg font-semibold text-gray-900">
              Remove {pendingDelete.name}?
            </h2>
            <p className="mt-2 text-sm text-gray-600">
              The record is retained and recoverable. This action is logged. There is no permanent
              delete for any role.
            </p>
            <div className="mt-4">
              <ReasonCodeField
                list={PATIENT_DELETE_CODES}
                code={deletionCode}
                note={deletionReason}
                onCode={setDeletionCode}
                onNote={setDeletionReason}
              />
            </div>
            {deleteError && <p className="mt-2 text-sm text-red-600">{deleteError}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDelete}
                disabled={!!deletingId}
                className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!!deletingId || !justificationReady(PATIENT_DELETE_CODES, deletionCode, deletionReason)}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deletingId ? "Removing..." : "Confirm"}
              </button>
            </div>
          </form>
        </div>
      )}
    </main>
  );
}

export default function Patients() {
  return (
    <ProtectedRoute require={(role) => canViewPatients(role) || canViewOwnRegisteredPatients(role)}>
      <PatientsContent />
    </ProtectedRoute>
  );
}
