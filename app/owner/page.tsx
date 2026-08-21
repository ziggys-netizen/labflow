"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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
import { resolveIdentity } from "../lib/membership";

interface Clinic {
  id: string;
  name: string;
  address: string;
  tin: string;
  businessRegNumber: string;
  responsiblePerson: string;
  joinCode: string;
  createdAt: string;
  active: boolean;
}

const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

function generateJoinCode() {
  let code = "";
  for (let i = 0; i < 7; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

async function uniqueJoinCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateJoinCode();
    const snap = await getDocs(query(collection(db, "clinics"), where("joinCode", "==", code)));
    if (snap.empty) return code;
  }
  throw new Error("Could not generate a unique join code.");
}

function OwnerContent() {
  const { user, role, username } = useAuth();
  const canAccess = role === "owner";

  const [clinics, setClinics] = useState<Clinic[]>([]);
  const [loadingClinics, setLoadingClinics] = useState(true);
  const [status, setStatus] = useState("");
  const [createdClinicId, setCreatedClinicId] = useState("");

  const [name, setName] = useState("");
  const [address, setAddress] = useState("");
  const [tin, setTin] = useState("");
  const [businessRegNumber, setBusinessRegNumber] = useState("");
  const [responsiblePerson, setResponsiblePerson] = useState("");
  const [creating, setCreating] = useState(false);

  const [adminEmail, setAdminEmail] = useState("");
  const [adminClinicId, setAdminClinicId] = useState("");
  const [assigning, setAssigning] = useState(false);

  async function loadClinics() {
    try {
      const snapshot = await getDocs(collection(db, "clinics"));
      const list: Clinic[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          name: data.name || "",
          address: data.address || "",
          tin: data.tin || "",
          businessRegNumber: data.businessRegNumber || "",
          responsiblePerson: data.responsiblePerson || "",
          joinCode: data.joinCode || "",
          createdAt: data.createdAt || "",
          active: data.active !== false,
        };
      });
      list.sort((a, b) => a.name.localeCompare(b.name));
      setClinics(list);
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

  async function handleCreateClinic(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    if (!name.trim()) {
      setStatus("Clinic name is required.");
      return;
    }
    setCreating(true);
    setCreatedClinicId("");
    setStatus("Creating clinic...");
    try {
      const joinCode = await uniqueJoinCode();
      const docRef = await addDoc(collection(db, "clinics"), {
        name: name.trim(),
        address: address.trim(),
        tin: tin.trim(),
        businessRegNumber: businessRegNumber.trim(),
        responsiblePerson: responsiblePerson.trim(),
        joinCode,
        createdAt: new Date().toISOString(),
        createdBy: user.uid,
        active: true,
        brandColor: null,
      });
      setStatus(`Clinic created. Join code: ${joinCode}`);
      setName("");
      setAddress("");
      setTin("");
      setBusinessRegNumber("");
      setResponsiblePerson("");
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
      setStatus("Clinic administrator assigned.");
      setAdminEmail("");
    } catch (err) {
      console.error(err);
      setStatus("Failed to assign clinic administrator.");
    } finally {
      setAssigning(false);
    }
  }

    if (!canAccess) {
    return (
      <main className="min-h-screen bg-white">
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
    <main className="min-h-screen bg-white">
      <AppNav />
      <div className="max-w-3xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold text-gray-900 mb-1">Owner</h1>
        <p className="text-gray-600 mb-6">
          Create clinics, issue join codes, assign the first clinic administrator, and onboard data.
          Open a clinic to manage its staff. Pending approvals stay here so they are not buried.
        </p>
        {status && <p className="text-sm text-gray-600 mb-4">{status}</p>}
        {createdClinicId && (
          <Link
            href={`/owner/clinics/${createdClinicId}/migration`}
            className="mb-6 inline-flex rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
          >
            Continue to Data Migration
          </Link>
        )}

        <section className="border border-gray-200 rounded-lg p-4 mb-6">
          <h2 className="font-medium text-gray-900 mb-3">Pending staff approvals</h2>
          <p className="text-sm text-gray-600 mb-4">
            People waiting to work are listed here first. Approved staff live under each clinic.
          </p>
          <StaffPanel pendingOnly embedded />
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
          <h2 className="font-medium text-gray-900 mb-3">Clinics</h2>
          {loadingClinics && <p className="text-sm text-gray-500">Loading...</p>}
          {!loadingClinics && clinics.length === 0 && (
            <p className="text-sm text-gray-500">No clinics yet.</p>
          )}
          <div className="space-y-3">
            {clinics.map((c) => (
              <div key={c.id} className="border border-gray-100 rounded-lg p-3">
                <Link
                  href={`/owner/clinics/${c.id}`}
                  className="font-medium text-gray-900 underline"
                >
                  {c.name}
                </Link>
                <p className="text-sm text-gray-600">{c.address}</p>
                <p className="text-sm text-gray-500 mt-1">
                  Join code: <span className="font-mono text-gray-900">{c.joinCode}</span>
                </p>
                <p className="text-xs text-gray-400 mt-1">ID: {c.id}</p>
                <div className="mt-3 flex flex-wrap gap-3">
                  <Link
                    href={`/owner/clinics/${c.id}/staff`}
                    className="text-sm font-medium text-gray-900 underline"
                  >
                    Manage staff
                  </Link>
                  <Link
                    href={`/owner/clinics/${c.id}/migration`}
                    className="text-sm font-medium text-gray-900 underline"
                  >
                    Run migration
                  </Link>
                  <Link
                    href={`/owner/clinics/${c.id}/migration`}
                    className="text-sm font-medium text-gray-900 underline"
                  >
                    + Add Data
                  </Link>
                </div>
              </div>
            ))}
          </div>
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
    <ProtectedRoute>
      <OwnerContent />
    </ProtectedRoute>
  );
}
