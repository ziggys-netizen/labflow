"use client";

import type { CSSProperties } from "react";
import { usePathname } from "next/navigation";
import { CAPS, LabObject, OBJECTS } from "./labSceneObjects";
import { layoutScene, sceneForPath, type SceneSpec } from "./labScenes";

/**
 * Laboratory backdrop behind every screen. Which scene a screen gets lives in
 * labScenes.ts; the objects are drawn in labSceneObjects.tsx.
 *
 * Purely ornamental: hidden from assistive technology, never printed, and
 * still under prefers-reduced-motion. Opaque cards and panels sit above it, so
 * it shows only in the gutters of a working screen.
 *
 * Depth is carried by size and opacity only. A CSS blur on moving layers
 * re-rasterises every frame and stutters on the tablets clinics actually use.
 */

// Width of a specimen tube at each depth; other objects scale from it.
const DEPTH_WIDTH = [
  "clamp(24px, 3.2vmax, 44px)",
  "clamp(32px, 4.6vmax, 64px)",
  "clamp(42px, 6.4vmax, 88px)",
] as const;

const DEPTH_OPACITY = {
  hero: [0.4, 0.65, 0.9],
  work: [0.3, 0.5, 0.72],
} as const;

function ScatterScene({ spec }: { spec: Extract<SceneSpec, { kind: "scatter" }> }) {
  const items = layoutScene(spec);
  // Two glow colours per scene, picked from the seed, so grounds differ too.
  const glowA = CAPS[spec.seed % CAPS.length];
  const glowB = CAPS[(spec.seed * 7 + 3) % CAPS.length];
  return (
    <div
      aria-hidden="true"
      className="lf-lab-scene no-print pointer-events-none fixed inset-0 -z-10 overflow-hidden"
      style={{ "--lf-glow-a": `var(--lf-cap-${glowA})`, "--lf-glow-b": `var(--lf-cap-${glowB})` } as CSSProperties}
    >
      <div className="lf-lab-scene-glow lf-lab-scene-glow--a" />
      <div className="lf-lab-scene-glow lf-lab-scene-glow--b" />
      {items.map((item, i) => {
        const def = OBJECTS[item.object];
        const outer: CSSProperties = {
          left: `${item.x}%`,
          top: `${item.y}%`,
          width: `calc(${DEPTH_WIDTH[item.depth]} * ${def.scale})`,
          opacity: DEPTH_OPACITY[spec.strength][item.depth],
        };
        const inner = {
          "--lf-obj-tilt": `${item.tilt}deg`,
          animationDuration: `${item.seconds}s`,
          animationDelay: `${item.delay}s`,
        } as CSSProperties;
        return (
          <div key={i} className="lf-obj absolute -translate-x-1/2 -translate-y-1/2" style={outer}>
            <div className={`lf-obj-motion lf-motion-${spec.motion}`} style={inner}>
              <LabObject object={item.object} variant={i} />
            </div>
          </div>
        );
      })}
    </div>
  );
}

const CAROUSEL_TUBES = 10;
const DASH_CELLS = [
  { object: "rbc", x: 8, y: 18, w: 58, s: 19, d: -2 },
  { object: "wbc", x: 34, y: 86, w: 64, s: 23, d: -9 },
  { object: "rbc", x: 50, y: 12, w: 40, s: 17, d: -5 },
  { object: "rbc", x: 92, y: 12, w: 50, s: 21, d: -12 },
  { object: "wbc", x: 46, y: 52, w: 44, s: 26, d: -4 },
  { object: "rbc", x: 22, y: 60, w: 34, s: 15, d: -7 },
] as const;
const DASH_BUBBLES = Array.from({ length: 14 }, (_, i) => ({
  x: (i * 37 + 11) % 100,
  w: 10 + ((i * 13) % 18),
  s: 14 + ((i * 7) % 12),
  d: -((i * 5) % 20),
}));

/**
 * The dashboard's own composition: a centrifuge rotor spinning in a tilted
 * plane, a carousel of specimen tubes orbiting it, twin DNA columns turning,
 * cells tumbling, and a grid floor running toward the viewer. No other screen
 * uses any of these arrangements.
 */
function DashboardScene() {
  return (
    <div aria-hidden="true" className="lf-lab-scene lf-dash no-print pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="lf-dash-floor" />
      <div className="lf-lab-scene-glow lf-lab-scene-glow--a" />
      <div className="lf-lab-scene-glow lf-lab-scene-glow--b" />

      <div className="lf-dash-helix lf-dash-helix--left">
        <div className="lf-dash-helix-turn">
          <LabObject object="dna" />
        </div>
      </div>
      <div className="lf-dash-helix lf-dash-helix--right">
        <div className="lf-dash-helix-turn lf-dash-helix-turn--reverse">
          <LabObject object="dna" variant={1} />
        </div>
      </div>

      {DASH_BUBBLES.map((b, i) => (
        <div key={`b${i}`} className="lf-obj absolute bottom-0" style={{ left: `${b.x}%`, width: b.w, opacity: 0.6 }}>
          <div
            className="lf-obj-motion lf-motion-rise"
            style={{ "--lf-obj-tilt": "0deg", animationDuration: `${b.s}s`, animationDelay: `${b.d}s` } as CSSProperties}
          >
            <LabObject object="bubble" />
          </div>
        </div>
      ))}

      {DASH_CELLS.map((c, i) => (
        <div
          key={`c${i}`}
          className="lf-obj absolute -translate-x-1/2 -translate-y-1/2"
          style={{ left: `${c.x}%`, top: `${c.y}%`, width: c.w, opacity: 0.7 }}
        >
          <div
            className="lf-obj-motion lf-motion-tumble"
            style={{ "--lf-obj-tilt": `${i * 25}deg`, animationDuration: `${c.s}s`, animationDelay: `${c.d}s` } as CSSProperties}
          >
            <LabObject object={c.object} />
          </div>
        </div>
      ))}

      <div className="lf-dash-stage">
        <div className="lf-dash-ring" />
        <div className="lf-dash-ring lf-dash-ring--late" />
        <div className="lf-dash-rotor-plane">
          <div className="lf-dash-rotor">
            <LabObject object="centrifuge" />
          </div>
        </div>
        <div className="lf-dash-carousel">
          {Array.from({ length: CAROUSEL_TUBES }, (_, i) => (
            <div
              key={i}
              className="lf-dash-carousel-slot"
              style={{ transform: `rotateY(${(360 / CAROUSEL_TUBES) * i}deg) translateZ(var(--lf-dash-radius))` }}
            >
              <LabObject object="tube" variant={i} />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function LabScene({ spec }: { spec: SceneSpec }) {
  return spec.kind === "dashboard" ? <DashboardScene /> : <ScatterScene spec={spec} />;
}

/** The scene for whichever screen is showing. Mounted once, in the root layout. */
export default function RouteLabScene() {
  const pathname = usePathname() || "/";
  const spec = sceneForPath(pathname);
  // Keyed by address so moving between screens restarts the new scene cleanly.
  return <LabScene key={pathname} spec={spec} />;
}
