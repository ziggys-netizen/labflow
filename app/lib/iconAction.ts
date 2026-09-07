/** E2: icons only when the picture is already in everyone's head. Everything else stays a word. */

export const ICON_HIT_AREA_PX = 44;
export const ICON_HIT_AREA_CLASS = "lf-touch";

export const ICON_ACTION_LABELS = {
  print: "Print",
  delete: "Delete",
  more: "More actions",
  history: "Patient history",
} as const;

export type LabActionKind =
  | "order"
  | "collect"
  | "enter"
  | "review"
  | "print"
  | "delete"
  | "more"
  | "history"
  | "amend";

export type ActionSurface = "primary-next-step" | "secondary";

const WORD_KINDS = new Set<LabActionKind>(["order", "collect", "enter", "review", "amend"]);
const ICON_KINDS = new Set<LabActionKind>(["delete", "more", "history"]);

export function actionPresentation(kind: LabActionKind, surface: ActionSurface): "icon" | "word" {
  if (WORD_KINDS.has(kind)) return "word";
  if (kind === "print") return surface === "primary-next-step" ? "word" : "icon";
  if (ICON_KINDS.has(kind)) return "icon";
  return "word";
}

export function iconControlA11y(label: string): {
  "aria-label": string;
  tooltip: string;
  hitAreaClass: typeof ICON_HIT_AREA_CLASS;
} {
  const text = label.trim();
  if (!text) {
    throw new Error("Icon-only controls need a full action name for aria-label and tooltip.");
  }
  return {
    "aria-label": text,
    tooltip: text,
    hitAreaClass: ICON_HIT_AREA_CLASS,
  };
}

export function iconTooltipOpen(input: { hover: boolean; focus: boolean }): boolean {
  return input.hover || input.focus;
}
