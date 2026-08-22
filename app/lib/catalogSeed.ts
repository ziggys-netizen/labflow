import { collection, doc, getDocs, query, where, writeBatch } from "firebase/firestore";
import { db } from "./firebase";
import { TEST_CATALOG, testsForTier, type LabTest } from "./testCatalog";
import { parseClinicTier, type ClinicTier } from "./resultModel";
import { logAudit, type AuditActor } from "./audit";

export function catalogDocId(clinicId: string, code: string) {
  return `${clinicId}_${code}`;
}

/** Missing `reviewed` is treated as unreviewed — imported or legacy rows were never clinic-approved. */
export function isTestReviewed(test: { reviewed?: boolean } | undefined | null): boolean {
  return test?.reviewed === true;
}

/** Shown next to H/L flags when the clinic has not confirmed seed/import ranges. Does not block release. */
export const UNREVIEWED_RANGE_CAVEAT = "Range not confirmed by this laboratory.";

export function catalogSeedPayload(clinicId: string, test: LabTest, seededAt: string) {
  return {
    code: test.code,
    name: test.name,
    category: test.category,
    specimenType: test.specimenType,
    parameters: test.parameters,
    price: test.price || 0,
    clinicId,
    reviewed: false,
    seededAt,
    seededFrom: "national_tier" as const,
    onNationalMenu: test.onNationalMenu !== false,
    tiers: test.tiers ?? [],
  };
}

async function clinicCatalogDocs(clinicId: string) {
  return getDocs(query(collection(db, "testCatalog"), where("clinicId", "==", clinicId)));
}

/**
 * Copies the product catalogue into a clinic as unreviewed records.
 * Skips document IDs that already exist. When `onlyIfEmpty` is set, does
 * nothing if the clinic already has any catalogue document.
 */
export async function seedClinicCatalog(
  clinicId: string,
  options: { actor?: AuditActor | null; onlyIfEmpty?: boolean; tier?: ClinicTier | null } = {}
): Promise<number> {
  if (!clinicId) return 0;
  const existingSnap = await clinicCatalogDocs(clinicId);
  if (options.onlyIfEmpty && !existingSnap.empty) return 0;

  const existingIds = new Set(existingSnap.docs.map((d) => d.id));
  const seededAt = new Date().toISOString();
  const created: { id: string; code: string }[] = [];
  const batch = writeBatch(db);
  const tier = parseClinicTier(options.tier);
  const source = tier ? testsForTier(tier) : TEST_CATALOG;
  for (const test of source) {
    const id = catalogDocId(clinicId, test.code);
    if (existingIds.has(id)) continue;
    batch.set(doc(db, "testCatalog", id), catalogSeedPayload(clinicId, test, seededAt));
    created.push({ id, code: test.code });
  }
  if (created.length === 0) return 0;
  await batch.commit();

  if (options.actor) {
    try {
      await logAudit({
        clinicId,
        actor: options.actor,
        action: "catalogue.seeded",
        targetCollection: "testCatalog",
        targetId: clinicId,
        targetLabel: `${created.length} default tests`,
        detail: {
          count: created.length,
          seededFrom: "national_tier",
          tier: tier ?? "all",
          codes: created.map((c) => c.code),
        },
      });
    } catch (err) {
      console.error(err);
    }
  }
  return created.length;
}

/** Owner backfill: seed every clinic that has no catalogue documents. */
export async function backfillEmptyClinicCatalogs(
  clinics: { id: string; tier?: ClinicTier | null }[],
  actor: AuditActor
): Promise<{ clinicsSeeded: number; testsCreated: number }> {
  let clinicsSeeded = 0;
  let testsCreated = 0;
  for (const clinic of clinics) {
    const created = await seedClinicCatalog(clinic.id, {
      actor,
      onlyIfEmpty: true,
      tier: clinic.tier,
    });
    if (created > 0) {
      clinicsSeeded += 1;
      testsCreated += created;
    }
  }
  return { clinicsSeeded, testsCreated };
}
