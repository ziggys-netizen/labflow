"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../lib/AuthContext";
import { db } from "../lib/firebase";
import {
  collection,
  getDocs,
  addDoc,
  doc,
  updateDoc,
  query,
  where,
} from "firebase/firestore";
import ProtectedRoute from "../lib/ProtectedRoute";
import AppNav from "../lib/AppNav";
import StaffPanel from "../lib/StaffPanel";
import { requireSurface } from "../lib/surfaces";
import { resolveIdentity } from "../lib/membership";
import { seedClinicCatalog, backfillEmptyClinicCatalogs } from "../lib/catalogSeed";
import { seedAdultFlaggingFixtures } from "../lib/adultFlaggingSeed";
import {
  GREEN_AID_CLINIC_ID,
  GREEN_AID_CLINIC_NAME,
} from "../lib/greenAidIsolationFixtures";
import {
  formatGreenAidSeedSuccess,
  seedGreenAidIsolationFixtures,
} from "../lib/greenAidIsolationSeed";
import { actorFromAuth, safeLogAudit } from "../lib/audit";
import {
  ClinicRecord,
  GAMBIA_HEALTH_REGIONS,
  loadAllClinics,
  loadPatientCountsByClinic,
  uniqueJoinCode,
} from "../lib/clinics";
import { loadStaffRows, staffCountsByClinic, subscribeStaffChanged } from "../lib/staffOps";
import { syncCustomClaims } from "../lib/authApi";
import { CLINIC_TIER_LABELS, CLINIC_TIERS, parseClinicTier, type ClinicTier } from "../lib/resultModel";
import {
  clinicRetentionValidationError,
  clinicRetentionWriteFields,
  clinicSetupComplete,
  RETENTION_NOT_SET_LABEL,
} from "../lib/clinicRetention";
import RetentionPolicyFields from "../lib/RetentionPolicyFields";

function OwnerContent() {
  const { user, role, username, shift, actingClinicId, actingClinicName } = useAuth();
  const canAccess = role === "owner";

  const [clinics, setClinics] = useState<ClinicRecord[]>([]);
  const [staffCounts, setStaffCounts] = useState<Record<string, number>>({});
  const [patientCounts, setPatientCounts] = useState<Record<string, number>>({});
  const [clinicQuery, setClinicQuery] = useState("");
  const [loadingClinics, setLoadingClinics] = useState(true);
  const [status, setStatus] = useState("");
  const [createdClinicId, setCreatedClinicId] = useState("");

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [tin, setTin] = useState("");
  const [businessRegNumber, setBusinessRegNumber] = useState("");
  const [responsiblePerson, setResponsiblePerson] = useState("");
  const [tier, setTier] = useState<ClinicTier | "">("");
  const [region, setRegion] = useState("");
  const [retentionPeriod, setRetentionPeriod] = useState("");
  const [retentionBasis, setRetentionBasis] = useState("");
  const [creating, setCreating] = useState(false);

  const [adminEmail, setAdminEmail] = useState("");
  const [adminClinicId, setAdminClinicId] = useState("");
  const [assigning, setAssigning] = useState(false);
  const [backfilling, setBackfilling] = useState(false);
  const [seedingAdults, setSeedingAdults] = useState(false);
  const [seedingGreenAid, setSeedingGreenAid] = useState(false);

  async function loadClinics() {
    try {
      const [list, staffResult, patients] = await Promise.all([
        loadAllClinics(),
        loadStaffRows({ role: "owner", clinicId: null }),
        loadPatientCountsByClinic(),
      ]);
      setClinics(list);
      setStaffCounts(staffCountsByClinic(staffResult.rows));
      setPatientCounts(patients);
    } catch (err) {
      console.error(err);
      setStatus("Could not load clinics.");
    } finally {
      setLoadingClinics(false);
    }
  }

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (canAccess) loadClinics();
      else setLoadingClinics(false);
    }, 0);
    return () => window.clearTimeout(timer);
  }, [canAccess]);

  useEffect(() => {
    if (!canAccess) return;
    return subscribeStaffChanged(() => {
      loadClinics();
    });
  }, [canAccess]);

  async function handleCreateClinic(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) {
      setStatus("Clinic name is required.");
      return;
    }
    const clinicTier = parseClinicTier(tier);
    if (!clinicTier) {
      setStatus("Choose the clinic tier. It decides which tests are seeded.");
      return;
    }
    const retentionError = clinicRetentionValidationError(retentionPeriod, retentionBasis);
    if (retentionError) {
      setStatus(retentionError);
      return;
    }
    setCreating(true);
    setCreatedClinicId("");
    setStatus("Creating clinic...");
    try {
      const joinCode = await uniqueJoinCode();
      const retention = clinicRetentionWriteFields(retentionPeriod, retentionBasis);
      const docRef = await addDoc(collection(db, "clinics"), {
        name: name.trim(),
        address: address.trim(),
        tin: tin.trim(),
        businessRegNumber: businessRegNumber.trim(),
        responsiblePerson: responsiblePerson.trim(),
        tier: clinicTier,
        region: region.trim(),
        joinCode,
        createdAt: new Date().toISOString(),
        createdBy: user.uid,
        active: true,
        brandColor: null,
        idleLockMinutes: 5,
        ...retention,
      });
      const createdActor = actorFromAuth(user, role, shift);
      if (createdActor) {
        await safeLogAudit({
          clinicId: docRef.id,
          actor: createdActor,
          action: "clinic.create",
          targetCollection: "clinics",
          targetId: docRef.id,
          targetLabel: name.trim(),
          detail: {
            fields: [
              "name",
              "address",
              "tin",
              "businessRegNumber",
              "responsiblePerson",
              "tier",
              "region",
              "joinCode",
              "retentionPeriod",
              "retentionBasis",
            ],
            tier: clinicTier,
          },
        });
      }
      setCreatedClinicId(docRef.id);
      try {
        const actor = actorFromAuth(user, role, shift);
        const seeded = await seedClinicCatalog(docRef.id, { actor, tier: clinicTier });
        setStatus(
          `Clinic created. Join code: ${joinCode}. Seeded ${seeded} ${clinicTier}-tier tests (not reviewed).`
        );
      } catch (seedErr) {
        console.error(seedErr);
        setStatus(
          `Clinic created. Join code: ${joinCode}. Catalogue seed failed — use “Seed empty clinic catalogues” below to retry.`
        );
        await loadClinics();
        return;
      }
      setName("");
      setAddress("");
      setTin("");
      setBusinessRegNumber("");
      setResponsiblePerson("");
      setTier("");
      setRegion("");
      setRetentionPeriod("");
      setRetentionBasis("");
      setCreatedClinicId(docRef.id);
      await loadClinics();
    } catch (err) {
      console.error(err);
      setStatus("Failed to create clinic.");
    } finally {
      setCreating(false);
    }
  }

  async function handleAssignAdmin(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    const email = adminEmail.trim();
    if (!email || !adminClinicId) {
      setStatus("Enter an email and select a clinic.");
      return;
    }
    setAssigning(true);
    setStatus("Looking up account...");
    try {
      let snapshot = await getDocs(query(collection(db, "users"), where("email", "==", email)));
      if (snapshot.empty) {
        snapshot = await getDocs(
          query(collection(db, "users"), where("email", "==", email.toLowerCase()))
        );
      }
      if (snapshot.empty) {
        setStatus("No account with that email.");
        return;
      }
      const userSnap = snapshot.docs[0];
      const identity = resolveIdentity(userSnap.data());
      if (identity.role === "owner") {
        setStatus("The owner account cannot be assigned to a clinic.");
        return;
      }
      const approvedAt = new Date().toISOString();
      const existing = identity.memberships.find((m) => m.clinicId === adminClinicId);
      const clinicIds = [...new Set([...identity.memberships.map((m) => m.clinicId), adminClinicId])];
      await updateDoc(doc(db, "users", userSnap.id), {
        [`clinicRoles.${adminClinicId}`]: {
          role: "clinic_admin",
          status: "approved",
          createdAt: existing?.createdAt ?? identity.memberships[0]?.createdAt ?? approvedAt,
          approvedByUid: user.uid,
          approvedByUsername: username ?? null,
          approvedByEmail: user.email ?? null,
          approvedAt,
        },
        clinicIds,
        role: "clinic_admin",
        clinicId: adminClinicId,
        status: "approved",
        activeClinicId: adminClinicId,
        approvedBy: user.email ?? null,
        approvedByUid: user.uid,
        approvedByUsername: username ?? null,
        approvedAt,
      });
      await syncCustomClaims(userSnap.id);
      const assignActor = actorFromAuth(user, role, shift);
      if (assignActor) {
        await safeLogAudit({
          clinicId: adminClinicId,
          actor: assignActor,
          action: existing?.status === "approved" ? "staff.roleChange" : "staff.approve",
          targetCollection: "users",
          targetId: userSnap.id,
          targetLabel: identity.username || identity.name || email,
          detail: { role: "clinic_admin", status: "approved" },
        });
      }
      setStatus("Clinic administrator assigned.");
      setAdminEmail("");
    } catch (err) {
      console.error(err);
      setStatus("Failed to assign clinic administrator.");
    } finally {
      setAssigning(false);
    }
  }

  async function handleBackfillCatalogs() {
    if (!user || role !== "owner") return;
    const actor = actorFromAuth(user, role, shift);
    if (!actor) return;
    setBackfilling(true);
    setStatus("Checking clinic catalogues...");
    try {
      const result = await backfillEmptyClinicCatalogs(clinics, actor);
      if (result.testsCreated === 0) {
        setStatus("Every clinic already has a catalogue. Nothing was seeded.");
      } else {
        setStatus(
          `Created ${result.testsCreated} catalogue documents across ${result.clinicsSeeded} clinic${
            result.clinicsSeeded === 1 ? "" : "s"
          }.`
        );
      }
    } catch (err) {
      console.error(err);
      setStatus("Failed to seed empty clinic catalogues.");
    } finally {
      setBackfilling(false);
    }
  }

  async function handleSeedAdultFixtures() {
    if (!user || role !== "owner") return;
    if (!actingClinicId) {
      setStatus("Select an acting clinic in the header, then seed adult H/L fixtures.");
      return;
    }
    const actor = actorFromAuth(user, role, shift);
    if (!actor) return;
    setSeedingAdults(true);
    setStatus(`Seeding adult H/L fixtures into ${actingClinicName || actingClinicId}...`);
    try {
      const result = await seedAdultFlaggingFixtures(actingClinicId, { actor });
      if (result.createdPatients === 0 && result.createdOrders === 0) {
        setStatus("Adult H/L fixtures already present for this clinic.");
      } else {
        setStatus(
          `Seeded ${result.createdPatients} adult patient(s) and ${result.createdOrders} released FBC order(s) into ${actingClinicName || actingClinicId}.`
        );
      }
      await loadClinics();
    } catch (err) {
      console.error(err);
      setStatus("Failed to seed adult H/L fixtures.");
    } finally {
      setSeedingAdults(false);
    }
  }

  async function handleSeedGreenAidIsolation() {
    if (!user || role !== "owner") return;
    const confirmed = window.confirm(
      `Seed synthetic isolation data into ${GREEN_AID_CLINIC_NAME} (${GREEN_AID_CLINIC_ID})?\n\n` +
        "Writes catalogue (including HB and SICKLE), three invented patients, and four orders. " +
        "Refuses if Green Aid already has any patients."
    );
    if (!confirmed) {
      setStatus("Green Aid isolation seed cancelled.");
      return;
    }
    const actor = actorFromAuth(user, role, shift);
    if (!actor) return;
    setSeedingGreenAid(true);
    setStatus(`Seeding ${GREEN_AID_CLINIC_NAME} isolation fixtures...`);
    try {
      const result = await seedGreenAidIsolationFixtures({ actor });
      if (!result.ok) {
        setStatus(result.message);
        return;
      }
      setStatus(formatGreenAidSeedSuccess(result));
      await loadClinics();
    } catch (err) {
      console.error(err);
      setStatus("Failed to seed Green Aid isolation fixtures.");
    } finally {
      setSeedingGreenAid(false);
    }
  }

  const filteredClinics = useMemo(() => {
    const q = clinicQuery.trim().toLowerCase();
    if (!q) return clinics;
    return clinics.filter(
      (c) => c.name.toLowerCase().includes(q) || c.address.toLowerCase().includes(q)
    );
  }, [clinics, clinicQuery]);

  if (!canAccess) {
    return (
      <main className="min-h-screen bg-lf-ground">
        <AppNav />
        <div className="max-w-sm mx-auto px-6 py-16 text-center">
          <p className="text-gray-600 mb-4">You do not have access to this page.</p>
          <a href="/patients" className="text-gray-900 underline font-medium">
            Go to Patients
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-lf-ground">
      <AppNav />
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Owner</h1>
        <p className="text-gray-600 mb-6">
          Create clinics, issue join codes, assign the first clinic administrator, and onboard data.
          Open a clinic to manage its staff. Pending approvals stay here so they are not buried.
        </p>
        {status && (
          <p className="text-sm text-gray-600 mb-4 whitespace-pre-wrap break-words">{status}</p>
        )}
        {createdClinicId && (
          <Link
            href={`/owner/clinics/${createdClinicId}`}
            className="mb-6 mr-3 inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            Open clinic profile
          </Link>
        )}

        <StaffPanel pendingOnly embedded />

        <section className="border border-gray-200 rounded-lg p-4 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
            <h2 className="font-medium text-gray-900">Clinics</h2>
            <p className="text-sm text-gray-500">{clinics.length} total</p>
          </div>
          <input
            type="search"
            value={clinicQuery}
            onChange={(e) => setClinicQuery(e.target.value)}
            placeholder="Search clinics"
            className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm mb-3"
          />
          {loadingClinics && <p className="text-sm text-gray-500">Loading...</p>}
          {!loadingClinics && clinics.length === 0 && (
            <p className="text-sm text-gray-500">No clinics yet.</p>
          )}
          {!loadingClinics && clinics.length > 0 && filteredClinics.length === 0 && (
            <p className="text-sm text-gray-500">No clinics match that search.</p>
          )}
          {!loadingClinics && filteredClinics.length > 0 && (
            <div className="max-h-[32rem] overflow-y-auto border border-gray-100 rounded-lg divide-y divide-gray-100">
              {filteredClinics.map((c) => (
                <Link
                  key={c.id}
                  href={`/owner/clinics/${c.id}`}
                  className="flex items-center justify-between gap-4 px-3 py-3 hover:bg-gray-50"
                >
                  <div className="min-w-0">
                    <p className="font-medium text-gray-900 truncate">
                      {c.name || c.id}
                      {c.tier && (
                        <span className="ml-2 text-xs font-normal capitalize text-gray-500">{c.tier}</span>
                      )}
                      {!c.active && (
                        <span className="ml-2 text-xs font-normal uppercase tracking-wide text-gray-500">
                          Inactive
                        </span>
                      )}
                      {!clinicSetupComplete(c) && (
                        <span className="ml-2 text-xs font-normal text-amber-800">
                          Retention {RETENTION_NOT_SET_LABEL.toLowerCase()}
                        </span>
                      )}
                    </p>
                  </div>
                  <p className="text-sm text-gray-500 whitespace-nowrap">
                    {staffCounts[c.id] ?? 0} staff · {patientCounts[c.id] ?? 0} patients
                  </p>
                </Link>
              ))}
            </div>
          )}
        </section>

        <section className="border border-gray-200 rounded-lg p-4 mb-6">
          <h2 className="font-medium text-gray-900 mb-3">Create a clinic</h2>
          <form onSubmit={handleCreateClinic} className="space-y-3">
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Clinic name"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              placeholder="Address"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={tin}
              onChange={(e) => setTin(e.target.value)}
              placeholder="TIN"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={businessRegNumber}
              onChange={(e) => setBusinessRegNumber(e.target.value)}
              placeholder="Business registration number"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <input
              type="text"
              value={responsiblePerson}
              onChange={(e) => setResponsiblePerson(e.target.value)}
              placeholder="Responsible person"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <select
              value={tier}
              onChange={(e) => setTier(parseClinicTier(e.target.value) || "")}
              required
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Clinic tier (required)</option>
              {CLINIC_TIERS.map((value) => (
                <option key={value} value={value}>
                  {CLINIC_TIER_LABELS[value]}
                </option>
              ))}
            </select>
            <select
              value={region}
              onChange={(e) => setRegion(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Health region (optional)</option>
              {GAMBIA_HEALTH_REGIONS.map((value) => (
                <option key={value} value={value}>
                  {value}
                </option>
              ))}
            </select>
            <RetentionPolicyFields
              period={retentionPeriod}
              basis={retentionBasis}
              onPeriodChange={setRetentionPeriod}
              onBasisChange={setRetentionBasis}
              disabled={creating}
            />
            <button
              type="submit"
              disabled={creating}
              className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2 disabled:opacity-50"
            >
              {creating ? "Creating..." : "Create clinic"}
            </button>
          </form>
        </section>

        <section className="border border-gray-200 rounded-lg p-4 mb-6">
          <h2 className="font-medium text-gray-900 mb-2">Seed empty clinic catalogues</h2>
          <p className="text-sm text-gray-600 mb-3">
            Clinics with no catalogue documents get the national menu for their tier, marked not reviewed.
            Clinics that already have any catalogue are left unchanged.
          </p>
          <button
            type="button"
            onClick={handleBackfillCatalogs}
            disabled={backfilling || loadingClinics || clinics.length === 0}
            className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2 disabled:opacity-50"
          >
            {backfilling ? "Seeding..." : "Seed empty clinic catalogues"}
          </button>
        </section>

        <section className="border border-gray-200 rounded-lg p-4 mb-6">
          <h2 className="font-medium text-gray-900 mb-2">Seed adult H/L flagging fixtures</h2>
          <p className="text-sm text-gray-600 mb-3">
            Adds a synthetic adult male and adult female (real DOBs) with a released FBC each that
            shows both H and L. Uses the acting clinic selected in the header. Idempotent.
          </p>
          <button
            type="button"
            onClick={handleSeedAdultFixtures}
            disabled={seedingAdults || !actingClinicId}
            className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2 disabled:opacity-50"
          >
            {seedingAdults
              ? "Seeding..."
              : actingClinicId
                ? `Seed into ${actingClinicName || actingClinicId}`
                : "Select acting clinic first"}
          </button>
        </section>

        <section className="border border-gray-200 rounded-lg p-4 mb-6">
          <h2 className="font-medium text-gray-900 mb-2">Seed Green Aid isolation fixtures</h2>
          <p className="text-sm text-gray-600 mb-3">
            One-shot synthetic data for {GREEN_AID_CLINIC_NAME} only ({GREEN_AID_CLINIC_ID}):
            catalogue including HB and SICKLE, three invented patients, four orders spanning
            awaiting sample through released (one multi-specimen). Runs in the browser as owner
            via the client SDK. Refuses if Green Aid already has patients.
          </p>
          <button
            type="button"
            onClick={handleSeedGreenAidIsolation}
            disabled={seedingGreenAid}
            className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2 disabled:opacity-50"
          >
            {seedingGreenAid
              ? "Seeding..."
              : `Seed ${GREEN_AID_CLINIC_NAME} isolation fixtures`}
          </button>
        </section>

        <section className="border border-gray-200 rounded-lg p-4 mb-6">
          <h2 className="font-medium text-gray-900 mb-3">Set clinic administrator</h2>
          <form onSubmit={handleAssignAdmin} className="space-y-3">
            <input
              type="email"
              value={adminEmail}
              onChange={(e) => setAdminEmail(e.target.value)}
              placeholder="Staff email (must already have signed in)"
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
            <select
              value={adminClinicId}
              onChange={(e) => setAdminClinicId(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            >
              <option value="">Select clinic...</option>
              {clinics.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            <button
              type="submit"
              disabled={assigning}
              className="bg-gray-900 text-white text-sm rounded-lg px-4 py-2 disabled:opacity-50"
            >
              {assigning ? "Saving..." : "Assign clinic admin"}
            </button>
          </form>
        </section>

      </div>
    </main>
  );
}

export default function Owner() {
  return (
    <ProtectedRoute require={requireSurface("owner")}>
      <OwnerContent />
    </ProtectedRoute>
  );
}
