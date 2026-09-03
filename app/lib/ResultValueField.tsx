"use client";

import { displayRange, normalizeParameter, type TestParameter } from "./resultModel";
import { parameterFlag, parameterHlSuppressionReason } from "./resultFlag";
import ResultFlagMark from "./ResultFlagMark";

export default function ResultValueField({
  parameter,
  value,
  sex,
  dob,
  ageYears,
  disabled,
  onChange,
}: {
  parameter: TestParameter;
  value: string;
  sex?: string | null;
  dob?: string | null;
  ageYears?: number | null;
  disabled?: boolean;
  onChange: (value: string) => void;
}) {
  const normalized = normalizeParameter(parameter);
  const flagCtx = { sex, dob, ageYears };
  const flag = parameterFlag(value, normalized, flagCtx);
  const hlReason = parameterHlSuppressionReason(value, normalized, flagCtx);
  const range = displayRange(normalized);
  const unit =
    normalized.resultType === "numeric" && normalized.unit && normalized.unit !== "—"
      ? normalized.unit
      : "";

  return (
    <div className="grid grid-cols-3 gap-2 items-center">
      <div>
        <p className="text-sm text-gray-900">{normalized.name}</p>
        <p className="text-xs text-gray-400">
          {range}
          {unit ? ` (${unit})` : ""}
        </p>
        {hlReason ? <p className="text-xs text-gray-500 mt-0.5">{hlReason}</p> : null}
      </div>
      <div className="col-span-2 flex items-center gap-2">
        {normalized.resultType === "qualitative" || normalized.resultType === "semi_quantitative" ? (
          <select
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className="border border-gray-300 rounded px-2 py-1 text-sm flex-1 disabled:bg-gray-50 disabled:text-gray-500"
          >
            <option value="">Select</option>
            {(normalized.valueSet || []).map((item) => (
              <option key={item.value} value={item.value}>
                {item.value}
              </option>
            ))}
          </select>
        ) : normalized.resultType === "text" ? (
          <textarea
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            rows={2}
            placeholder="Description"
            className="border border-gray-300 rounded px-2 py-1 text-sm flex-1 disabled:bg-gray-50 disabled:text-gray-500"
          />
        ) : (
          <input
            type="text"
            inputMode="decimal"
            value={value}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            placeholder={unit || "Result"}
            className="border border-gray-300 rounded px-2 py-1 text-sm flex-1 disabled:bg-gray-50 disabled:text-gray-500"
          />
        )}
        <ResultFlagMark flag={flag} />
      </div>
    </div>
  );
}
