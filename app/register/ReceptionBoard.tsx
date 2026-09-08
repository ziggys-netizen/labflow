"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import AppNav from "../lib/AppNav";
import NotYetSynced from "../lib/NotYetSynced";
import OperationalRow from "../lib/OperationalRow";
import { useAuth } from "../lib/AuthContext";
import { useClinicCollection } from "../lib/clinicListen";
import { isPatientDeleted } from "../lib/patientSoftDelete";
import { isOrderForDeletedPatient } from "../lib/patientSoftDelete";
import { useWriteIdentity } from "../lib/pinSession";
import { orderCollectionFromData } from "../lib/sampleCollection";
import type { LabTest } from "../lib/testCatalog";
import {
  buildAwaitingCollection,
  buildTodaysRegistrations,
  matchesPatientSearch,
  operationalForReceptionRow,
  visibleReceptionList,
  type ReceptionPatient,
} from "../lib/receptionBoard";

export default function ReceptionBoard({ children }: { children: ReactNode }) {
  const { role, clinicId } = useAuth();
  const writer = useWriteIdentity();
  const [search, setSearch] = useState("");
  const [showAllRegistered, setShowAllRegistered] = useState(false);
  const [showAllAwaiting, setShowAllAwaiting] = useState(false);
  const now = useMemo(() => new Date(), []);

  const patientsQuery = useClinicCollection("patients", role, clinicId);
  const ordersQuery = useClinicCollection("orders", role, clinicId);
  const catalogQuery = useClinicCollection("testCatalog", role, clinicId);

  const patients = useMemo(() => {
    const rows: ReceptionPatient[] = [];
    for (const docSnap of patientsQuery.docs) {
      const data = docSnap.data();
      if (isPatientDeleted(data)) continue;
      rows.push({
        id: docSnap.id,
        labId: typeof data.labId === "string" ? data.labId : "",
        name: typeof data.name === "string" ? data.name : "",
        preferredName: typeof data.preferredName === "string" ? data.preferredName : "",
        createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
        createdByUid: typeof data.createdByUid === "string" ? data.createdByUid : null,
        notYetSynced: docSnap.metadata.hasPendingWrites,
      });
    }
    return rows;
  }, [patientsQuery.docs]);

  const patientsById = useMemo(() => new Map(patients.map((row) => [row.id, row])), [patients]);

  const ownPatientIds = useMemo(() => {
    const uid = writer.uid;
    if (!uid) return null;
    return new Set(patients.filter((row) => row.createdByUid === uid).map((row) => row.id));
  }, [patients, writer.uid]);

  const catalog = useMemo(
    () =>
      catalogQuery.docs.map((docSnap) => {
        const data = docSnap.data() as LabTest;
        return {
          code: typeof data.code === "string" ? data.code : "",
          name: typeof data.name === "string" ? data.name : "",
          specimenType: data.specimenType,
        };
      }),
    [catalogQuery.docs]
  );

  const orders = useMemo(
    () =>
      ordersQuery.docs
        .filter((docSnap) => !isOrderForDeletedPatient(docSnap.data()))
        .map((docSnap) => {
          const data = docSnap.data();
          return {
            ...orderCollectionFromData(docSnap.id, data, docSnap.metadata.hasPendingWrites),
            createdAt: typeof data.createdAt === "string" ? data.createdAt : null,
            patientId: typeof data.patientId === "string" ? data.patientId : null,
            patientLabId: typeof data.patientLabId === "string" ? data.patientLabId : null,
            patientName: typeof data.patientName === "string" ? data.patientName : null,
          };
        }),
    [ordersQuery.docs]
  );

  const registeredToday = useMemo(
    () =>
      buildTodaysRegistrations(patients, now, { onlyCreatedByUid: writer.uid }).filter((row) => {
        const patient = patientsById.get(row.id.replace(/^reg:/, ""));
        return patient ? matchesPatientSearch(patient, search) : true;
      }),
    [patients, now, writer.uid, patientsById, search]
  );

  const awaiting = useMemo(() => {
    const rows = buildAwaitingCollection(orders, patientsById, catalog, {
      onlyPatientIds: ownPatientIds,
    });
    if (!search.trim()) return rows;
    return rows.filter((row) => {
      const hay = `${row.labId} ${row.title} ${row.detail}`.toLowerCase();
      return hay.includes(search.trim().toLowerCase());
    });
  }, [orders, patientsById, catalog, ownPatientIds, search]);

  const visibleRegistered = visibleReceptionList(registeredToday, showAllRegistered);
  const visibleAwaiting = visibleReceptionList(awaiting, showAllAwaiting);
  const loading = patientsQuery.loading || ordersQuery.loading || catalogQuery.loading;

  return (
    <main className="min-h-screen bg-lf-ground">
      <AppNav />
      <div className="lf-shell flex flex-col gap-6 py-8">
        <a
          href="#register-form"
          className="lf-touch flex min-h-[5.5rem] w-full items-center justify-center rounded-lf-md bg-lf-accent px-4 text-center text-[19px] font-semibold text-lf-on-accent"
        >
          Register a new patient
        </a>

        <label className="flex flex-col gap-2">
          <span className="text-[11.5px] text-lf-ink-2">Search patients</span>
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Lab ID or name"
            className="lf-touch w-full rounded-lf-md border border-lf-line bg-lf-surface px-3 text-sm text-lf-ink"
          />
        </label>

        <section className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-lf-ink">Today&apos;s registrations</h2>
          {loading && <p className="text-sm text-lf-ink-2">Loading…</p>}
          {!loading && registeredToday.length === 0 && (
            <p className="text-sm text-lf-ink-2">No patients registered by you today.</p>
          )}
          <div className="flex flex-col gap-3 overflow-x-auto">
            {visibleRegistered.map((row) => {
              const operational = operationalForReceptionRow(row);
              return (
                <OperationalRow
                  key={row.id}
                  state={operational.state}
                  label={operational.label}
                  className="min-w-[20rem] p-3"
                >
                  <div className="flex flex-col gap-2 min-[640px]:flex-row min-[640px]:items-center">
                    <span className="lf-num min-w-0 truncate text-sm text-lf-ink">{row.labId}</span>
                    <span className="min-w-0 truncate text-sm font-medium text-lf-ink">
                      {row.title}
                      <NotYetSynced show={row.notYetSynced} />
                    </span>
                    <Link
                      href={row.href}
                      className="lf-touch inline-flex items-center justify-center rounded-lf-md bg-lf-accent px-3 text-sm font-medium text-lf-on-accent"
                    >
                      Open list
                    </Link>
                  </div>
                </OperationalRow>
              );
            })}
          </div>
          {registeredToday.length > visibleRegistered.length && (
            <button
              type="button"
              onClick={() => setShowAllRegistered(true)}
              className="lf-touch inline-flex items-center self-start text-sm font-medium text-lf-accent"
            >
              Show all
            </button>
          )}
        </section>

        <section className="flex flex-col gap-3">
          <h2 className="text-[15px] font-semibold text-lf-ink">Awaiting collection</h2>
          {!loading && awaiting.length === 0 && (
            <p className="text-sm text-lf-ink-2">No open orders waiting for a sample.</p>
          )}
          <div className="flex flex-col gap-3 overflow-x-auto">
            {visibleAwaiting.map((row) => {
              const operational = operationalForReceptionRow(row);
              return (
                <OperationalRow
                  key={row.id}
                  state={operational.state}
                  label={operational.label}
                  className="min-w-[20rem] p-3"
                >
                  <div className="flex flex-col gap-2 min-[640px]:flex-row min-[640px]:items-center">
                    <span className="lf-num min-w-0 truncate text-sm text-lf-ink">{row.labId}</span>
                    <span className="min-w-0 truncate text-sm font-medium text-lf-ink">
                      {row.title}
                      <NotYetSynced show={row.notYetSynced} />
                    </span>
                    <span className="min-w-0 truncate text-sm text-lf-ink">{row.detail}</span>
                    <Link
                      href={row.href}
                      className="lf-touch inline-flex items-center justify-center rounded-lf-md bg-lf-accent px-3 text-sm font-medium text-lf-on-accent"
                    >
                      Open list
                    </Link>
                  </div>
                </OperationalRow>
              );
            })}
          </div>
          {awaiting.length > visibleAwaiting.length && (
            <button
              type="button"
              onClick={() => setShowAllAwaiting(true)}
              className="lf-touch inline-flex items-center self-start text-sm font-medium text-lf-accent"
            >
              Show all
            </button>
          )}
        </section>

        <section id="register-form" className="flex flex-col gap-3 scroll-mt-4">
          <h2 className="text-[15px] font-semibold text-lf-ink">New patient</h2>
          {children}
        </section>
      </div>
    </main>
  );
}
