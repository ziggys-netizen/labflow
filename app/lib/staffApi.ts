import { authedGet, authedPost } from "./authApi";
import { preApprovalsFromApiPayload, staffApiErrorMessage } from "./staffApiParse";
import type { PreApproval, PreApprovalInputRow } from "./preApprovals";

type ErrorBody = { error?: string };

async function readErrorBody(res: Response): Promise<string | undefined> {
  const data = (await res.json().catch(() => ({}))) as ErrorBody;
  return typeof data.error === "string" ? data.error : undefined;
}

export async function fetchPreApprovals(clinicId: string): Promise<PreApproval[]> {
  const res = await authedGet(
    `/api/staff/pre-approvals?clinicId=${encodeURIComponent(clinicId)}`
  );
  if (!res.ok) {
    throw new Error(
      staffApiErrorMessage(res.status, await readErrorBody(res), "Could not load pre-approvals.")
    );
  }
  const data = (await res.json().catch(() => ({}))) as { rows?: unknown };
  return preApprovalsFromApiPayload(data);
}

export async function createPreApproval(input: {
  clinicId: string;
  email: string;
  role: string;
  shift: string;
}): Promise<{ id: string; created: number }> {
  const res = await authedPost("/api/staff/pre-approvals", input);
  const data = (await res.json().catch(() => ({}))) as ErrorBody & { id?: string; created?: number };
  if (!res.ok) {
    throw new Error(staffApiErrorMessage(res.status, data.error, "Failed to save pre-approval."));
  }
  return { id: typeof data.id === "string" ? data.id : "", created: data.created ?? 1 };
}

export async function createPreApprovalBatch(input: {
  clinicId: string;
  rows: PreApprovalInputRow[];
}): Promise<{ created: number; errors: string[] }> {
  const res = await authedPost("/api/staff/pre-approvals", {
    clinicId: input.clinicId,
    rows: input.rows,
  });
  const data = (await res.json().catch(() => ({}))) as ErrorBody & {
    created?: number;
    errors?: string[];
  };
  if (!res.ok) {
    throw new Error(staffApiErrorMessage(res.status, data.error, "Import failed."));
  }
  return { created: data.created ?? 0, errors: Array.isArray(data.errors) ? data.errors : [] };
}

export async function revokePreApprovalRecord(input: { clinicId: string; id: string }): Promise<void> {
  const res = await authedPost("/api/staff/pre-approvals/revoke", input);
  if (!res.ok) {
    throw new Error(
      staffApiErrorMessage(res.status, await readErrorBody(res), "Failed to revoke pre-approval.")
    );
  }
}

export { preApprovalsFromApiPayload, staffApiErrorMessage };
