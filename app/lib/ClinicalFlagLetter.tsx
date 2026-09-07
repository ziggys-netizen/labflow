import type { ResultFlag } from "./resultFlag";
import { CLINICAL_FLAG_TITLES, clinicalFlagLetterClass } from "./clinicalFlag";

/**
 * Clinical flag — a single letter immediately after the result value.
 * Never a stripe, never a chip, never on the row edge.
 */
export default function ClinicalFlagLetter({ flag }: { flag: ResultFlag }) {
  if (!flag) return null;
  return (
    <span
      data-lf-role="clinical-letter"
      data-lf-flag={flag}
      className={clinicalFlagLetterClass(flag)}
      title={CLINICAL_FLAG_TITLES[flag]}
    >
      {flag}
    </span>
  );
}
