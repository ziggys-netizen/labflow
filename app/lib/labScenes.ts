/**
 * Which laboratory backdrop each screen shows. Pure, so the promise that every
 * screen has its own scene is a test rather than a hope — see
 * labScenes.test.ts, which walks app/ for page.tsx files.
 *
 * A scene is a set of objects and one motion. No two routes share the same
 * pairing. The dashboard is not a scatter at all; it is its own composition.
 */

export const SCENE_OBJECTS = [
  "tube",
  "rack",
  "pipette",
  "petri",
  "flask",
  "beaker",
  "slide",
  "rbc",
  "wbc",
  "dna",
  "molecule",
  "microplate",
  "droplet",
  "centrifuge",
  "cuvette",
  "box",
  "report",
  "microscope",
  "vial",
  "bacteria",
  "atom",
  "bubble",
  "clock",
  "shield",
  "thermometer",
  "barcodeTag",
] as const;
export type SceneObject = (typeof SCENE_OBJECTS)[number];

export const SCENE_MOTIONS = [
  "drift",
  "orbit",
  "tumble",
  "rise",
  "fall",
  "wave",
  "zoom",
  "bob",
  "sway",
  "flip",
  "swirl",
] as const;
export type SceneMotion = (typeof SCENE_MOTIONS)[number];

export type SceneSpec =
  | {
      kind: "scatter";
      objects: SceneObject[];
      motion: SceneMotion;
      seed: number;
      /**
       * "hero" only where the text already sits on its own frosted panel (home,
       * sign-in). Everywhere else text sits straight on the ground, so the
       * scene is softer and a reading veil covers the content column.
       */
      strength: "hero" | "work";
    }
  | { kind: "dashboard" };

const scatter = (
  objects: SceneObject[],
  motion: SceneMotion,
  seed: number,
  strength: "hero" | "work" = "work"
): SceneSpec => ({ kind: "scatter", objects, motion, seed, strength });

/** Route pattern, in App Router folder form, to its scene. */
export const SCENE_ROUTES: Record<string, SceneSpec> = {
  "/": scatter(["tube"], "drift", 101, "hero"),
  "/login": scatter(["tube", "vial"], "zoom", 102, "hero"),
  "/join": scatter(["droplet", "bubble"], "rise", 103),
  "/pending": scatter(["clock", "droplet"], "bob", 104),
  "/terms": scatter(["report", "shield"], "sway", 105),
  "/legal/privacy": scatter(["shield", "molecule"], "tumble", 106),
  "/legal/acceptable-use": scatter(["report", "barcodeTag"], "flip", 107),
  "/legal/support": scatter(["atom", "bubble"], "orbit", 108),

  "/dashboard": { kind: "dashboard" },
  "/dashboard/queues/[slug]": scatter(["clock", "tube"], "wave", 110),

  "/patients": scatter(["rbc", "wbc"], "swirl", 111),
  "/patients/deleted": scatter(["box", "report"], "fall", 112),
  "/patients/[patientId]": scatter(["dna", "rbc"], "drift", 113),
  "/patients/[patientId]/history": scatter(["report", "clock"], "drift", 114),
  "/patients/[patientId]/label": scatter(["barcodeTag", "tube"], "bob", 115),
  "/patients/[patientId]/print": scatter(["report", "microplate"], "rise", 116),
  "/patients/[patientId]/report": scatter(["microscope", "slide", "petri"], "sway", 117),

  "/register": scatter(["tube", "droplet"], "fall", 118),
  "/orders": scatter(["rack", "tube"], "wave", 119),
  "/orders/new/[patientId]": scatter(["rack", "pipette"], "bob", 120),
  "/orders/[orderId]": scatter(["pipette", "microplate"], "drift", 121),
  "/review": scatter(["microscope", "bacteria"], "orbit", 122),

  "/accounts": scatter(["shield", "atom"], "bob", 123),
  "/profile": scatter(["atom", "dna"], "sway", 124),
  "/staff": scatter(["pipette", "shield"], "rise", 125),

  "/settings": scatter(["molecule", "flask"], "orbit", 126),
  "/settings/catalogue": scatter(["flask", "cuvette", "petri"], "tumble", 127),
  "/settings/clinic": scatter(["thermometer", "flask"], "drift", 128),

  "/inventory": scatter(["box", "vial"], "tumble", 129),
  "/inventory/items": scatter(["box", "beaker"], "bob", 130),
  "/inventory/movements": scatter(["box", "barcodeTag"], "wave", 131),
  "/inventory/specimens": scatter(["tube", "rack", "vial"], "swirl", 132),

  "/owner": scatter(["microscope", "atom"], "flip", 133),
  "/owner/clinics/[clinicId]": scatter(["flask", "microscope", "pipette"], "wave", 134),
  "/owner/clinics/[clinicId]/audit": scatter(["shield", "barcodeTag"], "orbit", 135),
  "/owner/clinics/[clinicId]/data-quality": scatter(["microplate", "molecule"], "flip", 136),
  "/owner/clinics/[clinicId]/migration": scatter(["box", "droplet"], "zoom", 137),
  "/owner/clinics/[clinicId]/roster": scatter(["clock", "pipette"], "sway", 138),
  "/owner/clinics/[clinicId]/staff": scatter(["wbc", "pipette"], "zoom", 139),

  "/orders/[orderId]/receipt": scatter(["report", "droplet"], "zoom", 140),
  "/services/new/[patientId]": scatter(["cuvette", "atom"], "swirl", 141),
  "/services/[chargeId]/receipt": scatter(["report", "thermometer"], "orbit", 142),
  "/settings/services": scatter(["flask", "droplet"], "flip", 143),
};

/** For an address no route claims — a mistyped link, a removed page. */
export const FALLBACK_SCENE: SceneSpec = scatter(["bubble", "beaker", "cuvette"], "bob", 199);

/** Identity of a scene for the "no two screens alike" rule. */
export function sceneKey(spec: SceneSpec): string {
  if (spec.kind === "dashboard") return "dashboard";
  return `${[...spec.objects].sort().join("+")}/${spec.motion}`;
}

function segmentsMatch(pattern: string[], path: string[]) {
  if (pattern.length !== path.length) return false;
  return pattern.every((seg, i) => (seg.startsWith("[") && seg.endsWith("]")) || seg === path[i]);
}

/** The route pattern a concrete address belongs to; literal segments win over dynamic ones. */
export function scenePatternForPath(pathname: string): string | null {
  const clean = (pathname.split(/[?#]/)[0] || "/").replace(/\/+$/, "") || "/";
  const path = clean === "/" ? [] : clean.slice(1).split("/");
  let best: { pattern: string; dynamic: number } | null = null;
  for (const pattern of Object.keys(SCENE_ROUTES)) {
    const segs = pattern === "/" ? [] : pattern.slice(1).split("/");
    if (!segmentsMatch(segs, path)) continue;
    const dynamic = segs.filter((s) => s.startsWith("[")).length;
    if (!best || dynamic < best.dynamic) best = { pattern, dynamic };
  }
  return best?.pattern ?? null;
}

export function sceneForPath(pathname: string): SceneSpec {
  const pattern = scenePatternForPath(pathname);
  return pattern ? SCENE_ROUTES[pattern] : FALLBACK_SCENE;
}

export interface SceneItem {
  object: SceneObject;
  x: number; // % of width, centre
  y: number; // % of height, centre
  depth: 0 | 1 | 2;
  tilt: number; // degrees
  seconds: number;
  delay: number; // negative, so the scene is mid-motion on first paint
}

const MOTION_SECONDS: Record<SceneMotion, number> = {
  drift: 13,
  orbit: 16,
  tumble: 22,
  rise: 24,
  fall: 26,
  wave: 30,
  zoom: 14,
  bob: 7,
  sway: 9,
  flip: 18,
  swirl: 15,
};

/** Seeded, so a screen looks the same on every visit and every device. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const SCENE_COLUMNS = 4;
export const SCENE_ROWS = 3;

/**
 * One object per cell of a 4×3 grid, jittered inside its cell, so a scene
 * spreads across the screen instead of clumping by chance.
 */
export function layoutScene(spec: Extract<SceneSpec, { kind: "scatter" }>): SceneItem[] {
  const rand = mulberry32(spec.seed);
  const base = MOTION_SECONDS[spec.motion];
  const items: SceneItem[] = [];
  for (let row = 0; row < SCENE_ROWS; row++) {
    for (let col = 0; col < SCENE_COLUMNS; col++) {
      const i = row * SCENE_COLUMNS + col;
      const cellW = 100 / SCENE_COLUMNS;
      const cellH = 100 / SCENE_ROWS;
      const seconds = Math.round(base * (0.75 + rand() * 0.5) * 10) / 10;
      items.push({
        object: spec.objects[i % spec.objects.length],
        x: Math.round((col * cellW + cellW * (0.15 + rand() * 0.7)) * 10) / 10,
        y: Math.round((row * cellH + cellH * (0.15 + rand() * 0.7)) * 10) / 10,
        depth: Math.floor(rand() * 3) as 0 | 1 | 2,
        tilt: Math.round(rand() * 60 - 30),
        seconds,
        delay: -Math.round(rand() * seconds * 10) / 10,
      });
    }
  }
  return items;
}
