/**
 * Deployment-level transfer assessments (PRD v0.5 §12.6–12.7;
 * DATA-PROTECTION-GAPS item 4).
 *
 * W2 — the work item that was to name the Firestore collection path and
 * schema — is not in this repository. This module is the product record
 * until that path exists. Do not write these documents to live Firestore
 * from the client.
 *
 * The receiving-country-law field is a counsel slot. A generated legal
 * conclusion stored as though it were one is worse than empty.
 */

export const RECEIVING_COUNTRY_LAW_PENDING = "PENDING LEGAL REVIEW";

export const LEGAL_BASIS_LIMBS = ["s.37(1)(a)", "s.37(1)(b)"] as const;
export type LegalBasisLimb = (typeof LEGAL_BASIS_LIMBS)[number];

/** Gaps item 4 gateways. `pending` is required so the product does not pick one. */
export const LEGAL_GATEWAYS = ["adequacy", "scc", "other", "pending"] as const;
export type LegalGateway = (typeof LEGAL_GATEWAYS)[number];

export const TRANSFER_ASSESSMENT_SCOPES = ["deployment"] as const;
export type TransferAssessmentScope = (typeof TRANSFER_ASSESSMENT_SCOPES)[number];

export type TransferDestination = {
  vendor: string;
  product: string;
  region: string;
  regionDescription: string;
  country: string;
};

export type TransferAssessment = {
  id: string;
  scope: TransferAssessmentScope;
  destination: TransferDestination;
  controller: string;
  processor: string;
  subProcessors: string[];
  dataCategories: string[];
  specialCategoryNote: string;
  purpose: string;
  duration: string;
  legalGateway: LegalGateway;
  legalBasisLimb: LegalBasisLimb;
  receivingCountryLawAssessment: string;
  assessedAt: string;
  recordedBy: string;
  reviewer: string | null;
  reviewDueAt: string;
  reviewDueRule: string;
  counselEngagementTripwireAt: string;
  hardGate: string;
  decision: string;
  firebaseProject: string;
  firebaseProjectCreated: string;
  dataAtPresent: string;
  encryptionAtRest: string;
  scheduledBackups: "disabled" | "enabled";
  scheduledBackupsFinding: string;
  materialReliedOn: string[];
  sourceBrief: string;
};

/**
 * Hosting facts for this Firebase project. Not a legal conclusion.
 * Vercel `fra1` and Resend are listed so they are not forgotten; they
 * are not assessed by the 23 August 2026 Firestore brief.
 */
export const DEPLOYMENT_HOSTING = {
  firebaseProject: "labflow-6cb9e",
  firebaseProjectCreated: "2026-08-08",
  firestoreLocation: "nam7",
  firestoreLocationDescription: "Iowa, Northern Virginia, Oklahoma (United States multi-region)",
  vercelFunctionRegion: "fra1",
  vercelFunctionRegionDescription: "Frankfurt, Germany (EU)",
  scheduledBackups: "disabled" as const,
} as const;

export const KNOWN_TRANSFER_DESTINATIONS = [
  {
    id: "firestore-nam7",
    vendor: "Google LLC",
    product: "Cloud Firestore",
    region: DEPLOYMENT_HOSTING.firestoreLocation,
    regionDescription: DEPLOYMENT_HOSTING.firestoreLocationDescription,
    country: "United States",
    assessed: true,
  },
  {
    id: "vercel-fra1",
    vendor: "Vercel Inc.",
    product: "Application hosting and server routes",
    region: DEPLOYMENT_HOSTING.vercelFunctionRegion,
    regionDescription: DEPLOYMENT_HOSTING.vercelFunctionRegionDescription,
    country: "Germany",
    assessed: false,
  },
  {
    id: "resend",
    vendor: "Resend",
    product: "Transactional email (not yet configured)",
    region: "not configured",
    regionDescription: "Not configured — no sending region recorded",
    country: "not configured",
    assessed: false,
  },
] as const;

export const FIRESTORE_NAM7_ASSESSMENT: TransferAssessment = {
  id: "firestore-nam7",
  scope: "deployment",
  destination: {
    vendor: "Google LLC",
    product: "Cloud Firestore",
    region: "nam7",
    regionDescription: "Iowa, Northern Virginia, Oklahoma (United States multi-region)",
    country: "United States",
  },
  controller: "Each clinic, in respect of its own patients",
  processor: "LabFlow (Isaac Kanu), operating the platform",
  subProcessors: [
    "Google LLC (Firestore, Firebase Authentication)",
    "Vercel Inc. (application hosting and server routes)",
    "Resend (transactional email, not yet configured)",
  ],
  dataCategories: ["Patient identifiers", "Health data"],
  specialCategoryNote: "Health is a special category under s.2",
  purpose: "Store and operate the laboratory information system for the clinic that is the controller",
  duration: "For the life of the clinic's use of the platform, or until the data are migrated or erased",
  legalGateway: "pending",
  legalBasisLimb: "s.37(1)(a)",
  receivingCountryLawAssessment: RECEIVING_COUNTRY_LAW_PENDING,
  assessedAt: "2026-08-23",
  recordedBy: "LabFlow (Isaac Kanu) — facts only; not a legal assessment",
  reviewer: null,
  reviewDueAt: "2027-08-23",
  reviewDueRule: "annual, or on any change of sub-processor or region",
  counselEngagementTripwireAt: "2026-11-21",
  hardGate: "No real patient data until counsel answers",
  decision:
    "23 August 2026: remain on the existing Firebase project in nam7 and seek legal advice on the transfer question, rather than pre-emptively rebuilding in a European region.",
  firebaseProject: DEPLOYMENT_HOSTING.firebaseProject,
  firebaseProjectCreated: DEPLOYMENT_HOSTING.firebaseProjectCreated,
  dataAtPresent: "6 patients, 6 orders, 3 clinics, 5 users — all invented test data, no real person",
  encryptionAtRest: "Google-managed keys, enabled by default",
  scheduledBackups: "disabled",
  scheduledBackupsFinding:
    "Scheduled backups on this Firestore database are Disabled. Separate finding — not part of the transfer-law conclusion. SLIPTA §9 and ISO 15189:2022 clause 7.8 still require backup and continuity evidence.",
  materialReliedOn: [
    "Google LLC DPF certified (EU-US, Swiss-US, UK Extension)",
    "Cloud DPA incorporates EC SCCs",
    "ISO 27001/27017/27018, PCI DSS, SOC 2/3",
    "Encryption at rest and in transit",
  ],
  sourceBrief: "TRANSFER-ASSESSMENT-FIRESTORE-NAM7-2026-08-23.md",
};

export const TRANSFER_ASSESSMENTS: TransferAssessment[] = [FIRESTORE_NAM7_ASSESSMENT];

export function receivingCountryLawIsPending(assessment: TransferAssessment): boolean {
  return assessment.receivingCountryLawAssessment === RECEIVING_COUNTRY_LAW_PENDING;
}

export function transferAssessmentById(id: string): TransferAssessment | undefined {
  return TRANSFER_ASSESSMENTS.find((row) => row.id === id);
}

/** Flat rows a DPO export or DPIA dump can attach. */
export function transferAssessmentExportRows(
  assessments: readonly TransferAssessment[] = TRANSFER_ASSESSMENTS
): Record<string, string>[] {
  return assessments.map((row) => ({
    id: row.id,
    scope: row.scope,
    destinationVendor: row.destination.vendor,
    destinationProduct: row.destination.product,
    destinationRegion: row.destination.region,
    destinationCountry: row.destination.country,
    dataCategories: row.dataCategories.join("; "),
    purpose: row.purpose,
    duration: row.duration,
    legalGateway: row.legalGateway,
    legalBasisLimb: row.legalBasisLimb,
    receivingCountryLawAssessment: row.receivingCountryLawAssessment,
    assessedAt: row.assessedAt,
    reviewer: row.reviewer ?? "",
    reviewDueAt: row.reviewDueAt,
    reviewDueRule: row.reviewDueRule,
    sourceBrief: row.sourceBrief,
  }));
}
