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
  loadClinic,
  regenerateClinicJoinCode,
  saveClinicProfile,
} from "../../../lib/clinics";

function ClinicProfileContent() {
  const params = useParams();
  const clinicId = String(params.clinicId || "");
  const { user, role, clinicId: actorClinicId, setActingClinic } = useAuth();
  const owner = isOwner(role);
  const allowed = canAccessClinicWorkspace(role, actorClinicId, clinicId);
  const canEdit = allowed && canEditClinicProfile(role);
  const showJoinCode = allowed && canViewJoinCode(role);

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
  const [active, setActive] = useState(true);

  useEffect(() => {
    if (owner && clinicId) setActingClinic(clinicId);
  }, [owner, clinicId, setActingClinic]);

  useEffect(() => {
    if (!allowed || !clinicId) {
      setLoading(false);
      setClinic(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
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
  }, [allowed, clinicId]);

  async function reload() {
    const record = await loadClinic(clinicId);
    setClinic(record);
    if (record) {
      setName(record.name);
      setAddress(record.address);
      setTin(record.tin);
      setBusinessRegNumber(record.businessRegNumber);
      setResponsiblePerson(record.responsiblePerson);
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
        actor: { uid: user.uid, email: user.email },
      });
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
      await reload();
      setStatus(`Join code updated: ${next}`);
    } catch (err) {
      console.error(err);
      setStatus("Failed to regenerate the join code.");
    } finally {
      setRegenerating(false);
    }
  }

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
