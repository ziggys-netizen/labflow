/**
 * A role is held *at a clinic*, not globally. `users/{uid}.clinicRoles` is a map
 * keyed by clinic ID, so one account can be a Lab Manager at one clinic and
 * nothing at all at another.
 *
 * Backward compatibility: every existing user document predates this map and
 * carries a single top-level `role` / `clinicId` / `status`. Those fields are
 * kept as a live mirror of the *active* membership, so code that has not been
 * migrated — including the owner console's "set clinic administrator" — keeps
 * reading and writing exactly what it did before.
 */

export interface ClinicMembership {
  clinicId: string;
  role: string;
  status: string;
  approvedByUid: string | null;
  approvedByUsername: string | null;
  approvedByEmail: string | null;
  approvedAt: string | null;
  createdAt: string | null;
}

export interface ResolvedIdentity {
  role: string | null;
  clinicId: string | null;
  status: string | null;
  username: string | null;
  name: string | null;
  email: string | null;
  memberships: ClinicMembership[];
}

export const EMPTY_IDENTITY: ResolvedIdentity = {
  role: null,
  clinicId: null,
  status: null,
  username: null,
  name: null,
  email: null,
  memberships: [],
};

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function toMembership(clinicId: string, value: unknown): ClinicMembership | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const role = str(record.role);
  if (!role) return null;
  return {
    clinicId,
    role,
    status: str(record.status) ?? "pending",
    approvedByUid: str(record.approvedByUid),
    approvedByUsername: str(record.approvedByUsername),
    approvedByEmail: str(record.approvedByEmail),
    approvedAt: str(record.approvedAt),
    createdAt: str(record.createdAt),
  };
}

/**
 * Collapses a user document into the shape the rest of the app consumes.
 *
 * The owner is deliberately handled first and never gains a clinic membership:
 * PRD 3.5 requires the owner to pass every check regardless of `clinicId` or
 * `status`, and the account has been lost twice by having a clinic role written
 * onto it. An acting clinic for writes lives in AuthContext session state only.
 */
export function resolveIdentity(data: Record<string, unknown> | undefined): ResolvedIdentity {
  if (!data) return EMPTY_IDENTITY;

  const username = str(data.username);
  const name = str(data.name);
  const email = str(data.email);
  const legacyRole = str(data.role);
  const legacyClinicId = str(data.clinicId);
  const legacyStatus = str(data.status);

  if (legacyRole === "owner") {
    return {
      role: "owner",
      clinicId: null,
      status: legacyStatus ?? "approved",
      username,
      name,
      email,
      memberships: [],
    };
  }

  const rawMap = data.clinicRoles;
  const memberships: ClinicMembership[] =
    rawMap && typeof rawMap === "object"
      ? Object.entries(rawMap as Record<string, unknown>)
          .map(([clinicId, value]) => toMembership(clinicId, value))
          .filter((m): m is ClinicMembership => m !== null)
      : [];

  // The top-level fields mirror the active membership, so if they disagree with
  // the map an un-migrated writer changed them and its intent should win.
  if (legacyClinicId && legacyRole) {
    const existing = memberships.findIndex((m) => m.clinicId === legacyClinicId);
    if (existing === -1) {
      memberships.push({
        clinicId: legacyClinicId,
        role: legacyRole,
        status: legacyStatus ?? "approved",
        approvedByUid: str(data.approvedByUid),
        approvedByUsername: str(data.approvedByUsername),
        approvedByEmail: str(data.approvedBy),
        approvedAt: str(data.approvedAt),
        createdAt: str(data.createdAt),
      });
    } else {
      memberships[existing] = {
        ...memberships[existing],
        role: legacyRole,
        status: legacyStatus ?? memberships[existing].status,
      };
    }
  }

  memberships.sort((a, b) => a.clinicId.localeCompare(b.clinicId));

  const desired = str(data.activeClinicId) ?? legacyClinicId;
  const active =
    memberships.find((m) => m.clinicId === desired) ??
    memberships.find((m) => m.status === "approved") ??
    memberships[0] ??
    null;

  return {
    role: active?.role ?? legacyRole,
    clinicId: active?.clinicId ?? null,
    status: active?.status ?? legacyStatus ?? "pending",
    username,
    name,
    email,
    memberships,
  };
}

/** Fields written alongside a membership so untouched readers stay correct. */
export function legacyMirror(membership: ClinicMembership) {
  return {
    role: membership.role,
    clinicId: membership.clinicId,
    status: membership.status,
    activeClinicId: membership.clinicId,
  };
}
