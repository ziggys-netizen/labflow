/** Resolve a display name from the patient document. Never from order.patientName. */

export function patientDisplayName(
  data: { name?: unknown; preferredName?: unknown } | null | undefined
): string {
  if (!data) return "";
  const preferred = typeof data.preferredName === "string" ? data.preferredName.trim() : "";
  const name = typeof data.name === "string" ? data.name.trim() : "";
  return preferred || name;
}

export function resolvePatientNameById(
  patientId: string | null | undefined,
  patientsById: Map<string, { name?: unknown; preferredName?: unknown }>
): string {
  if (!patientId) return "";
  return patientDisplayName(patientsById.get(patientId));
}

export function patientsByIdFromDocs(
  docs: { id: string; data: () => Record<string, unknown> }[]
): Map<string, { name?: unknown; preferredName?: unknown }> {
  const map = new Map<string, { name?: unknown; preferredName?: unknown }>();
  for (const d of docs) {
    map.set(d.id, d.data());
  }
  return map;
}
