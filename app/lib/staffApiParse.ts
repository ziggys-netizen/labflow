import { preApprovalFromData, type PreApproval } from "./preApprovals";

export function staffApiErrorMessage(
  status: number,
  bodyError?: string,
  fallback = "Request failed."
): string {
  if (status === 401) return bodyError || "Sign in required.";
  if (status === 503) {
    return (
      bodyError ||
      "Trusted server is not configured. Pre-approvals cannot be saved until the server is available. See docs/OIDC-SETUP.md."
    );
  }
  if (status === 403) return bodyError || "Not allowed to manage staff.";
  return bodyError || fallback;
}

export function preApprovalsFromApiPayload(payload: unknown): PreApproval[] {
  const record =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? (payload as Record<string, unknown>)
      : {};
  const rows = Array.isArray(record.rows) ? record.rows : [];
  return rows
    .map((row) => {
      if (!row || typeof row !== "object" || Array.isArray(row)) return null;
      const data = row as Record<string, unknown>;
      const id = typeof data.id === "string" ? data.id : "";
      if (!id) return null;
      return preApprovalFromData(id, data);
    })
    .filter((row): row is PreApproval => row !== null);
}
