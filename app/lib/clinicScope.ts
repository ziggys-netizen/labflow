import {
  collection,
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
