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
import { usePathname } from "next/navigation";
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
import { clockDriftWarning, parseServerNow } from "./clockDrift";
import {
  currentRosterShift,
  evaluateRosterAccess,
  isStaffManagementPath,
  type RosterDecision,
} from "./roster";
import {
  activeBreakGlass,
  createBreakGlassSession,
  emptyRosterCache,
  loadClinicRoster,
  readRosterCache,
  writeRosterCache,
  type RosterCache,
} from "./rosterStore";
import { setSessionOffRoster } from "./rosterStamp";
import { justificationError, BREAK_GLASS_CODES } from "./reasonCodes";
import { canManageStaff, isClinicAdmin } from "./permissions";
import { evaluateAuthState, sessionAuthInput } from "./authState";

const SESSION_KEY = "labflow.actingStaff";

type CachedStaff = ActingStaff & { pin: PinRecord | null };

type StaffSessionValue = {
  acting: ActingStaff | null;
  verifiedStaff: ActingStaff | null;
  locked: boolean;
  needsSetup: boolean;
  staffOptions: ActingStaff[];
  ready: boolean;
  rosterDecision: RosterDecision | null;
  staffOnly: boolean;
  offRoster: boolean;
  accessUntil: number | null;
  driftWarning: string | null;
  rosterOffline: boolean;
  unlock: (uid: string, pin: string) => Promise<string | null>;
  lock: () => void;
  setOwnPin: (pin: string) => Promise<string | null>;
  resetStaffPin: (uid: string) => Promise<string | null>;
  confirmSensitivePin: (pin: string, action?: SensitivePinAction) => Promise<string | null>;
  recordActivity: () => void;
  startBreakGlass: (reasonCode: string, note: string) => Promise<string | null>;
  openStaffManagement: () => void;
};

const StaffSessionContext = createContext<StaffSessionValue>({
  acting: null,
  verifiedStaff: null,
  locked: true,
  needsSetup: false,
  staffOptions: [],
  ready: false,
  rosterDecision: null,
  staffOnly: false,
  offRoster: false,
  accessUntil: null,
  driftWarning: null,
  rosterOffline: false,
  unlock: async () => "Not ready",
  lock: () => {},
  setOwnPin: async () => "Not ready",
  resetStaffPin: async () => "Not ready",
  confirmSensitivePin: async () => "Not ready",
  recordActivity: () => {},
  startBreakGlass: async () => "Not ready",
  openStaffManagement: () => {},
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

function decideRoster(
  staff: ActingStaff,
  cache: RosterCache,
  now: Date
): RosterDecision {
  const glass = activeBreakGlass(cache.sessions, staff.uid, now);
  return evaluateRosterAccess({
    now,
    role: staff.role,
    userUid: staff.uid,
    rosteringEnabled: cache.rosteringEnabled,
    clinicEntries: cache.entries,
    userEntries: cache.entries.filter((row) => row.userUid === staff.uid),
    exceptions: cache.exceptions.filter((row) => row.userUid === staff.uid),
    breakGlassUntil: glass ? new Date(glass.endsAt) : null,
  });
}

function withDerivedShift(staff: ActingStaff, cache: RosterCache, decision: RosterDecision): ActingStaff {
  const shift =
    decision.shiftLabel ??
    currentRosterShift(
      cache.entries.filter((row) => row.userUid === staff.uid),
      cache.exceptions.filter((row) => row.userUid === staff.uid),
      new Date(),
      staff.shift
    );
  return { ...staff, shift, offRoster: decision.offRoster };
}

export function StaffSessionProvider({ children }: { children: ReactNode }) {
  const { user, role, clinicId, writeClinicId, shift, username, status } = useAuth();
  const pathname = usePathname() || "";
  const scopeClinic = writeClinicId || clinicId;
  const [roster, setRoster] = useState<CachedStaff[]>([]);
  const [acting, setActing] = useState<ActingStaff | null>(null);
  const [verifiedStaff, setVerifiedStaff] = useState<ActingStaff | null>(null);
  const [lastActivityAt, setLastActivityAt] = useState<number>(() => Date.now());
  const [ready, setReady] = useState(false);
  const [idleMinutes, setIdleMinutes] = useState(DEFAULT_IDLE_LOCK_MINUTES);
  const [rosterCache, setRosterCache] = useState<RosterCache>(emptyRosterCache);
  const [rosterDecision, setRosterDecision] = useState<RosterDecision | null>(null);
  const [staffOnly, setStaffOnly] = useState(false);
  const [accessUntil, setAccessUntil] = useState<number | null>(null);
  const [driftWarning, setDriftWarning] = useState<string | null>(null);
  const [rosterOffline, setRosterOffline] = useState(false);

  const loadPinRoster = useCallback(async () => {
    if (!scopeClinic) {
      setRoster([]);
      setReady(true);
      return;
    }
    const cached = readCache(scopeClinic);
    if (cached.length) setRoster(cached);
    try {
      const snap = await getDocs(query(collection(db, "clinicPins"), where("clinicId", "==", scopeClinic)));
      const rows: CachedStaff[] = snap.docs
        .map((item) => {
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
        })
        .filter((row) => row.uid);
      setRoster(rows);
      writeCache(scopeClinic, rows);
    } catch (err) {
      console.error(err);
    } finally {
      setReady(true);
    }
  }, [scopeClinic]);

  const loadSchedule = useCallback(async () => {
    if (!scopeClinic) {
      setRosterCache(emptyRosterCache());
      return;
    }
    const exceptionUserUid = canManageStaff(role) ? undefined : user?.uid;
    const cached = readRosterCache(scopeClinic, exceptionUserUid);
    if (cached) setRosterCache(cached);
    try {
      const clinic = await loadClinic(scopeClinic);
      if (clinic) {
        setIdleMinutes(clinic.idleLockMinutes);
        const next = await loadClinicRoster(scopeClinic, {
          rosteringEnabled: clinic.rosteringEnabled,
          rosterGraceMinutes: clinic.rosterGraceMinutes,
          breakGlassMinutes: clinic.breakGlassMinutes,
          exceptionUserUid,
        });
        setRosterCache(next);
        setRosterOffline(false);
      }
    } catch (err) {
      console.error(err);
      setRosterOffline(true);
    }
    try {
      const res = await fetch("/api/health");
      const data = (await res.json().catch(() => ({}))) as { serverNow?: unknown };
      setDriftWarning(clockDriftWarning(Date.now(), parseServerNow(data.serverNow)));
    } catch {
      setRosterOffline(true);
    }
  }, [scopeClinic, role, user?.uid]);

  useEffect(() => {
    setReady(false);
    void loadPinRoster();
  }, [loadPinRoster]);

  useEffect(() => {
    void loadSchedule();
  }, [loadSchedule]);

  useEffect(() => {
    const stored = readSession();
    if (stored && (!scopeClinic || stored.clinicId === scopeClinic || stored.clinicId === "platform")) {
      setActing(stored);
      setVerifiedStaff(stored);
    } else {
      setActing(null);
      setVerifiedStaff(null);
    }
  }, [scopeClinic, user?.uid]);

  useEffect(() => {
    if (!verifiedStaff) {
      setRosterDecision(null);
      setAccessUntil(null);
      setSessionOffRoster(false);
      return;
    }
    const decision = decideRoster(verifiedStaff, rosterCache, new Date());
    setRosterDecision(decision);
    setAccessUntil(decision.accessUntil?.getTime() ?? null);
    if (decision.allowed) {
      const next = withDerivedShift(verifiedStaff, rosterCache, decision);
      setActing(next);
      writeSession(next);
      setStaffOnly(false);
      setSessionOffRoster(decision.offRoster);
    } else if (!staffOnly) {
      setActing(null);
      writeSession(null);
      setSessionOffRoster(false);
    }
  }, [verifiedStaff?.uid, rosterCache, staffOnly]);

  const ownRow = roster.find((row) => row.uid === user?.uid) ?? null;
  const skipPin = !evaluateAuthState(
    sessionAuthInput({ user, role, status, clinicId, writeClinicId })
  ).pinApplies;
  const needsSetup = !skipPin && !!user && !ownRow?.pin;
  const idle = isIdleLocked(lastActivityAt, Date.now(), idleMinutes);
  const staffExempt =
    staffOnly &&
    isClinicAdmin(verifiedStaff?.role) &&
    isStaffManagementPath(pathname);
  const rosterBlocked = !skipPin && !!rosterDecision && !rosterDecision.allowed && !staffExempt;
  const locked = !skipPin && !needsSetup && (!acting || idle || rosterBlocked);

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
    setVerifiedStaff(null);
    setRosterDecision(null);
    setStaffOnly(false);
    setAccessUntil(null);
    setSessionOffRoster(false);
    writeSession(null);
  }, []);

  useEffect(() => {
    if (!accessUntil || skipPin) return;
    const timer = window.setInterval(() => {
      if (Date.now() >= accessUntil) lock();
    }, 5_000);
    return () => window.clearInterval(timer);
  }, [accessUntil, skipPin, lock]);

  const applyUnlocked = useCallback(
    (staff: ActingStaff) => {
      const decision = decideRoster(staff, rosterCache, new Date());
      const next = withDerivedShift(staff, rosterCache, decision);
      setVerifiedStaff(next);
      setRosterDecision(decision);
      setLastActivityAt(Date.now());
      if (decision.allowed) {
        setActing(next);
        writeSession(next);
        setStaffOnly(false);
        setAccessUntil(decision.accessUntil?.getTime() ?? null);
        setSessionOffRoster(decision.offRoster);
      } else {
        setActing(null);
        writeSession(null);
        setStaffOnly(false);
        setAccessUntil(null);
        setSessionOffRoster(false);
      }
    },
    [rosterCache]
  );

  const unlock = useCallback(
    async (uid: string, pin: string) => {
      const row = roster.find((item) => item.uid === uid);
      if (!row?.pin) return "That staff member has not set a PIN on this device.";
      if (!(await verifyPin(pin, row.pin))) return "Incorrect PIN.";
      applyUnlocked({
        uid: row.uid,
        email: row.email,
        displayName: row.displayName,
        role: row.role,
        shift: row.shift,
        clinicId: row.clinicId,
      });
      return null;
    },
    [roster, applyUnlocked]
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
      applyUnlocked({
        uid: staff.uid,
        email: staff.email,
        displayName: staff.displayName,
        role: staff.role,
        shift: staff.shift,
        clinicId: staff.clinicId,
      });
      return null;
    },
    [roster, user, scopeClinic, username, role, shift, applyUnlocked]
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
      if (acting?.uid === uid || verifiedStaff?.uid === uid) {
        lock();
      }
      return null;
    },
    [acting, verifiedStaff, roster, scopeClinic, user, role, shift, lock]
  );

  const confirmSensitivePin = useCallback(
    async (pin: string, action?: SensitivePinAction) => {
      if (!acting && !verifiedStaff) return "Unlock first.";
      const person = acting ?? verifiedStaff;
      if (!person) return "Unlock first.";
      const row = roster.find((item) => item.uid === person.uid);
      if (!row?.pin) return "PIN is not available offline for this person.";
      if (!(await verifyPin(pin, row.pin))) return "Incorrect PIN.";
      const decision = decideRoster(person, rosterCache, new Date());
      const staffAction = action === "staff" && isClinicAdmin(person.role);
      if (!decision.allowed && !staffAction) {
        return decision.message || "You are outside your roster window.";
      }
      setLastActivityAt(Date.now());
      return null;
    },
    [acting, verifiedStaff, roster, rosterCache]
  );

  const startBreakGlass = useCallback(
    async (reasonCode: string, note: string) => {
      const person = verifiedStaff;
      if (!person || !scopeClinic) return "Unlock with your PIN first.";
      const error = justificationError(BREAK_GLASS_CODES, reasonCode, note);
      if (error) return error;
      let session;
      try {
        session = await createBreakGlassSession({
          clinicId: scopeClinic,
          userUid: person.uid,
          displayName: person.displayName,
          reasonCode,
          note: note.trim() || null,
          minutes: rosterCache.breakGlassMinutes,
          createdByUid: person.uid,
        });
      } catch (err) {
        console.error(err);
        const startsAt = new Date();
        const endsAt = new Date(startsAt.getTime() + rosterCache.breakGlassMinutes * 60 * 1000);
        session = {
          id: `local-${startsAt.getTime()}`,
          clinicId: scopeClinic,
          userUid: person.uid,
          displayName: person.displayName,
          reasonCode,
          note: note.trim() || null,
          startsAt: startsAt.toISOString(),
          endsAt: endsAt.toISOString(),
          createdByUid: person.uid,
          createdAt: startsAt.toISOString(),
        };
      }
      const nextCache: RosterCache = {
        ...rosterCache,
        sessions: [...rosterCache.sessions.filter((row) => row.id !== session.id), session],
      };
      setRosterCache(nextCache);
      writeRosterCache(scopeClinic, nextCache, canManageStaff(role) ? undefined : user?.uid);
      const next = { ...person, offRoster: true };
      setVerifiedStaff(next);
      setActing(next);
      writeSession(next);
      setStaffOnly(false);
      setAccessUntil(Date.parse(session.endsAt));
      setSessionOffRoster(true);
      setRosterDecision(
        decideRoster(next, nextCache, new Date())
      );
      const actor = actorFromAuth(
        { uid: person.uid, email: person.email },
        person.role,
        person.shift
      );
      if (actor) {
        await safeLogAudit({
          clinicId: scopeClinic,
          actor: { ...actor, offRoster: true },
          action: "roster.breakGlass",
          targetCollection: "rosterSessions",
          targetId: session.id,
          targetLabel: person.displayName,
          offRoster: true,
          detail: { reasonCode, note: note.trim() || null },
        });
      }
      setLastActivityAt(Date.now());
      return null;
    },
    [verifiedStaff, scopeClinic, rosterCache, role, user]
  );

  const openStaffManagement = useCallback(() => {
    if (!isClinicAdmin(verifiedStaff?.role)) return;
    setStaffOnly(true);
    setActing(verifiedStaff);
    writeSession(verifiedStaff);
    setSessionOffRoster(false);
  }, [verifiedStaff]);

  const value = useMemo<StaffSessionValue>(
    () => ({
      acting: locked || needsSetup ? null : acting,
      verifiedStaff,
      locked: skipPin ? false : locked,
      needsSetup: skipPin ? false : needsSetup,
      staffOptions: roster.map(({ pin: _pin, ...staff }) => staff),
      ready,
      rosterDecision: skipPin ? null : rosterDecision,
      staffOnly,
      offRoster: !locked && (acting?.offRoster === true || rosterDecision?.offRoster === true),
      accessUntil,
      driftWarning,
      rosterOffline,
      unlock,
      lock,
      setOwnPin,
      resetStaffPin,
      confirmSensitivePin,
      recordActivity,
      startBreakGlass,
      openStaffManagement,
    }),
    [
      acting,
      verifiedStaff,
      locked,
      needsSetup,
      skipPin,
      roster,
      ready,
      rosterDecision,
      staffOnly,
      accessUntil,
      driftWarning,
      rosterOffline,
      unlock,
      lock,
      setOwnPin,
      resetStaffPin,
      confirmSensitivePin,
      recordActivity,
      startBreakGlass,
      openStaffManagement,
    ]
  );

  return <StaffSessionContext.Provider value={value}>{children}</StaffSessionContext.Provider>;
}

/** Writes and audit use the PIN identity when unlocked, else the device account. */
export function useWriteIdentity() {
  const { user, role, shift, username, writeClinicId } = useAuth();
  const { acting, offRoster } = useStaffSession();
  const pinActive = acting != null;
  const pinUid = acting?.uid ?? null;
  const pinEmail = acting?.email ?? null;
  const pinRole = acting?.role ?? null;
  const pinShift = acting?.shift ?? null;
  const pinName = acting?.displayName ?? null;
  const pinClinicId = acting?.clinicId ?? null;
  const accountUid = user?.uid || "";
  const accountEmail = user?.email ?? null;

  return useMemo(() => {
    // Clinic / acting-owner are not returned, but must still invalidate the
    // identity object when the write scope changes.
    void pinClinicId;
    void writeClinicId;
    if (pinActive) {
      return {
        uid: pinUid || "",
        email: pinEmail,
        role: pinRole,
        shift: pinShift,
        username: pinName,
        offRoster,
      };
    }
    return {
      uid: accountUid,
      email: accountEmail,
      role,
      shift,
      username,
      offRoster: false,
    };
  }, [
    pinActive,
    pinUid,
    pinEmail,
    pinRole,
    pinShift,
    pinName,
    pinClinicId,
    offRoster,
    accountUid,
    accountEmail,
    role,
    shift,
    username,
    writeClinicId,
  ]);
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
