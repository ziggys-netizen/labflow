"use client";

import Link from "next/link";
import { useMemo } from "react";
import { useAuth } from "./AuthContext";
import { useClinicCollection } from "./clinicListen";
import { canViewInventory } from "./permissions";
import { mapBatch, mapItem, mapMovement, stockLevel } from "./inventory";
import { usableOnHandByItem } from "./storekeeperBoard";
import { reorderBannerText } from "./lowStock";

/**
 * Live reorder warning for the roles that can act on it. Read from the ledger
 * rather than from the nightly digest's stored state, so emptying a shelf shows
 * here at once instead of tomorrow morning.
 */
export default function LowStockBanner() {
  const { role, clinicId, writeClinicId } = useAuth();
  const scopeId = writeClinicId || clinicId;
  const enabled = canViewInventory(role) && Boolean(scopeId);

  const itemsQuery = useClinicCollection("inventoryItems", role, clinicId, { enabled });
  const batchesQuery = useClinicCollection("inventoryBatches", role, clinicId, { enabled });
  const movementsQuery = useClinicCollection("inventoryMovements", role, clinicId, { enabled });

  const counts = useMemo(() => {
    if (!enabled || !scopeId) return { outCount: 0, lowCount: 0 };
    const items = itemsQuery.docs.map(mapItem).filter((item) => item.clinicId === scopeId);
    const batches = batchesQuery.docs.map(mapBatch).filter((b) => b.clinicId === scopeId);
    const movements = movementsQuery.docs.map(mapMovement).filter((m) => m.clinicId === scopeId);
    const onHandByItem = usableOnHandByItem(batches, movements, new Date());

    let outCount = 0;
    let lowCount = 0;
    for (const item of items) {
      if (item.active === false) continue;
      const level = stockLevel(onHandByItem.get(item.id) ?? 0, item.minimumStock);
      if (level === "out") outCount += 1;
      else if (level === "low") lowCount += 1;
    }
    return { outCount, lowCount };
  }, [enabled, scopeId, itemsQuery.docs, batchesQuery.docs, movementsQuery.docs]);

  if (!enabled) return null;
  const message = reorderBannerText(counts.outCount, counts.lowCount);
  if (!message) return null;

  // Out of stock is red, low is amber, and both spell the state out in words —
  // colour is never the only carrier of meaning.
  const urgent = counts.outCount > 0;
  const tone = urgent
    ? "border-red-200 bg-red-50 text-red-950"
    : "border-amber-200 bg-amber-50 text-amber-950";

  return (
    <div className={`border-b px-6 py-2 ${tone}`}>
      <p className="max-w-5xl mx-auto text-sm">
        <span className={urgent ? "font-bold" : "font-medium"}>{message}</span>{" "}
        <Link href="/inventory" className="underline font-medium">
          Open store
        </Link>
      </p>
    </div>
  );
}
