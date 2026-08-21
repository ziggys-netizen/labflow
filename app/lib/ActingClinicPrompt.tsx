"use client";

/** Shown when the owner has not picked a session clinic and a write needs one. */
export default function ActingClinicPrompt({ action }: { action: string }) {
  return (
    <div className="border border-gray-200 rounded-lg p-4 mb-4">
      <p className="text-sm font-medium text-gray-900">Select a clinic first</p>
      <p className="text-sm text-gray-600 mt-1">
        Choose a clinic in the header to {action}. That choice is only for this session — the owner
        account is not assigned a clinic role.
      </p>
    </div>
  );
}
