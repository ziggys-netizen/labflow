import { describe, expect, it } from "vitest";
import {
  DEPLOYMENT_HOSTING,
  FIRESTORE_NAM7_ASSESSMENT,
  KNOWN_TRANSFER_DESTINATIONS,
  RECEIVING_COUNTRY_LAW_PENDING,
  TRANSFER_ASSESSMENTS,
  receivingCountryLawIsPending,
  transferAssessmentById,
  transferAssessmentExportRows,
} from "./transferAssessments";

describe("FIRESTORE_NAM7_ASSESSMENT", () => {
  it("stores the counsel slot as PENDING LEGAL REVIEW and does not draft a conclusion", () => {
    expect(FIRESTORE_NAM7_ASSESSMENT.receivingCountryLawAssessment).toBe(
      RECEIVING_COUNTRY_LAW_PENDING
    );
    expect(FIRESTORE_NAM7_ASSESSMENT.receivingCountryLawAssessment).toBe("PENDING LEGAL REVIEW");
    expect(receivingCountryLawIsPending(FIRESTORE_NAM7_ASSESSMENT)).toBe(true);
    expect(FIRESTORE_NAM7_ASSESSMENT.reviewer).toBeNull();
    expect(FIRESTORE_NAM7_ASSESSMENT.legalGateway).toBe("pending");
  });

  it("records the s.37(1)(a) limb and the nam7 facts from the 23 August 2026 brief", () => {
    expect(FIRESTORE_NAM7_ASSESSMENT.legalBasisLimb).toBe("s.37(1)(a)");
    expect(FIRESTORE_NAM7_ASSESSMENT.destination.region).toBe("nam7");
    expect(FIRESTORE_NAM7_ASSESSMENT.destination.country).toBe("United States");
    expect(FIRESTORE_NAM7_ASSESSMENT.firebaseProject).toBe("labflow-6cb9e");
    expect(DEPLOYMENT_HOSTING.vercelFunctionRegion).toBe("fra1");
    expect(FIRESTORE_NAM7_ASSESSMENT.reviewDueAt).toBe("2027-08-23");
    expect(FIRESTORE_NAM7_ASSESSMENT.reviewDueRule).toBe(
      "annual, or on any change of sub-processor or region"
    );
    expect(FIRESTORE_NAM7_ASSESSMENT.counselEngagementTripwireAt).toBe("2026-11-21");
    expect(FIRESTORE_NAM7_ASSESSMENT.hardGate).toBe("No real patient data until counsel answers");
  });

  it("does not treat scheduled backups as part of the legal conclusion", () => {
    expect(FIRESTORE_NAM7_ASSESSMENT.scheduledBackups).toBe("disabled");
    expect(FIRESTORE_NAM7_ASSESSMENT.scheduledBackupsFinding.toLowerCase()).toContain("separate");
  });

  it("does not hardcode that The Gambia or the United States is adequate", () => {
    const blob = JSON.stringify(TRANSFER_ASSESSMENTS).toLowerCase();
    expect(blob).not.toMatch(/gambia is adequate/);
    expect(blob).not.toMatch(/united states is adequate/);
    expect(blob).not.toMatch(/satisfies s\.37/);
  });
});

describe("TRANSFER_ASSESSMENTS register", () => {
  it("seeds only the Firestore destination; Vercel and Resend stay unassessed", () => {
    expect(TRANSFER_ASSESSMENTS).toEqual([FIRESTORE_NAM7_ASSESSMENT]);
    expect(transferAssessmentById("firestore-nam7")).toBe(FIRESTORE_NAM7_ASSESSMENT);
    const vercel = KNOWN_TRANSFER_DESTINATIONS.find((row) => row.id === "vercel-fra1");
    const resend = KNOWN_TRANSFER_DESTINATIONS.find((row) => row.id === "resend");
    expect(vercel?.assessed).toBe(false);
    expect(resend?.assessed).toBe(false);
  });

  it("exports the pending marker so a dump cannot look answered", () => {
    const rows = transferAssessmentExportRows();
    expect(rows).toHaveLength(1);
    expect(rows[0]?.receivingCountryLawAssessment).toBe("PENDING LEGAL REVIEW");
    expect(rows[0]?.legalBasisLimb).toBe("s.37(1)(a)");
    expect(rows[0]?.destinationRegion).toBe("nam7");
  });
});
