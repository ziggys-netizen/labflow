/**
 * Specimen container label.
 *
 * The Lab ID leads and is also encoded as a Code 128 barcode, because it is
 * the identifier the rest of the system is keyed on and the one a scanner will
 * read at receipt. Sex/age is the second identifier.
 *
 * No patient name. Rule 10 bars names from durable records, and a container
 * label is handled, photographed and binned by more people than any screen in
 * this app. Lab ID plus sex/age gives two identifiers without that exposure.
 *
 * A label with no Lab ID is worse than no label — it invites someone to write
 * one on by hand. printableSpecimenLabel returns an error instead.
 */

export const DEFAULT_LABEL_WIDTH_MM = 50;
export const DEFAULT_LABEL_HEIGHT_MM = 25;

/** Outside this range it is not a label any label printer will feed. */
export const MIN_LABEL_MM = 15;
export const MAX_LABEL_MM = 150;

export const LABEL_NO_LAB_ID =
  "This patient has no Lab ID, so no label can be printed. Correct the record first.";

export const LABEL_LAB_ID_NOT_ENCODABLE =
  "This Lab ID contains characters a barcode cannot carry, so no label can be printed. Correct the record first.";

/**
 * Code 128 carries ASCII. Checking here rather than letting JsBarcode throw
 * mid-render keeps the failure a named message instead of a blank label, and
 * keeps it testable.
 */
export function labIdIsEncodable(labId: string): boolean {
  return /^[\x20-\x7E]+$/.test(labId);
}

export type LabelSize = {
  widthMm: number;
  heightMm: number;
};

export type SpecimenLabel = {
  labId: string;
  sexAge: string;
  clinicName: string;
  printedAt: string;
  /** Code 128 payload. Always the Lab ID exactly as stored. */
  barcodeValue: string;
};

export function defaultLabelSize(): LabelSize {
  return { widthMm: DEFAULT_LABEL_WIDTH_MM, heightMm: DEFAULT_LABEL_HEIGHT_MM };
}

/**
 * Rounds to one decimal — label stock is sold in whole and half millimetres.
 *
 * Null, undefined and blank mean "never set" and must fall back, not coerce:
 * Number(null) and Number("") are both 0, which would clamp to MIN and print
 * every label at 15mm without anyone having chosen that.
 */
export function clampLabelMm(value: unknown, fallback: number): number {
  let raw: number;
  if (typeof value === "number") {
    raw = value;
  } else if (typeof value === "string" && value.trim()) {
    raw = Number(value);
  } else {
    return fallback;
  }
  if (!Number.isFinite(raw)) return fallback;
  const bounded = Math.min(MAX_LABEL_MM, Math.max(MIN_LABEL_MM, raw));
  return Math.round(bounded * 10) / 10;
}

export function parseLabelSize(data: Record<string, unknown> | null | undefined): LabelSize {
  if (!data) return defaultLabelSize();
  return {
    widthMm: clampLabelMm(data.labelWidthMm, DEFAULT_LABEL_WIDTH_MM),
    heightMm: clampLabelMm(data.labelHeightMm, DEFAULT_LABEL_HEIGHT_MM),
  };
}

/** Fields written back to the clinic document. Nothing else is touched. */
export function labelSizeWriteFields(size: LabelSize): Record<string, number> {
  return {
    labelWidthMm: clampLabelMm(size.widthMm, DEFAULT_LABEL_WIDTH_MM),
    labelHeightMm: clampLabelMm(size.heightMm, DEFAULT_LABEL_HEIGHT_MM),
  };
}

/**
 * @page must carry the real label size or the printer pads the sheet to A4 and
 * the label comes out blank with the content in a corner. margin:0 because
 * label stock has no margin to give.
 */
export function labelPageCss(size: LabelSize): string {
  const w = `${size.widthMm}mm`;
  const h = `${size.heightMm}mm`;
  return `
  @page { size: ${w} ${h}; margin: 0; }
  @media screen {
    .label-sheet {
      width: ${w};
      height: ${h};
      border: 1px dashed #999;
    }
  }
  @media print {
    .no-print { display: none !important; }
    html, body { width: ${w}; height: ${h}; margin: 0; padding: 0; background: #fff; }
    .label-sheet { width: ${w}; height: ${h}; border: 0 !important; box-shadow: none !important; }
  }
`;
}

export function formatLabelTimestamp(at: Date): string {
  if (Number.isNaN(at.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}`;
}

export type PrintableLabelResult =
  | { ok: false; error: string }
  | { ok: true; label: SpecimenLabel };

export function printableSpecimenLabel(input: {
  labId: string | null | undefined;
  sexAge: string | null | undefined;
  clinicName: string | null | undefined;
  printedAt?: Date;
}): PrintableLabelResult {
  const labId = typeof input.labId === "string" ? input.labId.trim() : "";
  if (!labId) return { ok: false, error: LABEL_NO_LAB_ID };
  if (!labIdIsEncodable(labId)) return { ok: false, error: LABEL_LAB_ID_NOT_ENCODABLE };
  return {
    ok: true,
    label: {
      labId,
      sexAge: (input.sexAge || "").trim() || "—",
      clinicName: (input.clinicName || "").trim() || "—",
      printedAt: formatLabelTimestamp(input.printedAt ?? new Date()),
      barcodeValue: labId,
    },
  };
}

export function specimenLabelHref(patientId: string): string {
  return `/patients/${patientId}/label`;
}
