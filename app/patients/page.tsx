"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { db } from "../lib/firebase";
import { doc, getDoc } from "firebase/firestore";
import ProtectedRoute from "../lib/ProtectedRoute";
import AppNav from "../lib/AppNav";
import NotYetSynced from "../lib/NotYetSynced";
import { useAuth } from "../lib/AuthContext";
import { useClinicCollection } from "../lib/clinicListen";
import { trackedSetDoc, writeActorFromUser } from "../lib/trackedWrites";
import { actorFromAuth, auditTargetLabel, safeLogAudit } from "../lib/audit";
import { isOrderForDeletedPatient, isPatientDeleted, softDeletePatient } from "../lib/patientSoftDelete";
import { isReleasedResultStatus } from "../lib/resultAmendment";
import {
  canAmendResult,
  canApproveResults,
  canDeletePatient,
  canEnterResults,
  canOrderTests,
  canRecordSampleCollection,
  canRegisterPatient,
  canViewOwnRegisteredPatients,
  canViewPatients,
} from "../lib/permissions";
import { PATIENT_DELETE_CODES, formatJustification, justificationReady } from "../lib/reasonCodes";
import ReasonCodeField from "../lib/ReasonCodeField";
import { useWriteIdentity } from "../lib/pinSession";
import { patientDisplayName } from "../lib/patientDisplay";
import { parseAgeYears } from "../lib/resultFlag";
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
import { OperationalChip } from "../lib/OperationalRow";
import { operationalStripeClass } from "../lib/operationalFlag";
import {
  canPerformPrimaryAction,
  formatSexAge,
  patientLastActivity,
  patientListChip,
  patientListMatchesQuery,
  patientPrimaryAction,
  patientRecordHref,
  primaryActionHref,
  type PatientListOrder,
} from "../lib/patientList";

interface Patient {
  id: string;
  clinicId: string;
  labId: string;
  name: string;
  preferredName: string;
  sex: string;
  dob: string;
  phone: string;
  ageYears: number | null;
  ageMonths: number | null;
  createdAt: string;
  notYetSynced?: boolean;
}

function parseAgeMonths(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string" && value.trim()) {
    const months = Number(value.trim());
    return Number.isFinite(months) ? months : null;
  }
  return null;
}

function orderForList(
  id: string,
  data: Record<string, unknown>,
  notYetSynced?: boolean
): PatientListOrder {
  const parsed = orderCollectionFromData(id, data, notYetSynced);
  return {
    ...parsed,
    createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
    resultsEnteredAt: typeof data.resultsEnteredAt === "string" ? data.resultsEnteredAt : null,
    reviewedAt: typeof data.reviewedAt === "string" ? data.reviewedAt : null,
    lastAmendedAt: typeof data.lastAmendedAt === "string" ? data.lastAmendedAt : null,
    recollectionOfOrderId:
      typeof data.recollectionOfOrderId === "string" ? data.recollectionOfOrderId : null,
  };
}

function primaryDisabledTitle(
  kind: ReturnType<typeof patientPrimaryAction>["kind"],
  canAct: boolean,
  canCollect: boolean,
  sampleState: ReturnType<typeof getPatientCollectionCheckboxState>
) {
  if (canAct && kind === "collect" && !sampleState.canToggle) {
    return sampleState.multiSpecimenExplanation
      || "Open the order to record collection";
  }
  if (canAct) return undefined;
  if (kind === "order") return "Your role cannot order tests";
  if (kind === "collect") {
    return "Only a technician, laboratory lead, or owner can record sample collection";
  }
  if (kind === "enter") return "Your role cannot enter results";
  if (kind === "review") return "Your role cannot review results";
  return undefined;
}

function MoreMenu({
  open,
  onToggle,
  onClose,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open, onClose]);

  return (
    <div ref={ref} className="relative shrink-0">
      <button
        type="button"
        aria-label="More actions"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        className="lf-touch inline-flex items-center justify-center rounded-lf-md border border-lf-line bg-lf-surface text-lf-ink-2 hover:text-lf-ink"
      >
        ⋯
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 z-20 mt-1 min-w-[10rem] rounded-lf-md border border-lf-line bg-lf-surface py-1 shadow-lg"
        >
          {children}
        </div>
      )}
    </div>
  );
}

function menuItemClass(danger = false) {
  return [
    "lf-touch flex w-full items-center px-3 text-left text-sm",
    danger ? "text-lf-crit hover:bg-lf-crit-soft" : "text-lf-ink hover:bg-lf-surface-2",
  ].join(" ");
}

function PatientsContent() {
  const router = useRouter();
  const { user, role, clinicId, username, shift } = useAuth();
  const writer = useWriteIdentity();
  const [query, setQuery] = useState("");
  const [openMenuId, setOpenMenuId] = useState<string | null>(null);
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
  const canEnter = canEnterResults(role);
  const canReview = canApproveResults(role);
  const canAmend = canAmendResult(role);

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
            name: typeof data.name === "string" && data.name ? data.name : "—",
            preferredName: typeof data.preferredName === "string" ? data.preferredName : "",
            sex: data.sex || "",
            dob: typeof data.dob === "string" ? data.dob : "",
            phone: typeof data.phone === "string" ? data.phone : "",
            ageYears: parseAgeYears(data.ageYears),
            ageMonths: parseAgeMonths(data.ageMonths),
            createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
            notYetSynced: docSnap.metadata.hasPendingWrites,
          };
        }),
    [patientsQuery.docs, role, writer.uid]
  );

  const ordersByPatient = useMemo(() => {
    const grouped: Record<string, PatientListOrder[]> = {};
    for (const orderDoc of ordersQuery.docs) {
      const data = orderDoc.data();
      if (!data.patientId || isOrderForDeletedPatient(data)) continue;
      (grouped[data.patientId] ||= []).push(
        orderForList(orderDoc.id, data, orderDoc.metadata.hasPendingWrites)
      );
    }
    return grouped;
  }, [ordersQuery.docs]);

  const visiblePatients = useMemo(
    () => patients.filter((p) => patientListMatchesQuery(p, query)),
    [patients, query]
  );

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
    const state = getPatientCollectionCheckboxState(
      (ordersByPatient[patient.id] || []) as OrderCollectionFields[]
    );
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
          safeLogAudit({
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
    setOpenMenuId(null);
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
        reasonCode: deletionCode,
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

  function renderPrimary(patient: Patient) {
    const orders = ordersByPatient[patient.id] || [];
    const action = patientPrimaryAction(orders);
    const sampleState = getPatientCollectionCheckboxState(orders);
    const canAct = canPerformPrimaryAction(action.kind, {
      canOrder,
      canCollect,
      canEnter,
      canReview,
    });
    const href = primaryActionHref(patient.id, action);
    const collecting = savingSampleId === patient.id;
    const collectInline = action.kind === "collect" && canAct && sampleState.canToggle;
    const title = primaryDisabledTitle(action.kind, canAct, canCollect, sampleState);
    const className =
      "lf-touch inline-flex w-full items-center justify-center rounded-lf-md bg-lf-accent px-3 text-sm font-medium text-lf-on-accent disabled:opacity-50 sm:w-auto";

    if (collectInline) {
      return (
        <button
          type="button"
          disabled={collecting}
          title={title}
          onClick={(e) => {
            e.stopPropagation();
            void toggleSampleCollected(patient, true);
          }}
          className={className}
        >
          {collecting ? "Saving..." : action.label}
        </button>
      );
    }

    if (!href || !canAct) {
      return (
        <button type="button" disabled title={title} className={className} onClick={(e) => e.stopPropagation()}>
          {action.label}
        </button>
      );
    }

    return (
      <Link href={href} title={title} onClick={(e) => e.stopPropagation()} className={className}>
        {action.label}
      </Link>
    );
  }

  function renderMenu(patient: Patient) {
    const orders = ordersByPatient[patient.id] || [];
    const action = patientPrimaryAction(orders);
    const released = orders.find((o) => isReleasedResultStatus(o.status));
    const items: ReactNode[] = [];

    if (released && action.kind !== "print") {
      items.push(
        <Link
          key="print"
          role="menuitem"
          href={`/patients/${patient.id}/print`}
          className={menuItemClass()}
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId(null);
          }}
        >
          Print
        </Link>
      );
    }
    if (canAmend && released) {
      items.push(
        <Link
          key="amend"
          role="menuitem"
          href={`/orders/${released.id}`}
          className={menuItemClass()}
          onClick={(e) => {
            e.stopPropagation();
            setOpenMenuId(null);
          }}
        >
          Amend
        </Link>
      );
    }
    if (canDelete) {
      items.push(
        <button
          key="delete"
          type="button"
          role="menuitem"
          disabled={deletingId === patient.id}
          className={menuItemClass(true)}
          onClick={(e) => {
            e.stopPropagation();
            openDelete(patient.id, patient.name, patient.labId, patient.clinicId);
          }}
        >
          {deletingId === patient.id ? "Removing..." : "Delete"}
        </button>
      );
    }

    if (items.length === 0) return null;

    return (
      <MoreMenu
        open={openMenuId === patient.id}
        onToggle={() => setOpenMenuId((id) => (id === patient.id ? null : patient.id))}
        onClose={() => setOpenMenuId(null)}
      >
        {items}
      </MoreMenu>
    );
  }

  function rowBody(patient: Patient) {
    const orders = ordersByPatient[patient.id] || [];
    const chip = patientListChip(orders);
    const sexAge = formatSexAge(patient);
    const activity = patientLastActivity(patient.createdAt, orders);
    const displayName = patientDisplayName(patient) || patient.name;
    return { orders, chip, sexAge, activity, displayName };
  }

  return (
    <main className="min-h-screen bg-lf-ground">
      <AppNav />
      <div className="lf-shell flex flex-col gap-6 py-8">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <h1 className="text-2xl font-semibold text-lf-ink">Patients</h1>
          <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-4">
            {canRegister && (
              <Link
                href="/register"
                className="lf-touch inline-flex w-full items-center justify-center rounded-lf-md bg-lf-accent px-4 text-sm font-medium text-lf-on-accent sm:w-auto"
              >
                Register a patient
              </Link>
            )}
            {canDelete && (
              <Link
                href="/patients/deleted"
                className="lf-touch inline-flex w-full items-center justify-center text-sm font-medium text-lf-ink-2 underline sm:w-auto"
              >
                Recycle bin
              </Link>
            )}
          </div>
        </div>

        {loading && <p className="text-lf-ink-2">Loading...</p>}
        {error && <p className="text-lf-crit">{error}</p>}

        {!loading && !error && patients.length === 0 && (
          <p className="text-lf-ink-2">No patients registered yet.</p>
        )}

        {!loading && patients.length > 0 && (
          <label className="flex max-w-xl flex-col gap-2">
            <span className="text-sm text-lf-ink-2">Search</span>
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Lab ID, name or phone"
              className="lf-touch w-full min-w-0 rounded-lf-md border border-lf-line bg-lf-surface px-3 text-sm text-lf-ink"
            />
          </label>
        )}

        {!loading && patients.length > 0 && visiblePatients.length === 0 && (
          <p className="text-lf-ink-2">No patients match that search.</p>
        )}

        {!loading && visiblePatients.length > 0 && (
          <>
            <ul className="flex flex-col gap-3 sm:hidden">
              {visiblePatients.map((p) => {
                const { chip, sexAge, activity, displayName } = rowBody(p);
                return (
                  <li
                    key={p.id}
                    className={`flex flex-col gap-3 rounded-lf-md border border-lf-line bg-lf-surface p-4 ${operationalStripeClass(chip.state)}`}
                  >
                    <Link href={patientRecordHref(p.id)} className="flex min-w-0 flex-col gap-2">
                      <span className="lf-num block truncate text-sm text-lf-ink-2" title={p.labId}>
                        {p.labId}
                      </span>
                      <span className="inline-flex min-w-0 items-center gap-2 font-medium text-lf-ink">
                        <span className="truncate">{displayName}</span>
                        <NotYetSynced
                          show={
                            p.notYetSynced ||
                            (ordersByPatient[p.id] || []).some((o) => o.notYetSynced)
                          }
                        />
                      </span>
                      <span className="text-sm text-lf-ink-2">{sexAge}</span>
                      <span className="text-sm text-lf-ink-2">{activity}</span>
                      <OperationalChip state={chip.state} label={chip.label} />
                    </Link>
                    <div className="flex flex-col gap-2">
                      {renderPrimary(p)}
                      {renderMenu(p)}
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="hidden min-w-0 overflow-x-auto sm:block">
              <table className="w-full min-w-0 border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-lf-line">
                    <th className="py-2 pr-3 font-medium text-lf-ink-2">Lab ID</th>
                    <th className="py-2 pr-3 font-medium text-lf-ink-2">Name</th>
                    <th className="whitespace-nowrap py-2 pr-3 font-medium text-lf-ink-2">Sex · Age</th>
                    <th className="py-2 pr-3 font-medium text-lf-ink-2">Last activity</th>
                    <th className="py-2 pr-3 font-medium text-lf-ink-2">State</th>
                    <th
                      className="sticky right-0 whitespace-nowrap bg-lf-surface py-2 pl-3 font-medium text-lf-ink-2"
                      style={{ position: "sticky", right: 0, background: "var(--lf-surface)" }}
                    >
                      Action
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {visiblePatients.map((p) => {
                    const { chip, sexAge, activity, displayName } = rowBody(p);
                    return (
                      <tr
                        key={p.id}
                        className={`cursor-pointer border-b border-lf-line hover:bg-lf-surface-2 ${operationalStripeClass(chip.state)}`}
                        onClick={() => router.push(patientRecordHref(p.id))}
                      >
                        <td className="py-2 pr-3 align-middle">
                          <span className="lf-num block truncate text-lf-ink" title={p.labId}>
                            {p.labId}
                          </span>
                        </td>
                        <td className="py-2 pr-3 align-middle">
                          <span className="inline-flex min-w-0 items-center gap-2 text-lf-ink">
                            <span className="truncate">{displayName}</span>
                            <NotYetSynced
                              show={
                                p.notYetSynced ||
                                (ordersByPatient[p.id] || []).some((o) => o.notYetSynced)
                              }
                            />
                          </span>
                        </td>
                        <td className="whitespace-nowrap py-2 pr-3 align-middle text-lf-ink-2">
                          {sexAge}
                        </td>
                        <td className="py-2 pr-3 align-middle text-lf-ink-2">{activity}</td>
                        <td className="py-2 pr-3 align-middle">
                          <OperationalChip state={chip.state} label={chip.label} />
                        </td>
                        <td
                          className="sticky right-0 whitespace-nowrap bg-lf-surface py-2 pl-3 align-middle"
                          style={{ position: "sticky", right: 0, background: "var(--lf-surface)" }}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <div className="flex items-center justify-end gap-2">
                            {renderPrimary(p)}
                            {renderMenu(p)}
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </>
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
            className="w-full max-w-md rounded-lf-md bg-lf-surface p-6 shadow-lg"
          >
            <h2 id="delete-patient-title" className="text-lg font-semibold text-lf-ink">
              Remove {pendingDelete.name}?
            </h2>
            <p className="mt-2 text-sm text-lf-ink-2">
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
            {deleteError && <p className="mt-2 text-sm text-lf-crit">{deleteError}</p>}
            <div className="mt-5 flex justify-end gap-3">
              <button
                type="button"
                onClick={closeDelete}
                disabled={!!deletingId}
                className="rounded-lf-md border border-lf-line px-4 py-2 text-sm font-medium text-lf-ink-2 hover:bg-lf-surface-2 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={!!deletingId || !justificationReady(PATIENT_DELETE_CODES, deletionCode, deletionReason)}
                className="rounded-lf-md bg-lf-crit px-4 py-2 text-sm font-medium text-lf-surface hover:opacity-90 disabled:opacity-50"
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
