/**
 * Unsaved result text is held locally so a roster lock cannot discard it.
 * Build preservation before the lock.
 */

export type ResultDraftMap = Record<string, Record<string, string>>;

export type ResultDraft = {
  orderId: string;
  results: ResultDraftMap;
  amendDraft: ResultDraftMap;
  savedAt: string;
};

const KEY = "labflow.resultDrafts";

function readAll(): Record<string, ResultDraft> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, ResultDraft>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function writeAll(all: Record<string, ResultDraft>) {
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    // quota / private mode
  }
}

export function saveResultDraft(draft: ResultDraft) {
  const all = readAll();
  all[draft.orderId] = draft;
  writeAll(all);
}

export function loadResultDraft(orderId: string): ResultDraft | null {
  if (!orderId) return null;
  return readAll()[orderId] ?? null;
}

export function clearResultDraft(orderId: string) {
  const all = readAll();
  if (!(orderId in all)) return;
  delete all[orderId];
  writeAll(all);
}
