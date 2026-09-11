"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  getRedirectResult,
  onAuthStateChanged,
  signInWithRedirect,
  signOut,
  User,
} from "firebase/auth";
import { auth, googleProvider, db } from "./firebase";
import { doc, getDoc, getDocFromCache, setDoc, updateDoc, onSnapshot, type DocumentReference } from "firebase/firestore";
import { reportFirestoreMetadata } from "./firestoreConnectivity";
import {
  ClinicMembership,
  EMPTY_IDENTITY,
  ResolvedIdentity,
  legacyMirror,
  resolveIdentity,
} from "./membership";
import { writeClinicId as resolveWriteClinicId } from "./clinicScope";
import { ACCEPTABLE_USE } from "./legal/acceptableUse";
import { isOwnerExemptFromStaffTerms, decideTermsTimeout, staffHasCurrentTerms } from "./legal/termsGate";
import {
  getNewestAcceptedTermsVersion,
  getNewestAcceptedTermsVersionFromCache,
} from "./legal/termsAcceptanceStore";
import { logPermissionsMatrix } from "./permissions";
import { forceTokenRefresh, syncCustomClaims } from "./authApi";
import { sessionAuthInput, type AuthStateInput } from "./authState";

if (process.env.NODE_ENV === "development") {
  logPermissionsMatrix();
}

const ACTING_CLINIC_KEY = "labflow.actingClinicId";

/** Upper bound for any await that can hold the auth loading gate open. */
export const AUTH_BOOTSTRAP_DEADLINE_MS = 8000;

/** Shown when bootstrap times out with no cached user doc. */
export const AUTH_BOOTSTRAP_UNREACHABLE =
  "Cannot reach the server. Sign in once while connected before working offline.";

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
  /**
   * Bootstrap failed to reach the server and no cached identity was available.
   * When set, the loading gate is false — show this message and offer retry.
   */
  bootstrapError: string | null;
  /**
   * Terms acceptance lookup timed out with no cached acceptance. Same copy and
   * Retry as bootstrapError — first login must not open a versionless form.
   */
  termsError: string | null;
  /**
   * True while the session is running on a cached user doc and has not yet
   * confirmed identity with the server.
   */
  authOffline: boolean;
  /** Re-run identity bootstrap for the current Firebase user. */
  retryBootstrap: () => void;
  /**
   * Newest accepted clinic-staff terms version for this user, or null if none.
   * Not used for the owner (exempt).
   */
  acceptedTermsVersion: string | null;
  /**
   * Terms lookup timed out with a cached acceptance. Session may proceed under
   * that version until the network confirms a newer published version.
   */
  termsTimeoutGrace: boolean;
  /** Optimistic: current `ACCEPTABLE_USE.version` is accepted (offline-safe). */
  acceptCurrentTerms: () => void;
  login: () => Promise<void>;
  logout: () => Promise<void>;
  setActiveClinic: (clinicId: string) => Promise<void>;
  setActingClinic: (clinicId: string | null) => void;
}

const SIGN_IN_ERRORS: Record<string, string> = {
  "auth/unauthorized-domain":
    "This domain is not authorised for Google sign-in. Add it under Firebase Authentication settings, then try again.",
  "auth/redirect-cancelled-by-user":
    "Sign-in was cancelled before it finished. Click Continue with Google to try again.",
  "auth/web-storage-unsupported":
    "This browser is blocking the storage Google sign-in needs. Allow cookies for this site, then try again.",
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
  bootstrapError: null,
  termsError: null,
  authOffline: false,
  retryBootstrap: () => {},
  acceptedTermsVersion: null,
  termsTimeoutGrace: false,
  acceptCurrentTerms: () => {},
  login: async () => {},
  logout: async () => {},
  setActiveClinic: async () => {},
  setActingClinic: () => {},
});

export function useAuth() {
  return useContext(AuthContext);
}

/** Auth machine input including the terms layer. PIN/roster stay omitted. */
export function useSessionAuthInput(): AuthStateInput {
  const { user, role, status, clinicId, writeClinicId, acceptedTermsVersion, termsTimeoutGrace } =
    useAuth();
  return useMemo(
    () =>
      sessionAuthInput({
        user,
        role,
        status,
        clinicId,
        writeClinicId,
        acceptedTermsVersion,
        termsTimeoutGrace,
      }),
    [user, role, status, clinicId, writeClinicId, acceptedTermsVersion, termsTimeoutGrace]
  );
}

async function readUserDocFromCache(ref: DocumentReference) {
  try {
    return await getDocFromCache(ref);
  } catch {
    return null;
  }
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [identity, setIdentity] = useState<ResolvedIdentity>(EMPTY_IDENTITY);
  const [actingClinicId, setActingClinicIdState] = useState<string | null>(null);
  const [actingClinicNames, setActingClinicNames] = useState<Record<string, string>>({});
  const [identityLoading, setIdentityLoading] = useState(true);
  const [acceptedTermsVersion, setAcceptedTermsVersion] = useState<string | null>(null);
  const [termsTimeoutGrace, setTermsTimeoutGrace] = useState(false);
  const [termsChecked, setTermsChecked] = useState(false);
  const [popupBlocked, setPopupBlocked] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [bootstrapError, setBootstrapError] = useState<string | null>(null);
  const [termsError, setTermsError] = useState<string | null>(null);
  const [authOffline, setAuthOffline] = useState(false);
  const [bootstrapEpoch, setBootstrapEpoch] = useState(0);
  const unsubDocRef = useRef<(() => void) | null>(null);
  const actingHydratedRef = useRef(false);
  const identityReceivedRef = useRef(false);
  const bootstrapTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const bootstrapGenRef = useRef(0);
  const creatingUserDocRef = useRef(false);

  const clearActingClinic = useCallback(() => {
    actingHydratedRef.current = false;
    setActingClinicIdState(null);
    persistActingClinic(null);
  }, []);

  const clearBootstrapTimer = useCallback(() => {
    if (bootstrapTimerRef.current) {
      clearTimeout(bootstrapTimerRef.current);
      bootstrapTimerRef.current = null;
    }
  }, []);

  const applyIdentity = useCallback(
    (data: Record<string, unknown> | undefined, fromCache: boolean) => {
      const next = resolveIdentity(data);
      setIdentity(next);
      identityReceivedRef.current = true;
      if (isOwnerExemptFromStaffTerms(next.role) || next.status !== "approved" || !next.clinicId) {
        setAcceptedTermsVersion(null);
        setTermsTimeoutGrace(false);
        setTermsChecked(true);
      }
      if (next.role === "owner") {
        if (!actingHydratedRef.current) {
          actingHydratedRef.current = true;
          setActingClinicIdState(readActingClinic());
        }
      } else {
        clearActingClinic();
      }
      setIdentityLoading(false);
      setBootstrapError(null);
      if (fromCache) {
        setAuthOffline(true);
      } else {
        setAuthOffline(false);
      }
    },
    [clearActingClinic]
  );

  const retryBootstrap = useCallback(() => {
    setBootstrapError(null);
    setTermsError(null);
    setAuthOffline(false);
    setIdentityLoading(true);
    setTermsChecked(false);
    setTermsTimeoutGrace(false);
    identityReceivedRef.current = false;
    setBootstrapEpoch((n) => n + 1);
  }, []);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (firebaseUser) => {
      unsubDocRef.current?.();
      unsubDocRef.current = null;
      clearBootstrapTimer();
      creatingUserDocRef.current = false;

      const gen = ++bootstrapGenRef.current;
      setUser(firebaseUser);
      if (!firebaseUser) {
        identityReceivedRef.current = false;
        setIdentity(EMPTY_IDENTITY);
        setAcceptedTermsVersion(null);
        setTermsTimeoutGrace(false);
        setTermsChecked(true);
        setBootstrapError(null);
        setTermsError(null);
        setAuthOffline(false);
        clearActingClinic();
        setIdentityLoading(false);
        return;
      }

      identityReceivedRef.current = false;
      setIdentityLoading(true);
      setTermsChecked(false);
      setBootstrapError(null);
      setTermsError(null);
      setAuthOffline(false);

      bootstrapTimerRef.current = setTimeout(() => {
        if (gen !== bootstrapGenRef.current) return;
        setIdentityLoading(false);
        if (!identityReceivedRef.current) {
          setBootstrapError(AUTH_BOOTSTRAP_UNREACHABLE);
          setTermsChecked(true);
        }
      }, AUTH_BOOTSTRAP_DEADLINE_MS);

      const userDocRef = doc(db, "users", firebaseUser.uid);

      const cachedSnap = await readUserDocFromCache(userDocRef);
      if (gen !== bootstrapGenRef.current) return;
      if (cachedSnap?.exists()) {
        applyIdentity(cachedSnap.data() as Record<string, unknown>, true);
      }

      // Ensure the user doc exists when the server is reachable. Must not gate
      // loading — getDoc/setDoc can hang indefinitely with no network and a cold cache.
      void (async () => {
        try {
          const serverSnap = await getDoc(userDocRef);
          if (gen !== bootstrapGenRef.current) return;
          if (!serverSnap.exists() && !creatingUserDocRef.current) {
            creatingUserDocRef.current = true;
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
        } catch (err) {
          console.error(err);
        }
      })();

      unsubDocRef.current = onSnapshot(
        userDocRef,
        { includeMetadataChanges: true },
        (snap) => {
          if (gen !== bootstrapGenRef.current) return;
          reportFirestoreMetadata(snap.metadata);
          if (!snap.exists()) return;
          applyIdentity(snap.data() as Record<string, unknown>, snap.metadata.fromCache);
        },
        (err) => {
          console.error(err);
          if (gen !== bootstrapGenRef.current) return;
          setIdentityLoading(false);
          setTermsChecked(true);
          if (!identityReceivedRef.current) {
            setBootstrapError(AUTH_BOOTSTRAP_UNREACHABLE);
          }
        }
      );
    });
    return () => {
      unsubscribe();
      unsubDocRef.current?.();
      clearBootstrapTimer();
    };
  }, [applyIdentity, clearActingClinic, clearBootstrapTimer, bootstrapEpoch]);

  // Completes the signInWithRedirect round-trip. onAuthStateChanged above
  // fires independently once Firebase recognises the signed-in user — this
  // effect exists only to surface a failed attempt, which onAuthStateChanged
  // would otherwise leave silent.
  useEffect(() => {
    getRedirectResult(auth).catch((err: unknown) => {
      console.error(err);
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code: string }).code)
          : "";
      setPopupBlocked(true);
      setAuthError(SIGN_IN_ERRORS[code] || "Sign-in failed. Click Continue with Google to try again.");
      setIdentityLoading(false);
      setTermsChecked(true);
    });
  }, []);

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
      // Redirect, not popup: Google's sign-in pages send a Cross-Origin-Opener-Policy
      // header that breaks the window.closed polling signInWithPopup relies on,
      // which surfaced as a false "auth/popup-closed-by-user" on every attempt.
      // The redirect round-trip has no popup window to lose track of. Any
      // failure is reported by getRedirectResult below, after the app reloads.
      await signInWithRedirect(auth, googleProvider);
    } catch (err: unknown) {
      console.error(err);
      const code =
        typeof err === "object" && err !== null && "code" in err
          ? String((err as { code: string }).code)
          : "";
      setPopupBlocked(true);
      setAuthError(SIGN_IN_ERRORS[code] || "Sign-in failed. Click Continue with Google to try again.");
      setIdentityLoading(false);
      setTermsChecked(true);
    }
  }

  async function logout() {
    clearActingClinic();
    await signOut(auth);
  }

  useEffect(() => {
    if (!user) {
      setAcceptedTermsVersion(null);
      setTermsTimeoutGrace(false);
      setTermsChecked(true);
      setTermsError(null);
      return;
    }
    if (isOwnerExemptFromStaffTerms(identity.role) || identity.status !== "approved" || !identity.clinicId) {
      setAcceptedTermsVersion(null);
      setTermsTimeoutGrace(false);
      setTermsChecked(true);
      setTermsError(null);
      return;
    }
    let cancelled = false;
    let settled = false;
    let termsTimer: ReturnType<typeof setTimeout> | null = null;
    setTermsChecked(false);
    setTermsTimeoutGrace(false);
    setTermsError(null);

    const finishResolved = (version: string | null) => {
      if (cancelled || settled) return;
      settled = true;
      if (termsTimer) clearTimeout(termsTimer);
      setAcceptedTermsVersion(version);
      setTermsTimeoutGrace(false);
      setTermsChecked(true);
      setTermsError(null);
    };

    const finishTimeout = (cachedVersion: string | null) => {
      if (cancelled || settled) return;
      settled = true;
      if (termsTimer) clearTimeout(termsTimer);
      const decision = decideTermsTimeout(cachedVersion);
      if (decision.outcome === "proceed") {
        setAcceptedTermsVersion(decision.cachedVersion);
        setTermsTimeoutGrace(!staffHasCurrentTerms(decision.cachedVersion));
        setTermsChecked(true);
        setTermsError(null);
      } else {
        setAcceptedTermsVersion(null);
        setTermsTimeoutGrace(false);
        setTermsChecked(true);
        setTermsError(AUTH_BOOTSTRAP_UNREACHABLE);
      }
    };

    void (async () => {
      // Cache first so a timeout decision never races ahead of IndexedDB.
      const cachedVersion = await getNewestAcceptedTermsVersionFromCache(user.uid);
      if (cancelled) return;
      if (cachedVersion) {
        setAcceptedTermsVersion(cachedVersion);
        if (staffHasCurrentTerms(cachedVersion)) {
          finishResolved(cachedVersion);
          return;
        }
      }

      termsTimer = setTimeout(() => {
        finishTimeout(cachedVersion);
      }, AUTH_BOOTSTRAP_DEADLINE_MS);

      try {
        const version = await getNewestAcceptedTermsVersion(user.uid);
        finishResolved(version);
      } catch (err) {
        console.error(err);
        finishTimeout(cachedVersion);
      }
    })();

    return () => {
      cancelled = true;
      if (termsTimer) clearTimeout(termsTimer);
    };
  }, [user, identity.role, identity.status, identity.clinicId, bootstrapEpoch]);

  const acceptCurrentTerms = useCallback(() => {
    setAcceptedTermsVersion(ACCEPTABLE_USE.version);
    setTermsTimeoutGrace(false);
    setTermsChecked(true);
  }, []);

  const termsPending =
    Boolean(user) &&
    !isOwnerExemptFromStaffTerms(identity.role) &&
    identity.status === "approved" &&
    Boolean(identity.clinicId) &&
    !termsChecked;
  const loading = identityLoading || termsPending;

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
        bootstrapError,
        termsError,
        authOffline,
        retryBootstrap,
        acceptedTermsVersion,
        termsTimeoutGrace,
        acceptCurrentTerms,
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
