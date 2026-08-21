"use client";

/** Shown when the owner has not picked a session clinic and a write needs one. */
export default function ActingClinicPrompt() {
  return (
    <div className="border border-gray-200 rounded-lg p-4 mb-4">
      <p className="text-sm font-medium text-gray-900">No clinic selected</p>
      <p className="text-sm text-gray-600 mt-1">
        Select a clinic from the menu above to create records.
      </p>
    </div>
  );
}
