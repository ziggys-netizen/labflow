"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { auth, googleProvider, db } from "./firebase";
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from "firebase/firestore";
import { reportFirestoreMetadata } from "./firestoreConnectivity";
import {
  ClinicMembership,
  EMPTY_IDENTITY,
  ResolvedIdentity,
  legacyMirror,
  resolveIdentity,
} from "./membership";
import { writeClinicId as resolveWriteClinicId } from "./clinicScope";
import { logPermissionsMatrix } from "./permissions";
import { forceTokenRefresh, syncCustomClaims } from "./authApi";

if (process.env.NODE_ENV === "development") {
  logPermissionsMatrix();
}

const ACTING_CLINIC_KEY = "labflow.actingClinicId";

function readActingClinic(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const value = sessionStorage.getItem(ACTING_CLINIC_KEY);
    return value && value.trim() ? value : null;
  } catch {
    return null;
  }
}

function persistActingClinic(clinicId: string | null) {
  try {
    if (clinicId) sessionStorage.setItem(ACTING_CLINIC_KEY, clinicId);
    else sessionStorage.removeItem(ACTING_CLINIC_KEY);
  } catch {
    // sessionStorage can be unavailable (private mode); acting clinic still works in-memory.
  }
}

interface AuthContextType {
  user: User | null;
  /** Role held at the active clinic. `owner` is global and has no clinic membership. */
  role: string | null;
  /**
   * Membership clinic for this session. Always null for the owner — never the
   * acting clinic. Pass this to getClinicDocs / clinicCollectionQuery.
   */
  clinicId: string | null;
  /**
   * Session-only clinic the owner is writing into. Null for every other role.
   * Persisted in sessionStorage, never written onto the user document.
   */
  actingClinicId: string | null;
  actingClinicName: string | null;
  /**
   * Clinic new records must land in: acting clinic for the owner, membership
   * clinic for staff. Use this on create paths, not on list queries.
   */
  writeClinicId: string | null;
  /** Supervisor shift on the active membership; null for every other role. */
  shift: string | null;
  status: string | null;
  /** Display identity. Falls back to nothing — never to the email address. */
  username: string | null;
  /** Every clinic this account has been assigned a role at. */
  memberships: ClinicMembership[];
  loading: boolean;
  popupBlocked: boolean;
  authError: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  setActiveClinic: (clinicId: string) => Promise<void>;
  setActingClinic: (clinicId: string | null) => void;
}

const SIGN_IN_ERRORS: Record<string, string> = {
  "auth/popup-blocked":
    "Your browser blocked the sign-in popup. Allow popups for this site, then click Continue with Google.",
  "auth/cancelled-popup-request":
    "Another sign-in window was already open. Click Continue with Google to try again.",
  "auth/popup-closed-by-user":
    "The sign-in window was closed before sign-in finished. Click Continue with Google to try again.",
  "auth/unauthorized-domain":
    "This domain is not authorised for Google sign-in. Add it under Firebase Authentication settings, then try again.",
};

const AuthContext = createContext<AuthContextType>({
  user: null,
  role: null,
  clinicId: null,
  actingClinicId: null,
  actingClinicName: null,
  writeClinicId: null,
  shift: null,
  status: null,
  username: null,
  memberships: [],
  loading: true,
  popupBlocked: false,
  authError: null,
  login: async () => {},
  logout: async () => {},
  setActiveClinic: async () => {},
  setActingClinic: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [identity, setIdentity] = useState<ResolvedIdentity>(EMPTY_IDENTITY);
  const [actingClinicId, setActingClinicIdState] = useState<string | null>(null);
  const [actingClinicNames, setActingClinicNames] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const unsubDocRef = useRef<(() => void) | null>(null);
  const actingHydratedRef = useRef(false);

  const clearActingClinic = useCallback(() => {
    actingHydratedRef.current = false;
    setActingClinicIdState(null);
    persistActingClinic(null);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      unsubDocRef.current?.();
      unsubDocRef.current = null;

      setUser(firebaseUser);
      if (!firebaseUser) {
        setIdentity(EMPTY_IDENTITY);
        clearActingClinic();
        setLoading(false);
        return;
      }

      setLoading(true);
      const userDocRef = doc(db, "users", firebaseUser.uid);
      try {
        const userDocSnap = await getDoc(userDocRef);
        if (!userDocSnap.exists()) {
          await setDoc(userDocRef, {
            email: firebaseUser.email,
            name: firebaseUser.displayName,
            role: "pending",
            clinicId: null,
            status: "pending",
            username: null,
            clinicRoles: {},
            activeClinicId: null,
            createdAt: new Date().toISOString(),
            approvedBy: null,
            approvedAt: null,
          });
        }
        unsubDocRef.current = onSnapshot(
          userDocRef,
          { includeMetadataChanges: true },
          (snap) => {
            reportFirestoreMetadata(snap.metadata);
            const next = resolveIdentity(snap.data());
            setIdentity(next);
            if (next.role === "owner") {
              if (!actingHydratedRef.current) {
                actingHydratedRef.current = true;
                setActingClinicIdState(readActingClinic());
              }
            } else {
              clearActingClinic();
            }
            setLoading(false);
          },
          (err) => {
            // Without this the listener can fail silently and leave the app on "Loading...".
            console.error(err);
            setLoading(false);
          }
        );
      } catch (err) {
        console.error(err);
        setLoading(false);
      }
    });
    return () => {
      unsubscribe();
      unsubDocRef.current?.();
    };
  }, [clearActingClinic]);

  useEffect(() => {
    if (identity.role !== "owner" || !actingClinicId) return;
    let cancelled = false;
    getDoc(doc(db, "clinics", actingClinicId))
      .then((snap) => {
        if (cancelled) return;
        const name =
          snap.exists() && typeof snap.data().name === "string" && snap.data().name.trim()
            ? snap.data().name.trim()
            : actingClinicId;
        setActingClinicNames((prev) =>
          prev[actingClinicId] === name ? prev : { ...prev, [actingClinicId]: name }
        );
      })
      .catch((err) => {
        console.error(err);
      });
    return () => {
      cancelled = true;
    };
  }, [identity.role, actingClinicId]);

  const actingClinicName =
    identity.role === "owner" && actingClinicId
      ? (actingClinicNames[actingClinicId] ?? actingClinicId)
      : null;

  /**
   * Switches which clinic the session is scoped to.
   *
   * Staff: only a clinic the account already holds a membership at is accepted,
   * and the legacy top-level fields are rewritten so untouched readers see the
   * same active clinic.
   *
   * Owner: no-op. The owner account must not gain a clinicId on the user
   * document (PRD 3.5). Use setActingClinic instead.
   */
  const setActiveClinic = useCallback(async (nextClinicId: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    if (identity.role === "owner") return;
    const membership = identity.memberships.find((m) => m.clinicId === nextClinicId);
    if (!membership) throw new Error("You are not assigned to that clinic.");
    await updateDoc(doc(db, "users", currentUser.uid), legacyMirror(membership));
    await syncCustomClaims();
    await forceTokenRefresh();
  }, [identity.role, identity.memberships]);

  /**
   * Session-only acting clinic for the owner. Nothing is written to `users/{uid}`.
   * Pass null or an empty string to clear it.
   */
  const setActingClinic = useCallback(
    (clinicId: string | null) => {
      if (identity.role !== "owner") return;
      const next = clinicId && clinicId.trim() ? clinicId.trim() : null;
      actingHydratedRef.current = true;
      setActingClinicIdState(next);
      persistActingClinic(next);
    },
    [identity.role]
  );

  async function login() {
    setPopupBlocked(false);
    setAuthError(null);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      console.error(err);
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code: string }).code)
          : "";
      setPopupBlocked(true);
      setAuthError(SIGN_IN_ERRORS[code] || "Sign-in failed. Click Continue with Google to try again.");
      // A failed popup never triggers onAuthStateChanged, so release the gate here.
      setLoading(false);
    }
  }

  async function logout() {
    clearActingClinic();
    await signOut(auth);
  }

  const exposedActingClinicId = identity.role === "owner" ? actingClinicId : null;

  return (
    <AuthContext.Provider
      value={{
        user,
        role: identity.role,
        clinicId: identity.clinicId,
        actingClinicId: exposedActingClinicId,
        actingClinicName,
        writeClinicId: resolveWriteClinicId(identity.role, identity.clinicId, actingClinicId),
        shift: identity.shift,
        status: identity.status,
        username: identity.username,
        memberships: identity.memberships,
        loading,
        popupBlocked,
        authError,
        login,
        logout,
        setActiveClinic,
        setActingClinic,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
