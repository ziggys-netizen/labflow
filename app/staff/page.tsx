"use client";

import { useEffect, useState } from "react";
import { db } from "../lib/firebase";
import { collection, getDocs, doc, updateDoc, query, where, getDoc } from "firebase/firestore";
import ProtectedRoute from "../lib/ProtectedRoute";
import AppNav from "../lib/AppNav";
import { useAuth } from "../lib/AuthContext";
import { isOwner } from "../lib/clinicScope";

const ASSIGNABLE_ROLES = ["clinic_admin", "lab_manager", "technician", "storekeeper"] as const;

interface StaffUser {
  id: string;
  email: string;
  role: string;
  status: string;
  clinicId: string | null;
  createdAt: string;
}

function StaffContent() {
  const { user, role, clinicId } = useAuth();
  const canAccess = role === "owner" || role === "clinic_admin";
  const [staff, setStaff] = useState<StaffUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusMsg, setStatusMsg] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [roleDraft, setRoleDraft] = useState<Record<string, string>>({});

  async function loadStaff() {
    try {
      const q = isOwner(role)
        ? collection(db, "users")
        : query(collection(db, "users"), where("clinicId", "==", clinicId || "__none__"));
      const snapshot = await getDocs(q);
      const list: StaffUser[] = snapshot.docs.map((d) => {
        const data = d.data();
        return {
          id: d.id,
          email: data.email || "",
          role: data.role || "",
          status: data.status || "approved",
          clinicId: data.clinicId || null,
          createdAt: data.createdAt || "",
        };
      });
      list.sort((a, b) => a.email.localeCompare(b.email));
      setStaff(list);
      const drafts: Record<string, string> = {};
      list.forEach((s) => {
        drafts[s.id] = ASSIGNABLE_ROLES.includes(s.role as (typeof ASSIGNABLE_ROLES)[number])
          ? s.role
          : "technician";
      });
      setRoleDraft(drafts);
    } catch (err) {
      console.error(err);
      setStatusMsg("Could not load staff.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (canAccess) loadStaff();
    else setLoading(false);
  }, [canAccess, role, clinicId]);

  useEffect(() => {
    async function loadJoinCode() {
      if (role !== "clinic_admin" || !clinicId) return;
      try {
        const snap = await getDoc(doc(db, "clinics", clinicId));
        if (snap.exists()) setJoinCode(snap.data().joinCode || "");
      } catch (err) {
        console.error(err);
      }
    }
    loadJoinCode();
  }, [role, clinicId]);

  async function setUserStatus(target: StaffUser, nextStatus: "approved" | "rejected") {
    if (!user) return;
    if (target.role === "owner") return;
    setStatusMsg("Saving...");
    try {
      await updateDoc(doc(db, "users", target.id), {
        status: nextStatus,
        approvedBy: user.email,
        approvedAt: new Date().toISOString(),
      });
      setStatusMsg(nextStatus === "approved" ? "Staff member approved." : "Request rejected.");
      await loadStaff();
    } catch (err) {
      console.error(err);
      setStatusMsg("Failed to update status.");
    }
  }

  async function saveRole(target: StaffUser) {
    if (target.role === "owner") return;
    const nextRole = roleDraft[target.id];
    if (!ASSIGNABLE_ROLES.includes(nextRole as (typeof ASSIGNABLE_ROLES)[number])) {
      setStatusMsg("That role cannot be assigned.");
      return;
    }
    setStatusMsg("Saving role...");
    try {
      await updateDoc(doc(db, "users", target.id), { role: nextRole });
      setStatusMsg("Role updated.");
      await loadStaff();
    } catch (err) {
      console.error(err);
      setStatusMsg("Failed to update role.");
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
      <div className="max-w-4xl mx-auto px-6 py-16">
        <h1 className="text-2xl font-semibold text-gray-900 mb-2">Manage Staff</h1>
        <p className="text-gray-600 mb-4">Approve pending accounts and assign clinic roles. The owner role cannot be assigned here.</p>
        {role === "clinic_admin" && joinCode && (
          <p className="text-sm text-gray-700 mb-4">
            Clinic join code: <span className="font-mono font-medium">{joinCode}</span>
          </p>
        )}
        {statusMsg && <p className="text-sm text-gray-600 mb-4">{statusMsg}</p>}
        {loading && <p className="text-gray-600">Loading...</p>}
        {!loading && staff.length === 0 && <p className="text-gray-600">No staff records found.</p>}

        <div className="space-y-3">
          {staff.map((s) => {
            const isTargetOwner = s.role === "owner";
            return (
              <div key={s.id} className="border border-gray-200 rounded-lg p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <p className="font-medium text-gray-900">{s.email || s.id}</p>
                    <p className="text-sm text-gray-500">
                      Status: {s.status} · Role: {s.role || "—"}
                    </p>
                  </div>
                  {isTargetOwner ? (
                    <p className="text-sm text-gray-500">Owner account — cannot be changed.</p>
                  ) : (
                    <div className="flex flex-wrap items-center gap-2">
                      {s.status === "pending" && (
                        <>
                          <button
                            onClick={() => setUserStatus(s, "approved")}
                            className="text-sm bg-gray-900 text-white rounded px-3 py-1.5"
                          >
                            Approve
                          </button>
                          <button
                            onClick={() => setUserStatus(s, "rejected")}
                            className="text-sm text-red-600 underline"
                          >
                            Reject
                          </button>
                        </>
                      )}
                      <select
                        value={roleDraft[s.id] || "technician"}
                        onChange={(e) => setRoleDraft((prev) => ({ ...prev, [s.id]: e.target.value }))}
                        className="border border-gray-300 rounded px-2 py-1 text-sm"
                      >
                        {ASSIGNABLE_ROLES.map((r) => (
                          <option key={r} value={r}>
                            {r}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => saveRole(s)}
                        className="text-sm text-gray-900 underline"
                      >
                        Save role
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </main>
  );
}

export default function Staff() {
  return (
    <ProtectedRoute>
      <StaffContent />
    </ProtectedRoute>
  );
}
