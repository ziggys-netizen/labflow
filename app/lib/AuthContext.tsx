"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { auth, googleProvider, db } from "./firebase";
import { doc, getDoc, setDoc, updateDoc, onSnapshot } from "firebase/firestore";
import {
  ClinicMembership,
  EMPTY_IDENTITY,
  ResolvedIdentity,
  legacyMirror,
  resolveIdentity,
} from "./membership";

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

function writeActingClinic(clinicId: string | null) {
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
   * The clinic this session is scoped to. For staff this is their membership.
   * For the owner this is a session-only acting clinic — never written onto the
   * user document (PRD 3.5).
   */
  clinicId: string | null;
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
  status: null,
  username: null,
  memberships: [],
  loading: true,
  popupBlocked: false,
  authError: null,
  login: async () => {},
  logout: async () => {},
  setActiveClinic: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [identity, setIdentity] = useState<ResolvedIdentity>(EMPTY_IDENTITY);
  const [actingClinicId, setActingClinicId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const unsubDocRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      unsubDocRef.current?.();
      unsubDocRef.current = null;

      setUser(firebaseUser);
      if (!firebaseUser) {
        setIdentity(EMPTY_IDENTITY);
        setActingClinicId(null);
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
          (snap) => {
            const next = resolveIdentity(snap.data());
            setIdentity(next);
            setActingClinicId(next.role === "owner" ? readActingClinic() : null);
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
  }, []);

  /**
   * Switches which clinic the session is scoped to.
   *
   * Staff: only a clinic the account already holds a membership at is accepted,
   * and the legacy top-level fields are rewritten so untouched readers see the
   * same active clinic.
   *
   * Owner: session-only acting clinic. Nothing is written to `users/{uid}` —
   * PRD 3.5 forbids assigning the owner account to a clinic role. Pass an
   * empty string to clear the acting clinic and read across all clinics again.
   */
  const setActiveClinic = useCallback(async (nextClinicId: string) => {
    const currentUser = auth.currentUser;
    if (!currentUser) return;
    if (identity.role === "owner") {
      const next = nextClinicId.trim() ? nextClinicId.trim() : null;
      setActingClinicId(next);
      writeActingClinic(next);
      return;
    }
    const membership = identity.memberships.find((m) => m.clinicId === nextClinicId);
    if (!membership) throw new Error("You are not assigned to that clinic.");
    await updateDoc(doc(db, "users", currentUser.uid), legacyMirror(membership));
  }, [identity.role, identity.memberships]);

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
    await signOut(auth);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        role: identity.role,
        clinicId: identity.role === "owner" ? actingClinicId : identity.clinicId,
        status: identity.status,
        username: identity.username,
        memberships: identity.memberships,
        loading,
        popupBlocked,
        authError,
        login,
        logout,
        setActiveClinic,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
