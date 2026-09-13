import { describe, expect, it } from "vitest";
import { MENU_EDGE_PX, MENU_GAP_PX, placeMenu } from "./menuPosition";

const menu = { width: 208, height: 97 };

describe("placeMenu", () => {
  it("opens below the trigger with its right edge on the trigger's right edge", () => {
    // The table layout from the bug: trigger at the far right of an 862px screen.
    const trigger = { top: 316, bottom: 360, left: 779, right: 823 };
    expect(placeMenu({ trigger, menu, viewport: { width: 862, height: 550 } })).toEqual({
      top: 360 + MENU_GAP_PX,
      left: 823 - 208,
      placement: "below",
    });
  });

  it("pulls the menu back on screen when the trigger sits near the left edge", () => {
    // The card layout from the bug: right-aligned, it started at x = -25.
    const trigger = { top: 370, bottom: 414, left: 139, right: 183 };
    const pos = placeMenu({ trigger, menu, viewport: { width: 400, height: 800 } });
    expect(pos.left).toBe(MENU_EDGE_PX);
    expect(pos.left + menu.width).toBeLessThanOrEqual(400 - MENU_EDGE_PX);
  });

  it("pulls the menu back on screen when it would overflow the right edge", () => {
    const trigger = { top: 100, bottom: 144, left: 380, right: 424 };
    const pos = placeMenu({ trigger, menu: { width: 100, height: 97 }, viewport: { width: 400, height: 800 } });
    expect(pos.left).toBe(400 - MENU_EDGE_PX - 100);
  });

  it("opens above when there is no room below, as for the last row on screen", () => {
    const trigger = { top: 480, bottom: 524, left: 779, right: 823 };
    expect(placeMenu({ trigger, menu, viewport: { width: 862, height: 550 } })).toEqual({
      top: 480 - MENU_GAP_PX - 97,
      left: 615,
      placement: "above",
    });
  });

  it("keeps the whole menu inside the screen when it fits neither above nor below", () => {
    const tall = { width: 208, height: 300 };
    const viewport = { width: 862, height: 400 };
    for (const top of [40, 120, 200, 300]) {
      const trigger = { top, bottom: top + 44, left: 779, right: 823 };
      const pos = placeMenu({ trigger, menu: tall, viewport });
      expect(pos.top).toBeGreaterThanOrEqual(MENU_EDGE_PX);
      expect(pos.top + tall.height).toBeLessThanOrEqual(viewport.height - MENU_EDGE_PX);
    }
  });

  it("never starts left of the screen edge even when the menu is wider than the screen", () => {
    const trigger = { top: 100, bottom: 144, left: 200, right: 244 };
    const pos = placeMenu({ trigger, menu: { width: 500, height: 97 }, viewport: { width: 320, height: 800 } });
    expect(pos.left).toBe(MENU_EDGE_PX);
  });
});
