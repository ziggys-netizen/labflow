import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import IconButton from "./IconButton";

describe("IconButton", () => {
  it("is icon-only, labelled for assistive tech, and uses the 44px hit area", () => {
    const html = renderToStaticMarkup(
      createElement(IconButton, { label: "Print", children: createElement("svg") })
    );
    expect(html).toContain('aria-label="Print"');
    expect(html).toContain("lf-touch");
    expect(html).toContain('data-lf-role="icon-button"');
    expect(html).not.toMatch(/>Print</);
  });
});
