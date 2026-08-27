/**
 * Audit writes must never take down a clinical action. Callers schedule the
 * write and continue; a later rejection is a sync problem, not a rollback.
 */

export function scheduleSafeAudit(
  write: () => Promise<unknown>,
  onFailure: (err: unknown) => void | Promise<void>
): void {
  void write().then(undefined, (err: unknown) => {
    void onFailure(err);
  });
}

export function auditRejectionReason(err: unknown): string {
  const code =
    typeof err === "object" && err !== null && "code" in err
      ? String((err as { code: unknown }).code).replace(/^firestore\//, "")
      : "";
  if (code === "permission-denied") {
    return "The audit record was denied. The clinical action still stands.";
  }
  if (err instanceof Error && err.message) {
    return `${err.message} The clinical action still stands.`;
  }
  return "The audit record could not be saved. The clinical action still stands.";
}

export function auditFailureSummary(action: string): string {
  return `Audit record was not saved (${action})`;
}
