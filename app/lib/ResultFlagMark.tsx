"use client";

import type { ResultFlag } from "./resultFlag";

const TITLES: Record<Exclude<ResultFlag, null>, string> = {
  H: "Above reference range",
  L: "Below reference range",
  A: "Abnormal",
  C: "Critical",
};

export default function ResultFlagMark({ flag }: { flag: ResultFlag }) {
  if (!flag) return null;
  return (
    <span
      className={`text-xs font-semibold ${flag === "C" ? "text-red-700" : "text-amber-700"}`}
      title={TITLES[flag]}
    >
      {flag}
    </span>
  );
}
