"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import NotYetSynced from "../lib/NotYetSynced";
import { OperationalChip } from "../lib/OperationalRow";
import { operationalStripeClass, type OperationalFlagInput } from "../lib/operationalFlag";
import { patientRecordHref } from "../lib/patientList";

export type PatientListRowMode = "patients" | "queue";

export type PatientListRowData = {
  id: string;
  labId: string;
  displayName: string;
  sexAge: string;
  chip: OperationalFlagInput | null;
  notYetSynced?: boolean;
  /** E1 patients list */
  activity?: string;
  /** G1 queue list */
  testLabel?: string;
  timeInState?: string;
};

function stripeClass(chip: OperationalFlagInput | null | undefined) {
  if (!chip) return "";
  return operationalStripeClass(chip.state);
}

export function PatientListTableHeader({ mode }: { mode: PatientListRowMode }) {
  return (
    <thead>
      <tr className="border-b border-lf-line">
        <th className="py-2 pr-3 font-medium text-lf-ink-2">Lab ID</th>
        <th className="py-2 pr-3 font-medium text-lf-ink-2">{mode === "queue" ? "Patient" : "Name"}</th>
        <th className="whitespace-nowrap py-2 pr-3 font-medium text-lf-ink-2">Sex · Age</th>
        {mode === "queue" ? (
          <>
            <th className="py-2 pr-3 font-medium text-lf-ink-2">Test</th>
            <th className="whitespace-nowrap py-2 pr-3 font-medium text-lf-ink-2">Time in this state</th>
          </>
        ) : (
          <th className="py-2 pr-3 font-medium text-lf-ink-2">Last activity</th>
        )}
        <th className="py-2 pr-3 font-medium text-lf-ink-2">State</th>
        <th
          className="sticky right-0 whitespace-nowrap bg-lf-surface py-2 pl-3 font-medium text-lf-ink-2"
          style={{ position: "sticky", right: 0, background: "var(--lf-surface)" }}
        >
          Action
        </th>
      </tr>
    </thead>
  );
}

export function PatientListMobileCard({
  mode,
  row,
  primary,
  extras,
}: {
  mode: PatientListRowMode;
  row: PatientListRowData;
  primary: ReactNode;
  extras?: ReactNode;
}) {
  return (
    <li
      className={`flex flex-col gap-3 rounded-lf-md border border-lf-line bg-lf-surface p-4 ${stripeClass(row.chip)}`}
    >
      <Link href={patientRecordHref(row.id)} className="flex min-w-0 flex-col gap-2">
        <span className="lf-num block truncate text-sm text-lf-ink-2" title={row.labId}>
          {row.labId}
        </span>
        <span className="inline-flex min-w-0 items-center gap-2 font-medium text-lf-ink">
          <span className="truncate">{row.displayName}</span>
          <NotYetSynced show={Boolean(row.notYetSynced)} />
        </span>
        <span className="text-sm text-lf-ink-2">{row.sexAge}</span>
        {mode === "queue" ? (
          <>
            <span className="text-sm text-lf-ink-2">{row.testLabel || "—"}</span>
            <span className="lf-num text-sm text-lf-ink-2">{row.timeInState || "—"}</span>
          </>
        ) : (
          <span className="text-sm text-lf-ink-2">{row.activity || "—"}</span>
        )}
        {row.chip ? (
          <OperationalChip
            state={row.chip.state}
            label={row.chip.label}
            elapsedMinutes={row.chip.elapsedMinutes}
          />
        ) : null}
      </Link>
      <div className="flex flex-col gap-2">
        {primary}
        {extras}
      </div>
    </li>
  );
}

export function PatientListTableRow({
  mode,
  row,
  primary,
  extras,
  onActivate,
}: {
  mode: PatientListRowMode;
  row: PatientListRowData;
  primary: ReactNode;
  extras?: ReactNode;
  onActivate: () => void;
}) {
  return (
    <tr
      className={`cursor-pointer border-b border-lf-line hover:bg-lf-surface-2 ${stripeClass(row.chip)}`}
      onClick={onActivate}
    >
      <td className="py-2 pr-3 align-middle">
        <span className="lf-num block truncate text-lf-ink" title={row.labId}>
          {row.labId}
        </span>
      </td>
      <td className="py-2 pr-3 align-middle">
        <span className="inline-flex min-w-0 items-center gap-2 text-lf-ink">
          <span className="truncate">{row.displayName}</span>
          <NotYetSynced show={Boolean(row.notYetSynced)} />
        </span>
      </td>
      <td className="whitespace-nowrap py-2 pr-3 align-middle text-lf-ink-2">{row.sexAge}</td>
      {mode === "queue" ? (
        <>
          <td className="py-2 pr-3 align-middle text-lf-ink-2">{row.testLabel || "—"}</td>
          <td className="lf-num whitespace-nowrap py-2 pr-3 align-middle text-lf-ink-2">
            {row.timeInState || "—"}
          </td>
        </>
      ) : (
        <td className="py-2 pr-3 align-middle text-lf-ink-2">{row.activity || "—"}</td>
      )}
      <td className="py-2 pr-3 align-middle">
        {row.chip ? (
          <OperationalChip
            state={row.chip.state}
            label={row.chip.label}
            elapsedMinutes={row.chip.elapsedMinutes}
          />
        ) : null}
      </td>
      <td
        className="sticky right-0 whitespace-nowrap bg-lf-surface py-2 pl-3 align-middle"
        style={{ position: "sticky", right: 0, background: "var(--lf-surface)" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-end gap-2">
          {primary}
          {extras}
        </div>
      </td>
    </tr>
  );
}
