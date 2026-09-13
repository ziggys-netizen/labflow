/**
 * Where an action menu sits on screen. Pure so the rules are testable.
 *
 * The menu is drawn in a layer of its own at the top of the page and placed in
 * viewport coordinates. Drawn inside the row it belongs to, it was clipped by
 * the table's scroll container and painted under the next row's pinned action
 * cell — open, but invisible. In the card layout it hung off the left edge.
 */

export const MENU_GAP_PX = 4;
export const MENU_EDGE_PX = 8;

export type MenuPlacement = "below" | "above";

export interface MenuPositionInput {
  trigger: { top: number; bottom: number; left: number; right: number };
  menu: { width: number; height: number };
  viewport: { width: number; height: number };
}

export interface MenuPosition {
  top: number;
  left: number;
  placement: MenuPlacement;
}

function clamp(value: number, min: number, max: number) {
  if (max < min) return min;
  return Math.min(Math.max(value, min), max);
}

export function placeMenu({ trigger, menu, viewport }: MenuPositionInput): MenuPosition {
  // Right edge lines up with the trigger's right edge, the way the menu opened
  // before, then pulled back inside the screen on whichever side it overflows.
  const left = clamp(
    trigger.right - menu.width,
    MENU_EDGE_PX,
    viewport.width - MENU_EDGE_PX - menu.width
  );

  const belowTop = trigger.bottom + MENU_GAP_PX;
  const aboveTop = trigger.top - MENU_GAP_PX - menu.height;
  const fitsBelow = belowTop + menu.height <= viewport.height - MENU_EDGE_PX;
  const fitsAbove = aboveTop >= MENU_EDGE_PX;

  if (fitsBelow) return { top: belowTop, left, placement: "below" };
  if (fitsAbove) return { top: aboveTop, left, placement: "above" };

  // Fits neither way: take the side with more room and keep it on screen.
  const bottomLimit = viewport.height - MENU_EDGE_PX - menu.height;
  if (viewport.height - trigger.bottom >= trigger.top) {
    return { top: clamp(belowTop, MENU_EDGE_PX, bottomLimit), left, placement: "below" };
  }
  return { top: clamp(aboveTop, MENU_EDGE_PX, bottomLimit), left, placement: "above" };
}
