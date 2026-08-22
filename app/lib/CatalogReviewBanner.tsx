"use client";

import Link from "next/link";
import { useAuth } from "./AuthContext";
import { useClinicCollection } from "./clinicListen";
import { canEditTestCatalogue } from "./permissions";
import { isTestReviewed } from "./catalogSeed";
import type { LabTest } from "./testCatalog";

export default function CatalogReviewBanner() {
  const { role, clinicId, writeClinicId } = useAuth();
  const scopeId = writeClinicId || clinicId;
  const catalog = useClinicCollection("testCatalog", role, clinicId, {
    sortBy: "name",
    enabled: Boolean(scopeId),
  });

  if (!scopeId) return null;

  const scoped = catalog.docs.filter((d) => (d.data().clinicId as string) === scopeId);
  const count = scoped.filter((d) => !isTestReviewed(d.data() as LabTest)).length;
  if (count === 0) return null;

  return (
    <div className="border-b border-amber-200 bg-amber-50 px-6 py-2">
      <p className="max-w-5xl mx-auto text-sm text-amber-950">
        {count} tests have unconfirmed reference ranges.
        {canEditTestCatalogue(role) ? (
          <>
            {" "}
            <Link href="/settings" className="underline font-medium">
              Review catalogue
            </Link>
          </>
        ) : null}
      </p>
    </div>
  );
}
