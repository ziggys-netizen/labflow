"use client";

import type { ResultFlag } from "./resultFlag";

export default function ResultFlagMark({ flag }: { flag: ResultFlag }) {
  if (!flag) return null;
  return (
    <span
      className="text-xs font-semibold text-amber-700"
      title={flag === "H" ? "Above reference range" : "Below reference range"}
    >
      {flag}
    </span>
  );
}
