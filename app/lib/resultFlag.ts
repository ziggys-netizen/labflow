export type ResultFlag = "H" | "L" | null;

function parseNumeric(raw: string): number | null {
  const text = raw.trim().replace(/,/g, "");
  if (!text || text === "—" || text === "-" || text === "–") return null;
  if (/^\d+:\d+$/.test(text)) return null;
  const value = Number(text);
  return Number.isFinite(value) ? value : null;
}

function sexKey(sex: string | null | undefined): "M" | "F" | null {
  const normalized = (sex || "").trim().toLowerCase();
  if (normalized === "m" || normalized === "male") return "M";
  if (normalized === "f" || normalized === "female") return "F";
  return null;
}

function rangeTextForSex(referenceRange: string, sex: string | null | undefined): string | null {
  const male = referenceRange.match(/M:\s*([^,]+)/i);
  const female = referenceRange.match(/F:\s*([^,]+)/i);
  if (!male && !female) return referenceRange;
  const key = sexKey(sex);
  if (key === "M" && male) return male[1];
  if (key === "F" && female) return female[1];
  return null;
}

function parseBounds(text: string): { low: number | null; high: number | null; highInclusive: boolean; lowInclusive: boolean } | null {
  if (/\d+:\d+/.test(text)) return null;
  const cleaned = text.replace(/\(.*?\)/g, " ").trim();
  const between = cleaned.match(/(-?\d+(?:\.\d+)?)\s*(?:[-–—]|to)\s*(-?\d+(?:\.\d+)?)/i);
  if (between) {
    return {
      low: Number(between[1]),
      high: Number(between[2]),
      highInclusive: true,
      lowInclusive: true,
    };
  }
  const lte = cleaned.match(/≤\s*(-?\d+(?:\.\d+)?)/);
  if (lte) return { low: null, high: Number(lte[1]), highInclusive: true, lowInclusive: true };
  const lt = cleaned.match(/<\s*(-?\d+(?:\.\d+)?)/);
  if (lt) return { low: null, high: Number(lt[1]), highInclusive: false, lowInclusive: true };
  const gte = cleaned.match(/≥\s*(-?\d+(?:\.\d+)?)/);
  if (gte) return { low: Number(gte[1]), high: null, highInclusive: true, lowInclusive: true };
  const gt = cleaned.match(/>\s*(-?\d+(?:\.\d+)?)/);
  if (gt) return { low: Number(gt[1]), high: null, highInclusive: true, lowInclusive: false };
  return null;
}

/**
 * High / low flag against a catalogue reference range.
 * Missing values, non-numeric results, and unparseable ranges do not flag.
 */
export function resultFlag(
  value: string | number | null | undefined,
  referenceRange: string | null | undefined,
  sex?: string | null
): ResultFlag {
  if (value === null || value === undefined || value === "") return null;
  const numeric = typeof value === "number" ? (Number.isFinite(value) ? value : null) : parseNumeric(String(value));
  if (numeric === null) return null;
  if (!referenceRange || !referenceRange.trim()) return null;
  const selected = rangeTextForSex(referenceRange, sex);
  if (selected === null) return null;
  const bounds = parseBounds(selected);
  if (!bounds) return null;
  if (bounds.low !== null) {
    if (bounds.lowInclusive ? numeric < bounds.low : numeric <= bounds.low) return "L";
  }
  if (bounds.high !== null) {
    if (bounds.highInclusive ? numeric > bounds.high : numeric >= bounds.high) return "H";
  }
  return null;
}

/**
 * True when the catalogue range can be compared to a numeric result.
 * Titres (`1:80`), qualitative strings, and empty ranges are not parseable —
 * callers must not invent H/L flags for them. There is no criticalLow/criticalHigh
 * on catalogue parameters.
 */
export function isParseableNumericRange(referenceRange: string | null | undefined): boolean {
  if (!referenceRange || !referenceRange.trim()) return false;
  if (/\d+:\d+/.test(referenceRange)) return false;
  const male = referenceRange.match(/M:\s*([^,]+)/i);
  const female = referenceRange.match(/F:\s*([^,]+)/i);
  if (male || female) {
    const parts = [male?.[1], female?.[1]].filter((part): part is string => Boolean(part));
    return parts.some((part) => parseBounds(part) !== null);
  }
  return parseBounds(referenceRange) !== null;
}

export function orderHasAbnormalResults(
  tests: { code: string }[],
  results: Record<string, Record<string, string>> | null | undefined,
  catalog: { code: string; parameters: { name: string; referenceRange: string }[] }[],
  sex?: string | null
): boolean {
  if (!results) return false;
  for (const test of tests) {
    const definition = catalog.find((row) => row.code === test.code);
    if (!definition) continue;
    const values = results[test.code] || {};
    for (const parameter of definition.parameters) {
      if (resultFlag(values[parameter.name], parameter.referenceRange, sex)) return true;
    }
  }
  return false;
}
