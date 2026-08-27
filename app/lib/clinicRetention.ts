/**
 * Clinic record retention — capture, require, honest copy.
 *
 * LabFlow ships no default period. The clinic (controller) must set a period
 * and a basis at setup. LabFlow (processor) records that choice. It does not
 * choose a number, including MRCG research windows (1 / 2 / 5 years).
 *
 * Deletion or purge of records older than the clinic's period is not
 * implemented. `RETENTION_PURGE_ENFORCEMENT` documents that enforcement is later.
 */

export const PRODUCT_RETENTION_PERIOD_DEFAULT = null;
export const PRODUCT_RETENTION_BASIS_DEFAULT = null;

/** Purge/deletion after the recorded period is not built. Enforcement is later. */
export const RETENTION_PURGE_ENFORCEMENT = "later" as const;

export const RETENTION_NOT_SET_LABEL = "Not set";

export const RETENTION_NO_GAMBIAN_RULE =
  "No Gambian rule prescribes a retention period for clinical laboratory records. LabFlow does not set one.";

export const RETENTION_CLINIC_MUST_SET =
  "This clinic must set its own period and state the basis for that choice.";

export const RETENTION_CONTROLLER_PROCESSOR =
  "The clinic is the data controller. LabFlow is a processor. LabFlow records the clinic's choice and basis; it does not choose a number.";

export const RETENTION_ENFORCEMENT_LATER =
  "Recording this policy is required now. Automatic deletion or purge after the period is not built yet.";

export const RETENTION_SETUP_INCOMPLETE =
  "Setup incomplete. Retention is not set. The clinic must choose a period and basis. LabFlow will not fill a number.";

export const RETENTION_PERIOD_REQUIRED = "Enter the clinic's retention period.";
export const RETENTION_BASIS_REQUIRED = "Enter the clinic's basis for that period.";

export const RETENTION_PERIOD_LABEL = "Retention period";
export const RETENTION_BASIS_LABEL = "Basis for this period";

export type ClinicRetentionFields = {
  retentionPeriod: string;
  retentionBasis: string;
};

export function parseRetentionFromData(data: Record<string, unknown>): ClinicRetentionFields {
  return {
    retentionPeriod: typeof data.retentionPeriod === "string" ? data.retentionPeriod.trim() : "",
    retentionBasis: typeof data.retentionBasis === "string" ? data.retentionBasis.trim() : "",
  };
}

export function clinicRetentionIsRecorded(input: {
  retentionPeriod?: string | null;
  retentionBasis?: string | null;
}): boolean {
  return Boolean(input.retentionPeriod?.trim() && input.retentionBasis?.trim());
}

/** Setup is complete only once the clinic has recorded both fields. No silent default. */
export function clinicSetupComplete(clinic: {
  retentionPeriod?: string | null;
  retentionBasis?: string | null;
}): boolean {
  return clinicRetentionIsRecorded(clinic);
}

export function retentionDisplay(value: string | null | undefined): string {
  const trimmed = typeof value === "string" ? value.trim() : "";
  return trimmed || RETENTION_NOT_SET_LABEL;
}

export function clinicRetentionValidationError(
  period: string,
  basis: string
): string | null {
  if (!period.trim()) return RETENTION_PERIOD_REQUIRED;
  if (!basis.trim()) return RETENTION_BASIS_REQUIRED;
  return null;
}

export function clinicRetentionWriteFields(
  period: string,
  basis: string
): ClinicRetentionFields {
  const error = clinicRetentionValidationError(period, basis);
  if (error) throw new Error(error);
  return {
    retentionPeriod: period.trim(),
    retentionBasis: basis.trim(),
  };
}
