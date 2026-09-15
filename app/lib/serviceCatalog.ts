/**
 * Non-lab billable services — consultation, dressing, and the like. A
 * separate list from testCatalog on purpose: a service never becomes an
 * order, never needs a specimen type or an SOP reference, and never enters
 * the sample-collection/results pipeline. It exists only so a cashier has a
 * price to charge and a name to put on a receipt.
 *
 * Maintained by owner/lab_manager (canEditServiceCatalogue) — but cashier may
 * add a brand new entry on the spot while billing (canAddService) and use it
 * immediately, the same shape as an unreviewed test catalogue entry
 * (catalogSeed.ts `isTestReviewed`): real-time work is not blocked, but
 * cashier cannot mark its own entry reviewed, so pricing still gets a second
 * set of eyes and a traceable author. No services are seeded — a clinic's own
 * price list is not something to guess at.
 */

export interface ClinicService {
  code: string;
  name: string;
  price?: number;
  clinicId: string;
  /** false hides it from the cashier's picker without losing history that references it. */
  active?: boolean;
  /** Missing/false is unreviewed — same convention as testCatalog. */
  reviewed?: boolean;
  reviewedAt?: string | null;
  reviewedBy?: string | null;
  /** Who created the row — cashier entries need this to show "Added by cashier" in Settings. */
  addedByRole?: string;
  addedByUid?: string;
  addedAt?: string;
}

export function serviceIsActive(service: Pick<ClinicService, "active">): boolean {
  return service.active !== false;
}

/** Missing `reviewed` is treated as unreviewed — same convention as catalogSeed.ts `isTestReviewed`. */
export function serviceIsReviewed(service: Pick<ClinicService, "reviewed"> | undefined | null): boolean {
  return service?.reviewed === true;
}

export function serviceHasPrice(service: Pick<ClinicService, "price">): boolean {
  return typeof service.price === "number" && Number.isFinite(service.price) && service.price >= 0;
}

export function matchesServiceSearch(service: Pick<ClinicService, "code" | "name">, needle: string): boolean {
  const q = needle.trim().toLowerCase();
  if (!q) return true;
  return service.code.toLowerCase().includes(q) || service.name.toLowerCase().includes(q);
}

/** Deterministic short code from a name, same shape as a generated test code. */
export function generateServiceCode(name: string, existingCodes: string[]): string {
  let base = name
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, 12);
  if (!base) base = "SERVICE";
  if (!existingCodes.includes(base)) return base;
  let n = 2;
  while (existingCodes.includes(`${base}${n}`)) n += 1;
  return `${base}${n}`;
}
