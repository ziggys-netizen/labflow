"use client";

import { createContext, useContext, useEffect, useRef, useState } from "react";
import { onAuthStateChanged, signInWithPopup, signOut, User } from "firebase/auth";
import { auth, googleProvider, db } from "./firebase";
import { doc, getDoc, setDoc, onSnapshot } from "firebase/firestore";

interface AuthContextType {
  user: User | null;
  role: string | null;
  clinicId: string | null;
  status: string | null;
  loading: boolean;
  popupBlocked: boolean;
  authError: string | null;
  login: () => Promise<void>;
  logout: () => Promise<void>;
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
  loading: true,
  popupBlocked: false,
  authError: null,
  login: async () => {},
  logout: async () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [role, setRole] = useState<string | null>(null);
  const [clinicId, setClinicId] = useState<string | null>(null);
  const [status, setStatus] = useState<string | null>(null);
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
        setRole(null);
        setClinicId(null);
        setStatus(null);
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
            createdAt: new Date().toISOString(),
            approvedBy: null,
            approvedAt: null,
          });
        }
        unsubDocRef.current = onSnapshot(
          userDocRef,
          (snap) => {
            const data = snap.data();
            if (!data) {
              setRole(null);
              setClinicId(null);
              setStatus(null);
            } else {
              setRole(data.role ?? null);
              setClinicId(data.clinicId ?? null);
              setStatus(data.status ?? "approved");
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
  }, []);

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
      value={{ user, role, clinicId, status, loading, popupBlocked, authError, login, logout }}
    >
      {children}
    </AuthContext.Provider>
  );
}
