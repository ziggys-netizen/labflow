"use client";

import {
  RETENTION_BASIS_LABEL,
  RETENTION_CLINIC_MUST_SET,
  RETENTION_CONTROLLER_PROCESSOR,
  RETENTION_ENFORCEMENT_LATER,
  RETENTION_NO_GAMBIAN_RULE,
  RETENTION_PERIOD_LABEL,
} from "./clinicRetention";

export default function RetentionPolicyFields({
  period,
  basis,
  onPeriodChange,
  onBasisChange,
  disabled = false,
}: {
  period: string;
  basis: string;
  onPeriodChange: (value: string) => void;
  onBasisChange: (value: string) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-3">
      <p className="text-sm text-gray-700">{RETENTION_NO_GAMBIAN_RULE}</p>
      <p className="text-sm text-gray-700">{RETENTION_CLINIC_MUST_SET}</p>
      <p className="text-sm text-gray-700">{RETENTION_CONTROLLER_PROCESSOR}</p>
      <p className="text-sm text-gray-600">{RETENTION_ENFORCEMENT_LATER}</p>
      <label className="block">
        <span className="text-sm text-gray-600">{RETENTION_PERIOD_LABEL} (required)</span>
        <input
          type="text"
          value={period}
          onChange={(e) => onPeriodChange(e.target.value)}
          disabled={disabled}
          required
          autoComplete="off"
          className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
        />
      </label>
      <label className="block">
        <span className="text-sm text-gray-600">{RETENTION_BASIS_LABEL} (required)</span>
        <textarea
          value={basis}
          onChange={(e) => onBasisChange(e.target.value)}
          disabled={disabled}
          required
          rows={3}
          className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
        />
      </label>
    </div>
  );
}
