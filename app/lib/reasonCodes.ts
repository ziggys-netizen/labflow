/**
 * Controlled reason codes (PRD v0.4 §6.9).
 * Every mandatory justification is a required code from a short list.
 * Free text is optional except when the code is `other`.
 */

export interface ReasonCode {
  code: string;
  label: string;
}

export const SAMPLE_REJECTION_CODES: ReasonCode[] = [
  { code: "haemolysed", label: "Haemolysed" },
  { code: "clotted", label: "Clotted" },
  { code: "insufficient_volume", label: "Insufficient volume" },
  { code: "wrong_container", label: "Wrong container" },
  { code: "unlabelled", label: "Unlabelled" },
  { code: "mislabeled", label: "Mislabeled" },
  { code: "leaked_in_transit", label: "Leaked in transit" },
  { code: "delayed_beyond_stability", label: "Delayed beyond stability" },
  { code: "wrong_test_requested", label: "Wrong test requested" },
  { code: "other", label: "Other" },
];

export const ORDER_CANCEL_CODES: ReasonCode[] = [
  { code: "duplicate_order", label: "Duplicate order" },
  { code: "patient_left", label: "Patient left" },
  { code: "wrong_test_requested", label: "Wrong test requested" },
  { code: "clinician_withdrew", label: "Clinician withdrew the request" },
  { code: "other", label: "Other" },
];

export const SEND_BACK_CODES: ReasonCode[] = [
  { code: "transcription_error", label: "Transcription error" },
  { code: "incomplete_result", label: "Incomplete result" },
  { code: "implausible_value", label: "Implausible value" },
  { code: "wrong_patient", label: "Wrong patient" },
  { code: "other", label: "Other" },
];

export const AMENDMENT_CODES: ReasonCode[] = [
  { code: "transcription_error", label: "Transcription error" },
  { code: "wrong_value", label: "Wrong value entered" },
  { code: "wrong_patient", label: "Wrong patient" },
  { code: "instrument_correction", label: "Instrument / method correction" },
  { code: "other", label: "Other" },
];

export const SELF_RELEASE_CODES: ReasonCode[] = [
  { code: "sole_approver_on_duty", label: "Sole approver on duty" },
  { code: "urgent_clinical_need", label: "Urgent clinical need" },
  { code: "other", label: "Other" },
];

export const PATIENT_DELETE_CODES: ReasonCode[] = [
  { code: "duplicate", label: "Duplicate record" },
  { code: "registered_in_error", label: "Registered in error" },
  { code: "patient_request", label: "Patient request" },
  { code: "other", label: "Other" },
];

export const PATIENT_CORRECT_CODES: ReasonCode[] = [
  { code: "name_misspelled", label: "Name misspelled" },
  { code: "wrong_identifier", label: "Wrong identifier" },
  { code: "wrong_demographics", label: "Wrong demographics" },
  { code: "other", label: "Other" },
];

export const ERASURE_CODES: ReasonCode[] = [
  { code: "data_subject_request", label: "Verified data-subject request" },
  { code: "other", label: "Other" },
];

export const CRITICAL_NOTIFY_MEANS = [
  { code: "phone", label: "Phone" },
  { code: "in_person", label: "In person" },
  { code: "sms", label: "SMS" },
] as const;

export const BREAK_GLASS_CODES: ReasonCode[] = [
  { code: "covering_absent_colleague", label: "Covering absent colleague" },
  { code: "urgent_sample", label: "Urgent sample" },
  { code: "overrunning_shift", label: "Overrunning shift" },
  { code: "called_in", label: "Called in" },
  { code: "roster_incorrect", label: "Roster incorrect" },
  { code: "other", label: "Other" },
];

export const CRITICAL_NOTIFY_OUTCOMES = [
  { code: "read_back_ok", label: "Read-back obtained" },
  { code: "informed_no_readback", label: "Informed, no read-back" },
  { code: "no_answer", label: "No answer" },
  { code: "wrong_number", label: "Wrong number" },
  { code: "could_not_reach", label: "Could not reach" },
] as const;

export function isReasonCode(list: ReasonCode[], code: string | null | undefined): boolean {
  return !!code && list.some((item) => item.code === code);
}

export function reasonCodeLabel(list: ReasonCode[], code: string | null | undefined): string {
  return list.find((item) => item.code === code)?.label || code || "";
}

export function justificationReady(
  list: ReasonCode[],
  code: string | null | undefined,
  note: string | null | undefined
): boolean {
  if (!isReasonCode(list, code)) return false;
  if (code === "other") return (note || "").trim().length > 0;
  return true;
}

export function justificationError(
  list: ReasonCode[],
  code: string | null | undefined,
  note: string | null | undefined
): string | null {
  if (!isReasonCode(list, code)) return "Choose a reason.";
  if (code === "other" && !(note || "").trim()) return "Describe the reason when you choose Other.";
  return null;
}

export function formatJustification(
  list: ReasonCode[],
  code: string | null | undefined,
  note: string | null | undefined
): string {
  const label = reasonCodeLabel(list, code);
  const extra = (note || "").trim();
  if (!label) return extra;
  if (!extra) return label;
  return `${label} — ${extra}`;
}
