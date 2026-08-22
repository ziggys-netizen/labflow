"use client";

import { justificationError, type ReasonCode } from "./reasonCodes";

export default function ReasonCodeField({
  list,
  code,
  note,
  onCode,
  onNote,
  label = "Reason",
}: {
  list: ReasonCode[];
  code: string;
  note: string;
  onCode: (code: string) => void;
  onNote: (note: string) => void;
  label?: string;
}) {
  const error = justificationError(list, code, note);
  return (
    <div className="space-y-2">
      <label className="block text-sm font-medium text-gray-700">
        {label}
        <select
          value={code}
          onChange={(e) => onCode(e.target.value)}
          className="mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        >
          <option value="">Choose a reason</option>
          {list.map((item) => (
            <option key={item.code} value={item.code}>
              {item.label}
            </option>
          ))}
        </select>
      </label>
      <label className="block text-sm text-gray-700">
        {code === "other" ? "Describe (required)" : "Note (optional)"}
        <textarea
          value={note}
          onChange={(e) => onNote(e.target.value)}
          rows={2}
          className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
        />
      </label>
      {code && error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
