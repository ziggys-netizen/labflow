import { readdirSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";
import { describe, expect, it } from "vitest";
import {
  FALLBACK_SCENE,
  SCENE_COLUMNS,
  SCENE_ROUTES,
  SCENE_ROWS,
  layoutScene,
  sceneForPath,
  sceneKey,
  scenePatternForPath,
} from "./labScenes";

const APP_DIR = join(__dirname, "..");

function pageRoutes(dir = APP_DIR): string[] {
  const routes: string[] = [];
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      routes.push(...pageRoutes(full));
    } else if (name === "page.tsx") {
      const folder = relative(APP_DIR, dir).split(sep).filter(Boolean);
      // Route groups "(name)" do not appear in the address.
      const segments = folder.filter((s) => !(s.startsWith("(") && s.endsWith(")")));
      routes.push(`/${segments.join("/")}`);
    }
  }
  return routes;
}

describe("scene per screen", () => {
  const routes = pageRoutes();

  it("finds the screens it is meant to cover", () => {
    expect(routes.length).toBeGreaterThanOrEqual(39);
    expect(routes).toContain("/dashboard");
    expect(routes).toContain("/patients/[patientId]/label");
  });

  it("gives every screen in app/ a scene of its own", () => {
    const missing = routes.filter((r) => !(r in SCENE_ROUTES));
    expect(missing).toEqual([]);
  });

  it("declares no scene for a screen that does not exist", () => {
    const stale = Object.keys(SCENE_ROUTES).filter((r) => !routes.includes(r));
    expect(stale).toEqual([]);
  });

  it("never gives two screens the same objects and motion", () => {
    const keys = [...Object.values(SCENE_ROUTES), FALLBACK_SCENE].map(sceneKey);
    const repeated = keys.filter((k, i) => keys.indexOf(k) !== i);
    expect(repeated).toEqual([]);
  });

  it("never gives two screens the same layout seed", () => {
    const seeds = [...Object.values(SCENE_ROUTES), FALLBACK_SCENE].flatMap((s) =>
      s.kind === "scatter" ? [s.seed] : []
    );
    expect(new Set(seeds).size).toBe(seeds.length);
  });

  it("keeps the dashboard's composition for the dashboard alone", () => {
    const dashboards = Object.entries(SCENE_ROUTES).filter(([, s]) => s.kind === "dashboard");
    expect(dashboards.map(([r]) => r)).toEqual(["/dashboard"]);
  });
});

describe("scenePatternForPath", () => {
  it("resolves concrete addresses to their route", () => {
    expect(scenePatternForPath("/")).toBe("/");
    expect(scenePatternForPath("/patients")).toBe("/patients");
    expect(scenePatternForPath("/patients/abc123")).toBe("/patients/[patientId]");
    expect(scenePatternForPath("/patients/abc123/label")).toBe("/patients/[patientId]/label");
    expect(scenePatternForPath("/dashboard/queues/review")).toBe("/dashboard/queues/[slug]");
    expect(scenePatternForPath("/owner/clinics/c1/audit")).toBe("/owner/clinics/[clinicId]/audit");
    expect(scenePatternForPath("/orders/new/p1")).toBe("/orders/new/[patientId]");
  });

  it("prefers a literal segment over a dynamic one", () => {
    expect(scenePatternForPath("/patients/deleted")).toBe("/patients/deleted");
  });

  it("ignores a trailing slash, query and fragment", () => {
    expect(scenePatternForPath("/patients/")).toBe("/patients");
    expect(scenePatternForPath("/dashboard?queue=review")).toBe("/dashboard");
    expect(scenePatternForPath("/terms#top")).toBe("/terms");
  });

  it("falls back for an address no screen claims", () => {
    expect(scenePatternForPath("/no-such-page")).toBeNull();
    expect(sceneForPath("/no-such-page")).toBe(FALLBACK_SCENE);
  });
});

describe("layoutScene", () => {
  const spec = SCENE_ROUTES["/patients"];
  if (spec.kind !== "scatter") throw new Error("expected a scatter scene");

  it("is the same on every call", () => {
    expect(layoutScene(spec)).toEqual(layoutScene(spec));
  });

  it("puts one object in each grid cell, inside the screen", () => {
    const items = layoutScene(spec);
    expect(items).toHaveLength(SCENE_COLUMNS * SCENE_ROWS);
    items.forEach((item, i) => {
      const col = i % SCENE_COLUMNS;
      const row = Math.floor(i / SCENE_COLUMNS);
      expect(item.x).toBeGreaterThanOrEqual((col * 100) / SCENE_COLUMNS);
      expect(item.x).toBeLessThanOrEqual(((col + 1) * 100) / SCENE_COLUMNS);
      expect(item.y).toBeGreaterThanOrEqual((row * 100) / SCENE_ROWS);
      expect(item.y).toBeLessThanOrEqual(((row + 1) * 100) / SCENE_ROWS);
    });
  });

  it("uses every object the scene names, and starts mid-motion", () => {
    const items = layoutScene(spec);
    expect(new Set(items.map((i) => i.object))).toEqual(new Set(spec.objects));
    for (const item of items) {
      expect(item.delay).toBeLessThanOrEqual(0);
      expect(-item.delay).toBeLessThanOrEqual(item.seconds);
      expect(item.seconds).toBeGreaterThan(0);
    }
  });

  it("lays two screens out differently", () => {
    const other = SCENE_ROUTES["/orders"];
    if (other.kind !== "scatter") throw new Error("expected a scatter scene");
    expect(layoutScene(other).map((i) => [i.x, i.y])).not.toEqual(
      layoutScene(spec).map((i) => [i.x, i.y])
    );
  });
});
