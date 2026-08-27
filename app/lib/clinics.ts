import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  updateDoc,
  where,
} from "firebase/firestore";
import { db } from "./firebase";
import { isPatientDeleted } from "./patientSoftDelete";
import { parseClinicTier, type ClinicTier } from "./resultModel";
import { DEFAULT_BREAK_GLASS_MINUTES, DEFAULT_GRACE_MINUTES } from "./roster";
import {
  clinicRetentionWriteFields,
  parseRetentionFromData,
} from "./clinicRetention";

/** Seven health regions used by the Ministry of Health. */
export const GAMBIA_HEALTH_REGIONS = [
  "Banjul",
  "Kanifing",
  "West Coast",
  "North Bank",
  "Lower River",
  "Central River",
  "Upper River",
] as const;

const CODE_CHARS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";

export interface ClinicRecord {
  id: string;
  name: string;
  address: string;
  tin: string;
  businessRegNumber: string;
  responsiblePerson: string;
  joinCode: string;
  createdAt: string;
  active: boolean;
  tier: ClinicTier | null;
  region: string;
  licenceNumber: string;
  licenceExpiry: string;
  idleLockMinutes: number;
  rosteringEnabled: boolean;
  rosterGraceMinutes: number;
  breakGlassMinutes: number;
  /** Clinic-written period. Empty means not set — never a product default. */
  retentionPeriod: string;
  /** Clinic-written basis. Empty means not set. Purge enforcement is later. */
  retentionBasis: string;
}

export function clinicFromData(id: string, data: Record<string, unknown>): ClinicRecord {
  const retention = parseRetentionFromData(data);
  return {
    id,
    name: typeof data.name === "string" ? data.name : "",
    address: typeof data.address === "string" ? data.address : "",
    tin: typeof data.tin === "string" ? data.tin : "",
    businessRegNumber: typeof data.businessRegNumber === "string" ? data.businessRegNumber : "",
    responsiblePerson: typeof data.responsiblePerson === "string" ? data.responsiblePerson : "",
    joinCode: typeof data.joinCode === "string" ? data.joinCode : "",
    createdAt: typeof data.createdAt === "string" ? data.createdAt : "",
    active: data.active !== false,
    tier: parseClinicTier(data.tier),
    region: typeof data.region === "string" ? data.region : "",
    licenceNumber: typeof data.licenceNumber === "string" ? data.licenceNumber : "",
    licenceExpiry: typeof data.licenceExpiry === "string" ? data.licenceExpiry : "",
    idleLockMinutes: typeof data.idleLockMinutes === "number" ? data.idleLockMinutes : 5,
    rosteringEnabled: data.rosteringEnabled === true,
    rosterGraceMinutes:
      typeof data.rosterGraceMinutes === "number" && data.rosterGraceMinutes >= 0
        ? Math.min(180, Math.round(data.rosterGraceMinutes))
        : DEFAULT_GRACE_MINUTES,
    breakGlassMinutes:
      typeof data.breakGlassMinutes === "number" && data.breakGlassMinutes > 0
        ? Math.min(480, Math.round(data.breakGlassMinutes))
        : DEFAULT_BREAK_GLASS_MINUTES,
    retentionPeriod: retention.retentionPeriod,
    retentionBasis: retention.retentionBasis,
  };
}

export async function loadClinic(clinicId: string): Promise<ClinicRecord | null> {
  const snap = await getDoc(doc(db, "clinics", clinicId));
  if (!snap.exists()) return null;
  return clinicFromData(snap.id, snap.data() as Record<string, unknown>);
}

export async function loadAllClinics(): Promise<ClinicRecord[]> {
  const snapshot = await getDocs(collection(db, "clinics"));
  const list = snapshot.docs.map((d) => clinicFromData(d.id, d.data() as Record<string, unknown>));
  list.sort((a, b) => a.name.localeCompare(b.name));
  return list;
}

export function generateJoinCode() {
  let code = "";
  for (let i = 0; i < 7; i++) {
    code += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return code;
}

export async function uniqueJoinCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt++) {
    const code = generateJoinCode();
    const snap = await getDocs(query(collection(db, "clinics"), where("joinCode", "==", code)));
    if (snap.empty) return code;
  }
  throw new Error("Could not generate a unique join code.");
}

function auditFields(actor: { uid: string; email: string | null }) {
  return {
    updatedAt: new Date().toISOString(),
    updatedBy: actor.email,
    updatedByUid: actor.uid,
  };
}

export async function saveClinicProfile(params: {
  clinicId: string;
  name: string;
  address: string;
  tin: string;
  businessRegNumber: string;
  responsiblePerson: string;
  active: boolean;
  tier: ClinicTier | null;
  region: string;
  licenceNumber: string;
  licenceExpiry: string;
  idleLockMinutes: number;
  rosteringEnabled: boolean;
  rosterGraceMinutes: number;
  breakGlassMinutes: number;
  retentionPeriod: string;
  retentionBasis: string;
  actor: { uid: string; email: string | null };
}) {
  const idle =
    typeof params.idleLockMinutes === "number" && params.idleLockMinutes > 0
      ? Math.min(60, Math.round(params.idleLockMinutes))
      : 5;
  const retention = clinicRetentionWriteFields(params.retentionPeriod, params.retentionBasis);
  await updateDoc(doc(db, "clinics", params.clinicId), {
    name: params.name.trim(),
    address: params.address.trim(),
    tin: params.tin.trim(),
    businessRegNumber: params.businessRegNumber.trim(),
    responsiblePerson: params.responsiblePerson.trim(),
    active: params.active,
    tier: params.tier,
    region: params.region.trim(),
    licenceNumber: params.licenceNumber.trim(),
    licenceExpiry: params.licenceExpiry.trim(),
    idleLockMinutes: idle,
    rosteringEnabled: params.rosteringEnabled === true,
    rosterGraceMinutes:
      typeof params.rosterGraceMinutes === "number" && params.rosterGraceMinutes >= 0
        ? Math.min(180, Math.round(params.rosterGraceMinutes))
        : DEFAULT_GRACE_MINUTES,
    breakGlassMinutes:
      typeof params.breakGlassMinutes === "number" && params.breakGlassMinutes > 0
        ? Math.min(480, Math.round(params.breakGlassMinutes))
        : DEFAULT_BREAK_GLASS_MINUTES,
    ...retention,
    ...auditFields(params.actor),
  });
}

export async function regenerateClinicJoinCode(
  clinicId: string,
  actor: { uid: string; email: string | null }
): Promise<string> {
  const joinCode = await uniqueJoinCode();
  await updateDoc(doc(db, "clinics", clinicId), {
    joinCode,
    ...auditFields(actor),
  });
  return joinCode;
}

/** Active (not soft-deleted) patients grouped by clinic. One collection scan. */
export async function loadPatientCountsByClinic(): Promise<Record<string, number>> {
  const snapshot = await getDocs(collection(db, "patients"));
  const counts: Record<string, number> = {};
  for (const d of snapshot.docs) {
    const data = d.data();
    if (isPatientDeleted(data)) continue;
    const clinicId = data.clinicId;
    if (typeof clinicId !== "string" || !clinicId) continue;
    counts[clinicId] = (counts[clinicId] ?? 0) + 1;
  }
  return counts;
}
