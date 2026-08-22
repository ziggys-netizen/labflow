"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { collection, doc, getDocs, query, setDoc, where } from "firebase/firestore";
import { db } from "./firebase";
import { useAuth } from "./AuthContext";
import { loadClinic } from "./clinics";
import {
  clinicPinDocId,
  DEFAULT_IDLE_LOCK_MINUTES,
  hashPin,
  isIdleLocked,
  parsePinRecord,
  pinFormatError,
  pinResetPayload,
  verifyPin,
  type ActingStaff,
  type PinRecord,
  type SensitivePinAction,
} from "./pinIdentity";
import { actorFromAuth, safeLogAudit } from "./audit";

const SESSION_KEY = "labflow.actingStaff";

type CachedStaff = ActingStaff & { pin: PinRecord | null };

type StaffSessionValue = {
  acting: ActingStaff | null;
  locked: boolean;
  needsSetup: boolean;
  staffOptions: ActingStaff[];
  ready: boolean;
  unlock: (uid: string, pin: string) => Promise<string | null>;
  lock: () => void;
  setOwnPin: (pin: string) => Promise<string | null>;
  resetStaffPin: (uid: string) => Promise<string | null>;
  confirmSensitivePin: (pin: string) => Promise<string | null>;
  recordActivity: () => void;
};

const StaffSessionContext = createContext<StaffSessionValue>({
  acting: null,
  locked: true,
  needsSetup: false,
  staffOptions: [],
  ready: false,
  unlock: async () => "Not ready",
  lock: () => {},
  setOwnPin: async () => "Not ready",
  resetStaffPin: async () => "Not ready",
  confirmSensitivePin: async () => "Not ready",
  recordActivity: () => {},
});

export function useStaffSession() {
  return useContext(StaffSessionContext);
}

function readSession(): ActingStaff | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(SESSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActingStaff;
    return parsed?.uid ? parsed : null;
  } catch {
    return null;
  }
}

function writeSession(staff: ActingStaff | null) {
  try {
    if (staff) sessionStorage.setItem(SESSION_KEY, JSON.stringify(staff));
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    // private mode
  }
}

function cacheKey(clinicId: string) {
  return `labflow.pinCache.${clinicId}`;
}

function readCache(clinicId: string): CachedStaff[] {
  try {
    const raw = localStorage.getItem(cacheKey(clinicId));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as CachedStaff[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function writeCache(clinicId: string, rows: CachedStaff[]) {
  try {
    localStorage.setItem(cacheKey(clinicId), JSON.stringify(rows));
  } catch {
    // quota
  }
}

export function StaffSessionProvider({ children }: { children: ReactNode }) {
  const { user, role, clinicId, writeClinicId, shift, username, status } = useAuth();
  const scopeClinic = writeClinicId || clinicId;
  const [roster, setRoster] = useState<CachedStaff[]>([]);
  const [acting, setActing] = useState<ActingStaff | null>(null);
  const [lastActivityAt, setLastActivityAt] = useState<number>(() => Date.now());
  const [ready, setReady] = useState(false);
  const [idleMinutes, setIdleMinutes] = useState(DEFAULT_IDLE_LOCK_MINUTES);

  const loadRoster = useCallback(async () => {
    if (!scopeClinic) {
      setRoster([]);
      setReady(true);
      return;
    }
    const cached = readCache(scopeClinic);
    if (cached.length) setRoster(cached);
    try {
      const snap = await getDocs(query(collection(db, "clinicPins"), where("clinicId", "==", scopeClinic)));
      const rows: CachedStaff[] = snap.docs.map((item) => {
        const data = item.data();
        return {
          uid: String(data.uid || ""),
          email: typeof data.email === "string" ? data.email : null,
          displayName: typeof data.displayName === "string" ? data.displayName : String(data.uid || ""),
          role: typeof data.role === "string" ? data.role : null,
          shift: typeof data.shift === "string" ? data.shift : null,
          clinicId: scopeClinic,
          pin: parsePinRecord(data.pin),
        };
      }).filter((row) => row.uid);
      setRoster(rows);
      writeCache(scopeClinic, rows);
    } catch (err) {
      console.error(err);
    } finally {
      setReady(true);
    }
  }, [scopeClinic]);

  useEffect(() => {
    setReady(false);
    void loadRoster();
  }, [loadRoster]);

  useEffect(() => {
    if (!scopeClinic) {
      setIdleMinutes(DEFAULT_IDLE_LOCK_MINUTES);
      return;
    }
    let cancelled = false;
    loadClinic(scopeClinic)
      .then((clinic) => {
        if (!cancelled && clinic) setIdleMinutes(clinic.idleLockMinutes);
      })
      .catch((err) => console.error(err));
    return () => {
      cancelled = true;
    };
  }, [scopeClinic]);

  useEffect(() => {
    const stored = readSession();
    if (stored && (!scopeClinic || stored.clinicId === scopeClinic || stored.clinicId === "platform")) {
      setActing(stored);
    } else {
      setActing(null);
    }
  }, [scopeClinic, user?.uid]);

  const ownRow = roster.find((row) => row.uid === user?.uid) ?? null;
  const skipPin =
    !user || status === "pending" || status === "rejected" || !scopeClinic;
  const needsSetup = !skipPin && !!user && !ownRow?.pin;
  const idle = isIdleLocked(lastActivityAt, Date.now(), idleMinutes);
  const locked = !skipPin && !needsSetup && (!acting || idle);

  const recordActivity = useCallback(() => {
    setLastActivityAt(Date.now());
  }, []);

  useEffect(() => {
    if (skipPin) return;
    const onActivity = () => setLastActivityAt(Date.now());
    window.addEventListener("pointerdown", onActivity);
    window.addEventListener("keydown", onActivity);
    const timer = window.setInterval(() => {
      setLastActivityAt((prev) => prev);
    }, 15_000);
    return () => {
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.clearInterval(timer);
    };
  }, [skipPin]);

  const lock = useCallback(() => {
    setActing(null);
    writeSession(null);
  }, []);

  const unlock = useCallback(
    async (uid: string, pin: string) => {
      const row = roster.find((item) => item.uid === uid);
      if (!row?.pin) return "That staff member has not set a PIN on this device.";
      if (!(await verifyPin(pin, row.pin))) return "Incorrect PIN.";
      const next: ActingStaff = {
        uid: row.uid,
        email: row.email,
        displayName: row.displayName,
        role: row.role,
        shift: row.shift,
        clinicId: row.clinicId,
      };
      setActing(next);
      writeSession(next);
      setLastActivityAt(Date.now());
      return null;
    },
    [roster]
  );

  const setOwnPin = useCallback(
    async (pin: string) => {
      const format = pinFormatError(pin);
      if (format) return format;
      if (!user) return "Not signed in.";
      const clinic = scopeClinic || "platform";
      const record = await hashPin(pin);
      const staff: CachedStaff = {
        uid: user.uid,
        email: user.email,
        displayName: username || user.email || user.uid,
        role,
        shift,
        clinicId: clinic,
        pin: record,
      };
      try {
        await setDoc(doc(db, "clinicPins", clinicPinDocId(clinic, user.uid)), {
          uid: user.uid,
          email: user.email,
          displayName: staff.displayName,
          role,
          shift,
          clinicId: clinic,
          pin: record,
          pinSetAt: record.setAt,
        });
        await setDoc(doc(db, "users", user.uid), { pinSet: true }, { merge: true });
        const actor = actorFromAuth(user, role, shift);
        if (actor) {
          await safeLogAudit({
            clinicId: scopeClinic,
            actor,
            action: "staff.pinSet",
            targetCollection: "clinicPins",
            targetId: user.uid,
            targetLabel: clinicPinDocId(clinic, user.uid),
          });
        }
      } catch (err) {
        console.error(err);
        // Still cache locally so unlock works offline after first set.
      }
      const nextRoster = [...roster.filter((row) => row.uid !== user.uid), staff];
      setRoster(nextRoster);
      if (scopeClinic) writeCache(scopeClinic, nextRoster);
      setActing({
        uid: staff.uid,
        email: staff.email,
        displayName: staff.displayName,
        role: staff.role,
        shift: staff.shift,
        clinicId: staff.clinicId,
      });
      writeSession({
        uid: staff.uid,
        email: staff.email,
        displayName: staff.displayName,
        role: staff.role,
        shift: staff.shift,
        clinicId: staff.clinicId,
      });
      setLastActivityAt(Date.now());
      return null;
    },
    [roster, user, scopeClinic, username, role, shift]
  );

  const resetStaffPin = useCallback(
    async (uid: string) => {
      if (!scopeClinic) return "No clinic selected.";
      if (!uid) return "Choose a staff member.";
      try {
        await setDoc(
          doc(db, "clinicPins", clinicPinDocId(scopeClinic, uid)),
          { uid, clinicId: scopeClinic, ...pinResetPayload() },
          { merge: true }
        );
        await setDoc(doc(db, "users", uid), { pinSet: false }, { merge: true });
        const actor = actorFromAuth(user, role, shift);
        if (actor) {
          await safeLogAudit({
            clinicId: scopeClinic,
            actor,
            action: "staff.pinReset",
            targetCollection: "clinicPins",
            targetId: uid,
            targetLabel: clinicPinDocId(scopeClinic, uid),
          });
        }
      } catch (err) {
        console.error(err);
        return "Could not reset that PIN.";
      }
      const nextRoster = roster.map((row) => (row.uid === uid ? { ...row, pin: null } : row));
      setRoster(nextRoster);
      writeCache(scopeClinic, nextRoster);
      if (acting?.uid === uid) {
        setActing(null);
        writeSession(null);
      }
      return null;
    },
    [acting, roster, scopeClinic, user, role, shift]
  );

  const confirmSensitivePin = useCallback(
    async (pin: string) => {
      if (!acting) return "Unlock first.";
      const row = roster.find((item) => item.uid === acting.uid);
      if (!row?.pin) return "PIN is not available offline for this person.";
      if (!(await verifyPin(pin, row.pin))) return "Incorrect PIN.";
      setLastActivityAt(Date.now());
      return null;
    },
    [acting, roster]
  );

  const value = useMemo<StaffSessionValue>(
    () => ({
      acting: locked || needsSetup ? null : acting,
      locked: skipPin ? false : locked,
      needsSetup: skipPin ? false : needsSetup,
      staffOptions: roster.map(({ pin: _pin, ...staff }) => staff),
      ready,
      unlock,
      lock,
      setOwnPin,
      resetStaffPin,
      confirmSensitivePin,
      recordActivity,
    }),
    [
      acting,
      locked,
      needsSetup,
      skipPin,
      roster,
      ready,
      unlock,
      lock,
      setOwnPin,
      resetStaffPin,
      confirmSensitivePin,
      recordActivity,
    ]
  );

  return <StaffSessionContext.Provider value={value}>{children}</StaffSessionContext.Provider>;
}

/** Writes and audit use the PIN identity when unlocked, else the device account. */
export function useWriteIdentity() {
  const { user, role, shift, username } = useAuth();
  const { acting } = useStaffSession();
  if (acting) {
    return {
      uid: acting.uid,
      email: acting.email,
      role: acting.role,
      shift: acting.shift,
      username: acting.displayName,
    };
  }
  return {
    uid: user?.uid || "",
    email: user?.email ?? null,
    role,
    shift,
    username,
  };
}

export function sensitiveActionLabel(action: SensitivePinAction): string {
  switch (action) {
    case "release":
      return "release results";
    case "amendment":
      return "amend a released result";
    case "erasure":
      return "erase a record";
    case "export":
      return "export data";
    case "staff":
      return "change staff";
  }
}
