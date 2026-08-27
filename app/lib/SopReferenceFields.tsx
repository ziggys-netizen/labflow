"use client";

import type { SopDraft } from "./sopReference";

export default function SopReferenceFields({
  value,
  onChange,
  required,
  existingFileName,
  onFileChange,
  disabled,
}: {
  value: SopDraft;
  onChange: (next: SopDraft) => void;
  required: boolean;
  existingFileName?: string | null;
  onFileChange: (file: File | null) => void;
  disabled?: boolean;
}) {
  function set<K extends keyof SopDraft>(key: K, next: string) {
    onChange({ ...value, [key]: next });
  }

  const mark = required ? (
    <span className="font-normal text-red-600">(required)</span>
  ) : (
    <span className="font-normal text-gray-500">(optional on existing tests)</span>
  );

  return (
    <div className="space-y-3">
      <p className="text-sm font-medium text-gray-800">
        SOP reference {mark}
      </p>
      <p className="text-xs text-gray-500">
        Document identifiers only — not the procedure text. Review date is required for SLIPTA
        periodic review.
      </p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-gray-600">
          Document ID
          <input
            type="text"
            value={value.documentId}
            onChange={(e) => set("documentId", e.target.value)}
            disabled={disabled}
            maxLength={40}
            placeholder="e.g. SOP-FBC-001"
            className="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
          />
        </label>
        <label className="block text-xs text-gray-600">
          Version
          <input
            type="text"
            value={value.version}
            onChange={(e) => set("version", e.target.value)}
            disabled={disabled}
            maxLength={20}
            placeholder="e.g. 3.1"
            className="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
          />
        </label>
      </div>
      <label className="block text-xs text-gray-600">
        Title
        <input
          type="text"
          value={value.title}
          onChange={(e) => set("title", e.target.value)}
          disabled={disabled}
          maxLength={80}
          placeholder="e.g. Full Blood Count"
          className="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
        />
      </label>
      <label className="block text-xs text-gray-600">
        Author
        <input
          type="text"
          value={value.author}
          onChange={(e) => set("author", e.target.value)}
          disabled={disabled}
          maxLength={60}
          placeholder="Who signed this version"
          className="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
        />
      </label>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-xs text-gray-600">
          Effective date
          <input
            type="date"
            value={value.effectiveDate}
            onChange={(e) => set("effectiveDate", e.target.value)}
            disabled={disabled}
            className="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
          />
        </label>
        <label className="block text-xs text-gray-600">
          Review date
          <input
            type="date"
            value={value.reviewDate}
            onChange={(e) => set("reviewDate", e.target.value)}
            disabled={disabled}
            className="mt-1 w-full border border-gray-300 rounded px-2 py-1 text-sm text-gray-900"
          />
        </label>
      </div>
      <label className="block text-xs text-gray-600">
        File <span className="font-normal text-gray-500">(optional PDF or Word)</span>
        <input
          type="file"
          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          disabled={disabled}
          onChange={(e) => onFileChange(e.target.files?.[0] ?? null)}
          className="mt-1 block w-full text-sm text-gray-700"
        />
        {existingFileName ? (
          <span className="mt-1 block text-xs text-gray-500">On file: {existingFileName}</span>
        ) : null}
      </label>
    </div>
  );
}
