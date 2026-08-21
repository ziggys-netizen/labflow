"use client";

import { useEffect, useMemo, useState } from "react";
import { addDoc, collection, doc, updateDoc } from "firebase/firestore";
import ProtectedRoute from "../../lib/ProtectedRoute";
import AppNav from "../../lib/AppNav";
import { useAuth } from "../../lib/AuthContext";
import { db } from "../../lib/firebase";
import { getClinicDocs, isOwner } from "../../lib/clinicScope";
import { actorLabel, makeActorStamp } from "../../lib/identity";
import { canRecordSpecimenMovement, canViewInventory } from "../../lib/permissions";
import { fromDateTimeLocal, toDateTimeLocal } from "../../lib/datetime";
import ActingClinicPrompt from "../../lib/ActingClinicPrompt";
import {
  LAB_DEPARTMENTS,
  SPECIMEN_CONDITIONS,
  SPECIMEN_CONTAINERS,
  SPECIMEN_STATUSES,
  SPECIMEN_STATUS_LABELS,
  SPECIMEN_TRANSPORT,
  SPECIMEN_TYPES,
  SpecimenMovement,
  formatDateTime,
  mapSpecimen,
} from "../../lib/inventory";

const inputClass = "w-full border border-gray-300 rounded-lg px-3 py-2 text-sm";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block text-sm font-medium text-gray-700 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-gray-400 mt-1">{hint}</span>}
    </label>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th className="py-2 pr-3 font-medium text-gray-600 whitespace-nowrap">{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td className="py-2 pr-3 text-gray-900 align-top">{children}</td>;
}

function SpecimensContent() {
  const { user, role, clinicId, writeClinicId, username } = useAuth();
  const owner = isOwner(role);
  const allowed = canViewInventory(role);
  const canRecord = canRecordSpecimenMovement(role);

  const [entries, setEntries] = useState<SpecimenMovement[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState("");
  const [saving, setSaving] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  const [direction, setDirection] = useState<"received" | "sent">("received");
  const [specimenType, setSpecimenType] = useState<string>(SPECIMEN_TYPES[0]);
  const [container, setContainer] = useState<string>(SPECIMEN_CONTAINERS[0]);
  const [quantity, setQuantity] = useState("1");
  const [orderReference, setOrderReference] = useState("");
  const [department, setDepartment] = useState<string>(LAB_DEPARTMENTS[1]);
  const [destination, setDestination] = useState("");
  const [condition, setCondition] = useState<string>(SPECIMEN_CONDITIONS[0]);
  const [transport, setTransport] = useState<string>(SPECIMEN_TRANSPORT[0]);
  const [occurredAt, setOccurredAt] = useState(() => toDateTimeLocal(null));
  const [note, setNote] = useState("");

  const [filterDirection, setFilterDirection] = useState("");
  const [filterFrom, setFilterFrom] = useState("");
  const [filterTo, setFilterTo] = useState("");

  useEffect(() => {
    if (!allowed) return;
    let cancelled = false;

    async function load() {
      try {
        const docs = await getClinicDocs("specimenMovements", role, clinicId, {
          sortBy: "occurredAt",
          direction: "desc",
        });
        if (!cancelled) setEntries(docs.map(mapSpecimen));
      } catch (err) {
        console.error(err);
        if (!cancelled) setStatus("Could not load the specimen register.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => {
      cancelled = true;
    };
  }, [allowed, role, clinicId, reloadToken]);

  const filtered = useMemo(() => {
    const from = filterFrom ? new Date(`${filterFrom}T00:00:00`).getTime() : null;
    const to = filterTo ? new Date(`${filterTo}T23:59:59`).getTime() : null;
    return entries.filter((entry) => {
      if (filterDirection && entry.direction !== filterDirection) return false;
      if (from || to) {
        const t = new Date(entry.occurredAt).getTime();
        if (Number.isNaN(t)) return false;
        if (from && t < from) return false;
        if (to && t > to) return false;
      }
      return true;
    });
  }, [entries, filterDirection, filterFrom, filterTo]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !canRecord) return;
    setStatus("");

    if (!writeClinicId) {
      setStatus(
        owner
          ? "Select a clinic from the menu above to create records."
          : "Your account is not linked to a clinic yet."
      );
      return;
    }
    const qty = Number(quantity);
    if (!Number.isFinite(qty) || qty <= 0) {
      setStatus("Enter a quantity greater than zero.");
      return;
    }
    const when = fromDateTimeLocal(occurredAt);
    if (!when) {
      setStatus("Enter a valid date and time.");
      return;
    }
    if (direction === "sent" && !destination.trim()) {
      setStatus("Record where the specimen was sent.");
      return;
    }

    setSaving(true);
    try {
      await addDoc(collection(db, "specimenMovements"), {
        clinicId: writeClinicId,
        direction,
        specimenType,
        container,
        quantity: qty,
        orderReference: orderReference.trim(),
        department,
        destination: destination.trim(),
        occurredAt: when,
        recordedAt: new Date().toISOString(),
        actor: makeActorStamp(user, username),
        condition,
        transport,
        status:
          condition === "Acceptable"
            ? direction === "received"
              ? "in_lab"
              : "in_transit"
            : "rejected",
        note: note.trim() || null,
      });
      setStatus(direction === "received" ? "Specimen receipt logged." : "Specimen despatch logged.");
      setOrderReference("");
      setNote("");
      setQuantity("1");
      setOccurredAt(toDateTimeLocal(null));
      setReloadToken((n) => n + 1);
    } catch (err) {
      console.error(err);
      setStatus("Failed to log the specimen movement.");
    } finally {
      setSaving(false);
    }
  }

  async function advanceStatus(entry: SpecimenMovement, next: string) {
    setStatus("");
    try {
      await updateDoc(doc(db, "specimenMovements", entry.id), { status: next });
      setReloadToken((n) => n + 1);
    } catch (err) {
      console.error(err);
      setStatus("Failed to update the status.");
    }
  }

  if (!allowed) return null;

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-5xl mx-auto px-6 py-16">
        <div className="flex flex-wrap items-start justify-between gap-3 mb-1">
          <h1 className="text-2xl font-semibold text-gray-900">Specimen register</h1>
          <a href="/inventory" className="text-sm text-gray-900 underline font-medium">
            Back to store
          </a>
        </div>
        <p className="text-gray-600 mb-6">
          Specimens received into the laboratory and specimens sent out to a referral laboratory,
          with the date and time of each. This is a custody log — it does not change the collection
          time recorded on an order.
        </p>

        {status && <p className="text-sm text-gray-600 mb-4">{status}</p>}
        {owner && !writeClinicId && canRecord && (
          <ActingClinicPrompt />
        )}

        {canRecord && (
          <form onSubmit={handleSubmit} className="border border-gray-200 rounded-lg p-4 mb-10 space-y-4">
            <div className="flex gap-2">
              {(["received", "sent"] as const).map((d) => (
                <button
                  key={d}
                  type="button"
                  onClick={() => setDirection(d)}
                  className={`rounded-lg px-4 py-2 text-sm font-medium transition ${
                    direction === d
                      ? "bg-gray-900 text-white"
                      : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  {d === "received" ? "Specimen received" : "Specimen sent out"}
                </button>
              ))}
            </div>

            <div className="grid sm:grid-cols-2 gap-4">
              <Field label="Specimen type">
                <select
                  value={specimenType}
                  onChange={(e) => setSpecimenType(e.target.value)}
                  className={inputClass}
                >
                  {SPECIMEN_TYPES.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Container">
                <select
                  value={container}
                  onChange={(e) => setContainer(e.target.value)}
                  className={inputClass}
                >
                  {SPECIMEN_CONTAINERS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Quantity" hint="Number of tubes or containers.">
                <input
                  type="number"
                  min={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field
                label="Order / Lab ID reference"
                hint="A reference only — do not enter patient names here."
              >
                <input
                  type="text"
                  value={orderReference}
                  onChange={(e) => setOrderReference(e.target.value)}
                  placeholder="e.g. LF-20260821-0042"
                  className={inputClass}
                />
              </Field>
              <Field label="Laboratory / department">
                <select
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                  className={inputClass}
                >
                  {LAB_DEPARTMENTS.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </select>
              </Field>
              <Field
                label={direction === "sent" ? "Sent to" : "Received from"}
                hint={direction === "sent" ? "Referral laboratory or recipient." : "Optional."}
              >
                <input
                  type="text"
                  value={destination}
                  onChange={(e) => setDestination(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Condition">
                <select
                  value={condition}
                  onChange={(e) => setCondition(e.target.value)}
                  className={inputClass}
                >
                  {SPECIMEN_CONDITIONS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Transport">
                <select
                  value={transport}
                  onChange={(e) => setTransport(e.target.value)}
                  className={inputClass}
                >
                  {SPECIMEN_TRANSPORT.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Date and time">
                <input
                  type="datetime-local"
                  value={occurredAt}
                  onChange={(e) => setOccurredAt(e.target.value)}
                  className={inputClass}
                />
              </Field>
              <Field label="Note">
                <input
                  type="text"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  className={inputClass}
                />
              </Field>
            </div>

            <button
              type="submit"
              disabled={saving}
              className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2 disabled:opacity-50"
            >
              {saving ? "Saving..." : "Log specimen movement"}
            </button>
          </form>
        )}

        <div className="flex flex-wrap items-end gap-3 mb-3">
          <h2 className="text-sm font-medium text-gray-900 mr-auto">
            Register ({filtered.length})
          </h2>
          <select
            value={filterDirection}
            onChange={(e) => setFilterDirection(e.target.value)}
            aria-label="Direction"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          >
            <option value="">Received and sent</option>
            <option value="received">Received only</option>
            <option value="sent">Sent only</option>
          </select>
          <input
            type="date"
            value={filterFrom}
            onChange={(e) => setFilterFrom(e.target.value)}
            aria-label="From date"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
          <input
            type="date"
            value={filterTo}
            onChange={(e) => setFilterTo(e.target.value)}
            aria-label="To date"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm"
          />
        </div>

        {loading && <p className="text-gray-600">Loading...</p>}

        {!loading && (
          <div className="border border-gray-200 rounded-lg p-4 overflow-x-auto">
            {filtered.length === 0 ? (
              <p className="text-sm text-gray-600">No specimen movements recorded.</p>
            ) : (
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-gray-200">
                    <Th>Direction</Th>
                    <Th>Specimen type</Th>
                    <Th>Container</Th>
                    <Th>Quantity</Th>
                    <Th>Order / Lab ID</Th>
                    <Th>Laboratory / department</Th>
                    <Th>From / to</Th>
                    <Th>Condition</Th>
                    <Th>Transport</Th>
                    <Th>Status</Th>
                    <Th>Recorded by</Th>
                    <Th>Date</Th>
                    <Th>Time</Th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((entry) => {
                    const when = formatDateTime(entry.occurredAt);
                    return (
                      <tr key={entry.id} className="border-b border-gray-100 last:border-0">
                        <Td>{entry.direction === "received" ? "Received" : "Sent"}</Td>
                        <Td>{entry.specimenType}</Td>
                        <Td>{entry.container || "—"}</Td>
                        <Td>{entry.quantity}</Td>
                        <Td>{entry.orderReference || "—"}</Td>
                        <Td>{entry.department || "—"}</Td>
                        <Td>{entry.destination || "—"}</Td>
                        <Td>{entry.condition}</Td>
                        <Td>{entry.transport || "—"}</Td>
                        <Td>
                          {canRecord ? (
                            <select
                              value={entry.status}
                              onChange={(e) => advanceStatus(entry, e.target.value)}
                              aria-label="Status"
                              className="border border-gray-300 rounded px-2 py-1 text-sm"
                            >
                              {SPECIMEN_STATUSES.map((s) => (
                                <option key={s} value={s}>
                                  {SPECIMEN_STATUS_LABELS[s]}
                                </option>
                              ))}
                            </select>
                          ) : (
                            SPECIMEN_STATUS_LABELS[entry.status] ?? entry.status
                          )}
                        </Td>
                        <Td>{actorLabel(entry.actor)}</Td>
                        <Td>{when.date}</Td>
                        <Td>{when.time}</Td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        )}
      </div>
    </main>
  );
}

export default function Specimens() {
  return (
    <ProtectedRoute require={canViewInventory}>
      <SpecimensContent />
    </ProtectedRoute>
  );
}
