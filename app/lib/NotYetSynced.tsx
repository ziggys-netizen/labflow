"use client";

export default function NotYetSynced({ show }: { show?: boolean }) {
  if (!show) return null;
  return <span className="text-xs font-normal text-amber-800 whitespace-nowrap">Not yet synced</span>;
}
