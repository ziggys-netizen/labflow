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

export function clinicCollectionQuery(
  collectionName: string,
  role: string | null,
  clinicId: string | null,
  extra: QueryConstraint[] = []
) {
  const col = collection(db, collectionName);
  // Owner with no acting clinic reads across tenants. Once they pick a clinic
  // in session, queries are scoped the same way staff queries are.
  if (isOwner(role) && !clinicId) {
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
