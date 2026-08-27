"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AppNav from "./AppNav";
import { useAuth } from "./AuthContext";
import { actorFromAuth, safeLogAudit } from "./audit";
import { loadClinic } from "./clinics";
import { deriveShiftLabel, ISO_WEEKDAY_LABELS, ISO_WEEKDAYS, parseWallClock, type IsoWeekday, type RosterEntry, type RosterException, type RosterPattern } from "./roster";
import {
  createRosterEntry,
  createRosterException,
  deleteRosterEntry,
  deleteRosterException,
  loadClinicRoster,
  type RosterCache,
} from "./rosterStore";
import { loadStaffRows, type StaffRow } from "./staffOps";
import { roleDisplay } from "./permissions";
import { fromDateTimeLocal, toDateTimeLocal } from "./datetime";

const PATTERNS: { value: RosterPattern; label: string }[] = [
  { value: "weekly", label: "Every week" },
  { value: "fortnightly", label: "Fortnightly" },
  { value: "monthlyByWeek", label: "Selected weeks of the month" },
  { value: "fixedDates", label: "Fixed dates" },
];

function staffLabel(row: StaffRow) {
  return row.username || row.name || row.email || row.uid;
}

function timesForDay(entries: RosterEntry[], day: IsoWeekday) {
  return entries
    .filter((entry) => entry.daysOfWeek.includes(day))
    .map((entry) => `${entry.startTime}–${entry.endTime}`)
    .join(", ");
}

export default function RosterPanel({ clinicId }: { clinicId: string }) {
  const { user, role, shift } = useAuth();
  const [staff, setStaff] = useState<StaffRow[]>([]);
  const [cache, setCache] = useState<RosterCache | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [status, setStatus] = useState("");
  const [userUid, setUserUid] = useState("");
  const [days, setDays] = useState<IsoWeekday[]>([1, 3, 5]);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("14:00");
  const [pattern, setPattern] = useState<RosterPattern>("weekly");
  const [weeks, setWeeks] = useState<number[]>([1, 3]);
  const [weekParity, setWeekParity] = useState<"odd" | "even">("odd");
  const [dates, setDates] = useState("");
  const [effectiveFrom, setEffectiveFrom] = useState(() => new Date().toISOString().slice(0, 10));
  const [effectiveTo, setEffectiveTo] = useState("");
  const [exUser, setExUser] = useState("");
  const [exType, setExType] = useState<RosterException["type"]>("leave");
  const [exStart, setExStart] = useState("");
  const [exEnd, setExEnd] = useState("");
  const [exNote, setExNote] = useState("");

  async function reload() {
    const [clinic, staffResult, next] = await Promise.all([
      loadClinic(clinicId),
      loadStaffRows({ role, clinicId }),
      loadClinicRoster(clinicId),
    ]);
    setEnabled(clinic?.rosteringEnabled === true);
    setStaff(staffResult.rows.filter((row) => !row.isOwnerAccount));
    setCache({
      ...next,
      rosteringEnabled: clinic?.rosteringEnabled === true,
      rosterGraceMinutes: clinic?.rosterGraceMinutes ?? next.rosterGraceMinutes,
      breakGlassMinutes: clinic?.breakGlassMinutes ?? next.breakGlassMinutes,
    });
  }

  useEffect(() => {
    let cancelled = false;
    reload()
      .catch((err) => {
        console.error(err);
        if (!cancelled) setStatus("Could not load the roster.");
      });
    return () => {
      cancelled = true;
    };
  }, [clinicId, role]);

  const byUser = useMemo(() => {
    const map = new Map<string, RosterEntry[]>();
    for (const entry of cache?.entries ?? []) {
      const list = map.get(entry.userUid) ?? [];
      list.push(entry);
      map.set(entry.userUid, list);
    }
    return map;
  }, [cache]);

  const grace = cache?.rosterGraceMinutes ?? 30;

  async function addEntry(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!userUid) {
      setStatus("Choose a staff member.");
      return;
    }
    if (!parseWallClock(startTime) || !parseWallClock(endTime)) {
      setStatus("Start and end times must look like 09:00.");
      return;
    }
    if (days.length === 0 && pattern !== "fixedDates") {
      setStatus("Pick at least one day.");
      return;
    }
    setStatus("Saving...");
    try {
      const dateList = dates
        .split(/[\s,]+/)
        .map((item) => item.trim())
        .filter((item) => /^\d{4}-\d{2}-\d{2}$/.test(item));
      await createRosterEntry({
        clinicId,
        userUid,
        pattern,
        weeksOfMonth: pattern === "monthlyByWeek" ? weeks : [],
        weekParity: pattern === "fortnightly" ? weekParity : null,
        daysOfWeek: pattern === "fixedDates" ? [1, 2, 3, 4, 5, 6, 7] : days,
        startTime,
        endTime,
        graceMinutes: grace,
        dates: pattern === "fixedDates" ? dateList : [],
        effectiveFrom,
        effectiveTo: effectiveTo || null,
        createdByUid: user.uid,
      });
      const actor = actorFromAuth(user, role, shift);
      if (actor) {
        await safeLogAudit({
          clinicId,
          actor,
          action: "roster.entryCreate",
          targetCollection: "rosterEntries",
          targetId: userUid,
          targetLabel: staffLabel(staff.find((row) => row.uid === userUid) ?? { uid: userUid } as StaffRow),
          detail: { pattern, startTime, endTime, daysOfWeek: days },
        });
      }
      await reload();
      setStatus("Roster entry saved.");
    } catch (err) {
      console.error(err);
      setStatus("Could not save that entry.");
    }
  }

  async function removeEntry(entry: RosterEntry) {
    if (!user) return;
    try {
      await deleteRosterEntry(entry.id);
      const actor = actorFromAuth(user, role, shift);
      if (actor) {
        await safeLogAudit({
          clinicId,
          actor,
          action: "roster.entryDelete",
          targetCollection: "rosterEntries",
          targetId: entry.id,
          targetLabel: entry.userUid,
        });
      }
      await reload();
    } catch (err) {
      console.error(err);
      setStatus("Could not delete that entry.");
    }
  }

  async function addException(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const startsAt = fromDateTimeLocal(exStart);
    const endsAt = fromDateTimeLocal(exEnd);
    if (!exUser || !startsAt || !endsAt) {
      setStatus("Choose a person and a start and end.");
      return;
    }
    try {
      await createRosterException({
        clinicId,
        userUid: exUser,
        type: exType,
        startsAt,
        endsAt,
        reasonCode: exType,
        note: exNote.trim() || null,
        createdByUid: user.uid,
      });
      const actor = actorFromAuth(user, role, shift);
      if (actor) {
        await safeLogAudit({
          clinicId,
          actor,
          action: "roster.exceptionCreate",
          targetCollection: "rosterExceptions",
          targetId: exUser,
          targetLabel: staffLabel(staff.find((row) => row.uid === exUser) ?? { uid: exUser } as StaffRow),
          detail: { type: exType },
        });
      }
      setExNote("");
      await reload();
      setStatus("Exception saved.");
    } catch (err) {
      console.error(err);
      setStatus("Could not save that exception.");
    }
  }

  async function removeException(item: RosterException) {
    if (!user) return;
    try {
      await deleteRosterException(item.id);
      const actor = actorFromAuth(user, role, shift);
      if (actor) {
        await safeLogAudit({
          clinicId,
          actor,
          action: "roster.exceptionDelete",
          targetCollection: "rosterExceptions",
          targetId: item.id,
          targetLabel: item.userUid,
        });
      }
      await reload();
    } catch (err) {
      console.error(err);
      setStatus("Could not delete that exception.");
    }
  }

  function toggleDay(day: IsoWeekday) {
    setDays((prev) => (prev.includes(day) ? prev.filter((item) => item !== day) : [...prev, day].sort()));
  }

  function toggleWeek(week: number) {
    setWeeks((prev) => (prev.includes(week) ? prev.filter((item) => item !== week) : [...prev, week].sort()));
  }

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-5xl mx-auto px-6 py-16">
        <p className="text-sm text-gray-500 mb-2">
          <Link href={`/owner/clinics/${clinicId}`} className="underline text-gray-900">
            Clinic profile
          </Link>
          {" · "}
          <Link href={`/owner/clinics/${clinicId}/staff`} className="underline text-gray-900">
            Staff
          </Link>
        </p>
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Roster</h1>
        <p className="text-gray-600 mb-6">
          Access is granted during a staff member&apos;s window plus a {grace}-minute grace at both
          ends. Working outside that window is a recorded act, not a lockout. Rostering is{" "}
          {enabled ? "on" : "off"} for this clinic
          {enabled ? "" : " — turn it on from the clinic profile when the entries are ready"}.
        </p>
        {status && <p className="text-sm text-gray-700 mb-4">{status}</p>}

        <div className="overflow-x-auto border border-gray-200 rounded-lg mb-10">
          <table className="w-full text-sm text-left">
            <thead>
              <tr className="border-b border-gray-200 bg-gray-50">
                <th className="px-3 py-2 font-medium text-gray-700">Staff</th>
                {ISO_WEEKDAYS.map((day) => (
                  <th key={day} className="px-3 py-2 font-medium text-gray-700">
                    {ISO_WEEKDAY_LABELS[day].slice(0, 3)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {staff.map((row) => {
                const entries = byUser.get(row.uid) ?? [];
                return (
                  <tr key={row.uid} className="border-b border-gray-100 last:border-0">
                    <td className="px-3 py-2 text-gray-900">
                      <p>{staffLabel(row)}</p>
                      <p className="text-xs text-gray-500">
                        {roleDisplay(row.memberships.find((m) => m.clinicId === clinicId)?.role, null)}
                      </p>
                    </td>
                    {ISO_WEEKDAYS.map((day) => (
                      <td key={day} className="px-3 py-2 text-gray-600 whitespace-nowrap">
                        {timesForDay(entries, day) || "—"}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {staff.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-3 py-4 text-gray-600">
                    No staff assigned to this clinic yet.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <section className="border border-gray-200 rounded-lg p-4 mb-8">
          <h2 className="font-medium text-gray-900 mb-3">Add a roster entry</h2>
          <form onSubmit={(e) => void addEntry(e)} className="space-y-3">
            <label className="block text-sm text-gray-700">
              Staff member
              <select
                value={userUid}
                onChange={(e) => setUserUid(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="">Select…</option>
                {staff.map((row) => (
                  <option key={row.uid} value={row.uid}>
                    {staffLabel(row)}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-3 text-sm text-gray-700">
              {ISO_WEEKDAYS.map((day) => (
                <label key={day} className="inline-flex items-center gap-1">
                  <input
                    type="checkbox"
                    checked={days.includes(day)}
                    onChange={() => toggleDay(day)}
                  />
                  {ISO_WEEKDAY_LABELS[day].slice(0, 3)}
                </label>
              ))}
            </div>
            <div className="flex flex-wrap gap-3">
              <label className="text-sm text-gray-700">
                Start
                <input
                  type="time"
                  value={startTime}
                  onChange={(e) => setStartTime(e.target.value)}
                  className="mt-1 block rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>
              <label className="text-sm text-gray-700">
                End
                <input
                  type="time"
                  value={endTime}
                  onChange={(e) => setEndTime(e.target.value)}
                  className="mt-1 block rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>
              <p className="self-end text-xs text-gray-500 pb-2">
                Shift label: {deriveShiftLabel(startTime)}. Overnight if end is earlier than start.
              </p>
            </div>
            <label className="block text-sm text-gray-700">
              Recurrence
              <select
                value={pattern}
                onChange={(e) => setPattern(e.target.value as RosterPattern)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                {PATTERNS.map((item) => (
                  <option key={item.value} value={item.value}>
                    {item.label}
                  </option>
                ))}
              </select>
            </label>
            {pattern === "monthlyByWeek" && (
              <div className="flex flex-wrap gap-3 text-sm text-gray-700">
                {[1, 2, 3, 4, 5].map((week) => (
                  <label key={week} className="inline-flex items-center gap-1">
                    <input
                      type="checkbox"
                      checked={weeks.includes(week)}
                      onChange={() => toggleWeek(week)}
                    />
                    Week {week}
                  </label>
                ))}
              </div>
            )}
            {pattern === "fortnightly" && (
              <label className="block text-sm text-gray-700">
                Week of cycle
                <select
                  value={weekParity}
                  onChange={(e) => setWeekParity(e.target.value as "odd" | "even")}
                  className="mt-1 rounded-lg border border-gray-300 px-3 py-2"
                >
                  <option value="odd">First, third, fifth… from the start date</option>
                  <option value="even">Second, fourth… from the start date</option>
                </select>
              </label>
            )}
            {pattern === "fixedDates" && (
              <label className="block text-sm text-gray-700">
                Dates (YYYY-MM-DD, comma separated)
                <input
                  value={dates}
                  onChange={(e) => setDates(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 font-mono text-sm"
                />
              </label>
            )}
            <div className="flex flex-wrap gap-3">
              <label className="text-sm text-gray-700">
                Effective from
                <input
                  type="date"
                  value={effectiveFrom}
                  onChange={(e) => setEffectiveFrom(e.target.value)}
                  className="mt-1 block rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>
              <label className="text-sm text-gray-700">
                Effective to (optional)
                <input
                  type="date"
                  value={effectiveTo}
                  onChange={(e) => setEffectiveTo(e.target.value)}
                  className="mt-1 block rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>
            </div>
            <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white">
              Save entry
            </button>
          </form>
          <ul className="mt-4 space-y-2 text-sm text-gray-700">
            {(cache?.entries ?? []).map((entry) => (
              <li key={entry.id} className="flex justify-between gap-3 border-b border-gray-100 py-2">
                <span>
                  {staffLabel(staff.find((row) => row.uid === entry.userUid) ?? { uid: entry.userUid } as StaffRow)}{" "}
                  · {entry.startTime}–{entry.endTime} · {entry.pattern} ·{" "}
                  {entry.daysOfWeek.map((day) => ISO_WEEKDAY_LABELS[day].slice(0, 3)).join(", ")}
                </span>
                <button type="button" onClick={() => void removeEntry(entry)} className="underline text-gray-800">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>

        <section className="border border-gray-200 rounded-lg p-4">
          <h2 className="font-medium text-gray-900 mb-3">Leave, sick, swap, extra</h2>
          <form onSubmit={(e) => void addException(e)} className="space-y-3">
            <label className="block text-sm text-gray-700">
              Staff member
              <select
                value={exUser}
                onChange={(e) => setExUser(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="">Select…</option>
                {staff.map((row) => (
                  <option key={row.uid} value={row.uid}>
                    {staffLabel(row)}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm text-gray-700">
              Type
              <select
                value={exType}
                onChange={(e) => setExType(e.target.value as RosterException["type"])}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              >
                <option value="leave">Leave</option>
                <option value="sick">Sick</option>
                <option value="swap">Swap</option>
                <option value="extra">Extra (planned cover)</option>
              </select>
            </label>
            <div className="flex flex-wrap gap-3">
              <label className="text-sm text-gray-700">
                Starts
                <input
                  type="datetime-local"
                  value={exStart}
                  onChange={(e) => setExStart(e.target.value)}
                  className="mt-1 block rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>
              <label className="text-sm text-gray-700">
                Ends
                <input
                  type="datetime-local"
                  value={exEnd}
                  onChange={(e) => setExEnd(e.target.value)}
                  className="mt-1 block rounded-lg border border-gray-300 px-3 py-2"
                />
              </label>
            </div>
            <label className="block text-sm text-gray-700">
              Note
              <input
                value={exNote}
                onChange={(e) => setExNote(e.target.value)}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2"
              />
            </label>
            <button type="submit" className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white">
              Save exception
            </button>
          </form>
          <ul className="mt-4 space-y-2 text-sm text-gray-700">
            {(cache?.exceptions ?? []).map((item) => (
              <li key={item.id} className="flex justify-between gap-3 border-b border-gray-100 py-2">
                <span>
                  {staffLabel(staff.find((row) => row.uid === item.userUid) ?? { uid: item.userUid } as StaffRow)} ·{" "}
                  {item.type} · {toDateTimeLocal(item.startsAt)} → {toDateTimeLocal(item.endsAt)}
                </span>
                <button type="button" onClick={() => void removeException(item)} className="underline text-gray-800">
                  Remove
                </button>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
