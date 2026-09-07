import { describe, expect, it } from "vitest";
import {
  ICON_ACTION_LABELS,
  ICON_HIT_AREA_CLASS,
  ICON_HIT_AREA_PX,
  actionPresentation,
  iconControlA11y,
  iconTooltipOpen,
} from "./iconAction";

describe("actionPresentation", () => {
  it("keeps Collect and every primary next-step as words", () => {
    expect(actionPresentation("collect", "primary-next-step")).toBe("word");
    expect(actionPresentation("collect", "secondary")).toBe("word");
    expect(actionPresentation("order", "primary-next-step")).toBe("word");
    expect(actionPresentation("enter", "primary-next-step")).toBe("word");
    expect(actionPresentation("review", "primary-next-step")).toBe("word");
    expect(actionPresentation("print", "primary-next-step")).toBe("word");
    expect(actionPresentation("amend", "secondary")).toBe("word");
  });

  it("allows Print, Delete, More, and history as icons only when they are not the next-step", () => {
    expect(actionPresentation("print", "secondary")).toBe("icon");
    expect(actionPresentation("delete", "secondary")).toBe("icon");
    expect(actionPresentation("more", "secondary")).toBe("icon");
    expect(actionPresentation("history", "secondary")).toBe("icon");
  });
});

describe("iconControlA11y", () => {
  it("requires a full action name and ties tooltip, aria-label, and the 44px hit area together", () => {
    expect(ICON_HIT_AREA_PX).toBe(44);
    expect(ICON_HIT_AREA_CLASS).toBe("lf-touch");
    expect(iconControlA11y(ICON_ACTION_LABELS.print)).toEqual({
      "aria-label": "Print",
      tooltip: "Print",
      hitAreaClass: "lf-touch",
    });
    expect(iconControlA11y("  Delete  ")).toEqual({
      "aria-label": "Delete",
      tooltip: "Delete",
      hitAreaClass: "lf-touch",
    });
    expect(() => iconControlA11y("")).toThrow(/aria-label and tooltip/);
    expect(() => iconControlA11y("   ")).toThrow(/aria-label and tooltip/);
  });
});

describe("iconTooltipOpen", () => {
  it("shows the tooltip on hover and on keyboard focus", () => {
    expect(iconTooltipOpen({ hover: false, focus: false })).toBe(false);
    expect(iconTooltipOpen({ hover: true, focus: false })).toBe(true);
    expect(iconTooltipOpen({ hover: false, focus: true })).toBe(true);
    expect(iconTooltipOpen({ hover: true, focus: true })).toBe(true);
  });
});
