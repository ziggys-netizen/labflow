import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  where,
  QueryConstraint,
  QueryDocumentSnapshot,
} from "firebase/firestore";
import { db } from "./firebase";

export function isOwner(role: string | null | undefined) {
  return role === "owner";
}

/**
 * Clinic new records must land in. Owner uses the session acting clinic;
 * everyone else uses their membership clinic. Never pass this into
 * `getClinicDocs` / `clinicCollectionQuery` — those take the membership
 * clinic so owner list queries stay unfiltered.
 */
export function writeClinicId(
  role: string | null | undefined,
  membershipClinicId: string | null,
  actingClinicId: string | null
): string | null {
  return isOwner(role) ? actingClinicId : membershipClinicId;
}

/** Stamped onto records the owner creates while acting in a clinic. */
export function ownerActingCreateFields(role: string | null | undefined): {
  createdByRole: "owner";
  actingAsOwner: true;
} | Record<string, never> {
  if (!isOwner(role)) return {};
  return { createdByRole: "owner", actingAsOwner: true };
}

/** Stamped onto result reviews the owner performs. */
export function ownerActingReviewFields(role: string | null | undefined): {
  actingAsOwner: true;
} | Record<string, never> {
  if (!isOwner(role)) return {};
  return { actingAsOwner: true };
}

export function clinicCollectionQuery(
  collectionName: string,
  role: string | null,
  clinicId: string | null,
  extra: QueryConstraint[] = []
) {
  const col = collection(db, collectionName);
  // Owner reads stay unfiltered. Acting clinic is session-only and is used
  // on write paths via writeClinicId — do not scope this branch to it.
  if (isOwner(role)) {
    return extra.length ? query(col, ...extra) : query(col);
  }
  if (!clinicId) {
    return query(col, where("clinicId", "==", "__none__"));
  }
  return query(col, where("clinicId", "==", clinicId), ...extra);
}

/**
 * Fetches clinic-scoped docs and sorts them in memory. Sorting here rather than
 * with orderBy keeps the query to equality filters only, which Firestore serves
 * from its automatic single-field indexes — a clinicId filter combined with an
 * orderBy would need a composite index deployed to the project first.
 *
 * Pass the membership clinic (`useAuth().clinicId`), never writeClinicId /
 * actingClinicId. Owner list queries stay unfiltered.
 */
export async function getClinicDocs(
  collectionName: string,
  role: string | null,
  clinicId: string | null,
  options: {
    filters?: QueryConstraint[];
    sortBy?: string;
    direction?: "asc" | "desc";
  } = {}
): Promise<QueryDocumentSnapshot[]> {
  const { filters = [], sortBy, direction = "asc" } = options;
  const snapshot = await getDocs(clinicCollectionQuery(collectionName, role, clinicId, filters));
  const docs = [...snapshot.docs];
  if (!sortBy) return docs;

  const factor = direction === "desc" ? -1 : 1;
  return docs.sort((a, b) => {
    const av = a.get(sortBy);
    const bv = b.get(sortBy);
    if (av === bv) return 0;
    if (av === undefined || av === null) return 1;
    if (bv === undefined || bv === null) return -1;
    return (av < bv ? -1 : 1) * factor;
  });
}

/**
 * Clinic ID to clinic name, for labelling records without leaking the existence
 * of other clinics: the owner reads every clinic, anyone else reads only the
 * clinics they are scoped to.
 */
export async function loadClinicNames(
  role: string | null,
  clinicIds: (string | null)[]
): Promise<Record<string, string>> {
  const names: Record<string, string> = {};
  if (isOwner(role)) {
    const snapshot = await getDocs(collection(db, "clinics"));
    for (const d of snapshot.docs) names[d.id] = (d.data().name as string) || d.id;
    return names;
  }
  const unique = [...new Set(clinicIds.filter((id): id is string => !!id))];
  const snaps = await Promise.all(unique.map((id) => getDoc(doc(db, "clinics", id))));
  snaps.forEach((snap, index) => {
    names[unique[index]] = snap.exists() ? (snap.data().name as string) || unique[index] : unique[index];
  });
  return names;
}
