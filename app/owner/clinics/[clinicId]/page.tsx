"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import ProtectedRoute from "../../../lib/ProtectedRoute";
import AppNav from "../../../lib/AppNav";
import { useAuth } from "../../../lib/AuthContext";
import {
  canAccessClinicWorkspace,
  canEditClinicProfile,
  canManageStaff,
  canViewJoinCode,
  landingPathForRole,
} from "../../../lib/permissions";
import { isOwner } from "../../../lib/clinicScope";
import {
  ClinicRecord,
  GAMBIA_HEALTH_REGIONS,
  loadClinic,
  regenerateClinicJoinCode,
  saveClinicProfile,
} from "../../../lib/clinics";
import { CLINIC_TIER_LABELS, CLINIC_TIERS, parseClinicTier, type ClinicTier } from "../../../lib/resultModel";
import { actorFromAuth, safeLogAudit } from "../../../lib/audit";

function ClinicProfileContent() {
  const params = useParams();
  const clinicId = String(params.clinicId || "");
  const { user, role, clinicId: actorClinicId, setActingClinic, shift } = useAuth();
  const owner = isOwner(role);
  const allowed = canAccessClinicWorkspace(role, actorClinicId, clinicId);
  const canEdit = allowed && canEditClinicProfile(role);
  const showJoinCode = allowed && canViewJoinCode(role);

  useEffect(() => {
    if (owner && clinicId) setActingClinic(clinicId);
  }, [owner, clinicId, setActingClinic]);

  if (!allowed) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="max-w-sm mx-auto px-6 py-16 text-center">
          <p className="text-gray-600 mb-4">You can only open your own clinic.</p>
          <Link
            href={landingPathForRole(role, actorClinicId)}
            className="text-gray-900 underline font-medium"
          >
            Go to your workspace
          </Link>
        </div>
      </main>
    );
  }

  return (
    <ClinicProfileEditor
      key={clinicId}
      clinicId={clinicId}
      user={user}
      role={role}
      actorClinicId={actorClinicId}
      owner={owner}
      canEdit={canEdit}
      showJoinCode={showJoinCode}
      shift={shift}
    />
  );
}

function ClinicProfileEditor({
  clinicId,
  user,
  role,
  actorClinicId,
  owner,
  canEdit,
  showJoinCode,
  shift,
}: {
  clinicId: string;
  user: ReturnType<typeof useAuth>["user"];
  role: string | null;
  actorClinicId: string | null;
  owner: boolean;
  canEdit: boolean;
  showJoinCode: boolean;
  shift: string | null;
}) {
  const [clinic, setClinic] = useState<ClinicRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [regenerating, setRegenerating] = useState(false);
  const [status, setStatus] = useState("");

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [tin, setTin] = useState("");
  const [businessRegNumber, setBusinessRegNumber] = useState("");
  const [responsiblePerson, setResponsiblePerson] = useState("");
  const [tier, setTier] = useState<ClinicTier | "">("");
  const [region, setRegion] = useState("");
  const [licenceNumber, setLicenceNumber] = useState("");
  const [licenceExpiry, setLicenceExpiry] = useState("");
  const [idleLockMinutes, setIdleLockMinutes] = useState("5");
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (!clinicId) return;
    let cancelled = false;
    loadClinic(clinicId)
      .then((record) => {
        if (cancelled) return;
        setClinic(record);
        if (record) {
          setName(record.name);
          setAddress(record.address);
          setTin(record.tin);
          setBusinessRegNumber(record.businessRegNumber);
          setResponsiblePerson(record.responsiblePerson);
          setTier(record.tier ?? "");
          setRegion(record.region);
          setLicenceNumber(record.licenceNumber);
          setLicenceExpiry(record.licenceExpiry);
          setIdleLockMinutes(String(record.idleLockMinutes || 5));
          setActive(record.active);
        }
      })
      .catch((err) => {
        console.error(err);
        if (!cancelled) setStatus("Could not load clinic.");
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [clinicId]);

  async function reload() {
    const record = await loadClinic(clinicId);
    setClinic(record);
    if (record) {
      setName(record.name);
      setAddress(record.address);
      setTin(record.tin);
      setBusinessRegNumber(record.businessRegNumber);
      setResponsiblePerson(record.responsiblePerson);
      setTier(record.tier ?? "");
      setRegion(record.region);
      setLicenceNumber(record.licenceNumber);
      setLicenceExpiry(record.licenceExpiry);
      setIdleLockMinutes(String(record.idleLockMinutes || 5));
      setActive(record.active);
    }
    return record;
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !canEdit) return;
    if (!name.trim()) {
      setStatus("Clinic name is required.");
      return;
    }
    setSaving(true);
    setStatus("Saving...");
    try {
      await saveClinicProfile({
        clinicId,
        name,
        address,
        tin,
        businessRegNumber,
        responsiblePerson,
        active,
        tier: parseClinicTier(tier),
        region,
        licenceNumber,
        licenceExpiry,
        idleLockMinutes: Number(idleLockMinutes) || 5,
        actor: { uid: user.uid, email: user.email },
      });
      const actor = actorFromAuth(user, role, shift);
      if (actor) {
        await safeLogAudit({
          clinicId,
          actor,
          action: "clinic.update",
          targetCollection: "clinics",
          targetId: clinicId,
          targetLabel: name.trim() || clinicId,
          detail: {
            fields: [
              "name",
              "address",
              "tin",
              "businessRegNumber",
              "responsiblePerson",
              "active",
              "tier",
              "region",
              "licenceNumber",
              "licenceExpiry",
              "idleLockMinutes",
            ],
          },
        });
      }
      await reload();
      setStatus("Clinic profile saved.");
    } catch (err) {
      console.error(err);
      setStatus("Failed to save clinic profile.");
    } finally {
      setSaving(false);
    }
  }

  async function handleRegenerate() {
    if (!user || !owner) return;
    if (!window.confirm("Regenerate the join code? The current code will stop working.")) return;
    setRegenerating(true);
    setStatus("Generating a new join code...");
    try {
      const next = await regenerateClinicJoinCode(clinicId, {
        uid: user.uid,
        email: user.email,
      });
      const actor = actorFromAuth(user, role, shift);
      if (actor) {
        await safeLogAudit({
          clinicId,
          actor,
          action: "joinCode.regenerate",
          targetCollection: "clinics",
          targetId: clinicId,
          targetLabel: clinic?.name || clinicId,
          detail: { fields: ["joinCode"] },
        });
      }
      await reload();
      setStatus(`Join code updated: ${next}`);
    } catch (err) {
      console.error(err);
      setStatus("Failed to regenerate the join code.");
    } finally {
      setRegenerating(false);
    }
  }

  if (loading) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="min-h-[50vh] flex items-center justify-center text-gray-600">Loading...</div>
      </main>
    );
  }

  if (!clinic) {
    return (
      <main className="min-h-screen bg-white">
        <AppNav />
        <div className="max-w-sm mx-auto px-6 py-16 text-center">
          <p className="text-gray-600 mb-4">Clinic not found.</p>
          {owner ? (
            <Link href="/owner" className="text-gray-900 underline font-medium">
              Owner console
            </Link>
          ) : (
            <Link
              href={landingPathForRole(role, actorClinicId)}
              className="text-gray-900 underline font-medium"
            >
              Go to your workspace
            </Link>
          )}
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-3xl mx-auto px-6 py-16">
        {owner && (
          <p className="text-sm text-gray-500 mb-2">
            <Link href="/owner" className="underline text-gray-900">
              Owner console
            </Link>
          </p>
        )}
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">{clinic.name || "Clinic"}</h1>
        <p className="text-gray-600 mb-6">
          {owner
            ? "Clinic profile, join code, staff, and data migration for this clinic only."
            : "Clinic profile and staff for your clinic."}
        </p>
        {status && <p className="text-sm text-gray-600 mb-4">{status}</p>}

        <section className="border border-gray-200 rounded-lg p-4 mb-6">
          <h2 className="font-medium text-gray-900 mb-3">Profile</h2>
          <form onSubmit={handleSave} className="space-y-3">
            <label className="block">
              <span className="text-sm text-gray-600">Name</span>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                disabled={!canEdit}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Address</span>
              <input
                type="text"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={!canEdit}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">TIN</span>
              <input
                type="text"
                value={tin}
                onChange={(e) => setTin(e.target.value)}
                disabled={!canEdit}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Business registration number</span>
              <input
                type="text"
                value={businessRegNumber}
                onChange={(e) => setBusinessRegNumber(e.target.value)}
                disabled={!canEdit}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Responsible person</span>
              <input
                type="text"
                value={responsiblePerson}
                onChange={(e) => setResponsiblePerson(e.target.value)}
                disabled={!canEdit}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Tier</span>
              <select
                value={tier}
                onChange={(e) => setTier(parseClinicTier(e.target.value) || "")}
                disabled={!canEdit}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
              >
                <option value="">Not set</option>
                {CLINIC_TIERS.map((value) => (
                  <option key={value} value={value}>
                    {CLINIC_TIER_LABELS[value]}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Health region</span>
              <select
                value={region}
                onChange={(e) => setRegion(e.target.value)}
                disabled={!canEdit}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
              >
                <option value="">Not set</option>
                {GAMBIA_HEALTH_REGIONS.map((value) => (
                  <option key={value} value={value}>
                    {value}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Licence number (optional)</span>
              <input
                type="text"
                value={licenceNumber}
                onChange={(e) => setLicenceNumber(e.target.value)}
                disabled={!canEdit}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Licence expiry (optional)</span>
              <input
                type="date"
                value={licenceExpiry}
                onChange={(e) => setLicenceExpiry(e.target.value)}
                disabled={!canEdit}
                className="mt-1 w-full border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
              />
            </label>
            <label className="block">
              <span className="text-sm text-gray-600">Idle lock (minutes)</span>
              <input
                type="number"
                min={1}
                max={60}
                value={idleLockMinutes}
                onChange={(e) => setIdleLockMinutes(e.target.value)}
                disabled={!canEdit}
                className="mt-1 w-24 border border-gray-300 rounded-lg px-3 py-2 text-sm disabled:bg-gray-50"
              />
            </label>
            <label className="flex items-center gap-2 text-sm text-gray-700">
              <input
                type="checkbox"
                checked={active}
                onChange={(e) => setActive(e.target.checked)}
                disabled={!canEdit}
              />
              Active
            </label>
            {canEdit && (
              <button
                type="submit"
                disabled={saving}
                className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2 disabled:opacity-50"
              >
                {saving ? "Saving..." : "Save profile"}
              </button>
            )}
          </form>
        </section>

        {showJoinCode && (
          <section className="border border-gray-200 rounded-lg p-4 mb-6">
            <h2 className="font-medium text-gray-900 mb-2">Join code</h2>
            <p className="text-sm text-gray-700">
              <span className="font-mono font-medium text-gray-900">{clinic.joinCode || "—"}</span>
            </p>
            {owner && (
              <button
                type="button"
                onClick={handleRegenerate}
                disabled={regenerating}
                className="mt-3 text-sm text-gray-900 underline disabled:opacity-50"
              >
                {regenerating ? "Generating..." : "Regenerate join code"}
              </button>
            )}
          </section>
        )}

        <div className="grid gap-3 sm:grid-cols-2">
          {canManageStaff(role) && (
            <Link
              href={`/owner/clinics/${clinic.id}/staff`}
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
            >
              <p className="font-medium text-gray-900">Manage Staff</p>
              <p className="text-sm text-gray-600 mt-1">
                Roles, shifts, and access for this clinic only.
              </p>
            </Link>
          )}
          {canManageStaff(role) && (
            <Link
              href={`/owner/clinics/${clinic.id}/audit`}
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
            >
              <p className="font-medium text-gray-900">Audit log</p>
              <p className="text-sm text-gray-600 mt-1">
                Who changed what, with role and shift. Download as CSV.
              </p>
            </Link>
          )}
          {owner && (
            <Link
              href={`/owner/clinics/${clinic.id}/migration`}
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
            >
              <p className="font-medium text-gray-900">Data Migration</p>
              <p className="text-sm text-gray-600 mt-1">
                Claim unassigned records or import a spreadsheet.
              </p>
            </Link>
          )}
          {owner && (
            <Link
              href={`/owner/clinics/${clinic.id}/data-quality`}
              className="border border-gray-200 rounded-lg p-4 hover:bg-gray-50"
            >
              <p className="font-medium text-gray-900">Data quality</p>
              <p className="text-sm text-gray-600 mt-1">
                Clear bulk-stamped or impossible collection times so turnaround stays honest.
              </p>
            </Link>
          )}
        </div>
      </div>
    </main>
  );
}

export default function ClinicProfilePage() {
  return (
    <ProtectedRoute require={canEditClinicProfile}>
      <ClinicProfileContent />
    </ProtectedRoute>
  );
}
