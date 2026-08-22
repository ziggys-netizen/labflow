import { SAMPLE_REJECTION_CODES, formatJustification } from "./reasonCodes";

export const NCE_RISK_LEVELS = ["low", "moderate", "high"] as const;

export type NceRiskLevel = (typeof NCE_RISK_LEVELS)[number];

export type NonconformingEvent = {
  clinicId: string;
  orderId: string;
  patientLabId: string;
  reasonCode: string;
  reasonNote: string;
  riskLevel: NceRiskLevel;
  ownerUid: string | null;
  dueAt: string | null;
  createdAt: string;
  createdByUid: string;
  status: "open";
};

export function nceFromRejection(input: {
  clinicId: string;
  orderId: string;
  patientLabId: string;
  reasonCode: string;
  reasonNote: string;
  actorUid: string;
  now?: string;
}): NonconformingEvent {
  const now = input.now || new Date().toISOString();
  const due = new Date(now);
  due.setDate(due.getDate() + 7);
  return {
    clinicId: input.clinicId,
    orderId: input.orderId,
    patientLabId: input.patientLabId,
    reasonCode: input.reasonCode,
    reasonNote: input.reasonNote,
    riskLevel: input.reasonCode === "mislabeled" || input.reasonCode === "unlabelled" ? "high" : "moderate",
    ownerUid: input.actorUid,
    dueAt: due.toISOString(),
    createdAt: now,
    createdByUid: input.actorUid,
    status: "open",
  };
}

export function rejectionSummary(code: string, note: string): string {
  return formatJustification(SAMPLE_REJECTION_CODES, code, note);
}
