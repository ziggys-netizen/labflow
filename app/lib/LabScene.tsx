"use client";

import { useId, type CSSProperties } from "react";

/**
 * Decorative laboratory backdrop for the entry screens: specimen tubes drifting
 * and turning in depth. Purely ornamental — hidden from assistive technology,
 * never printed, and still when the reader asks for reduced motion.
 *
 * Drawn in SVG rather than a photograph: nothing to license, nothing to fetch,
 * crisp at any size, and the cap colours come from the same tokens as the
 * specimen cap dots, so an EDTA tube here is the lavender used everywhere else.
 *
 * Depth is carried by size and opacity only. A CSS blur on moving layers
 * re-rasterises every frame and stutters on the tablets clinics actually use.
 */

type Cap = "lavender" | "gold" | "blue" | "red" | "grey" | "green";
type Liquid = "blood" | "serum";

interface TubeSpec {
  x: number; // % of the scene width, tube centre
  y: number; // % of the scene height, tube centre
  depth: 0 | 1 | 2; // far, middle, near
  cap: Cap;
  liquid: Liquid;
  fill: number; // 0–1, share of the body holding liquid
  tilt: number; // resting rotation, degrees
  seconds: number;
  delay: number;
}

const TUBES: TubeSpec[] = [
  { x: 7, y: 16, depth: 2, cap: "lavender", liquid: "blood", fill: 0.55, tilt: -18, seconds: 11, delay: 0 },
  { x: 19, y: 62, depth: 1, cap: "lavender", liquid: "blood", fill: 0.6, tilt: 12, seconds: 13, delay: -3 },
  { x: 31, y: 10, depth: 0, cap: "gold", liquid: "serum", fill: 0.5, tilt: 24, seconds: 15, delay: -6 },
  { x: 43, y: 84, depth: 0, cap: "blue", liquid: "blood", fill: 0.65, tilt: -10, seconds: 14, delay: -2 },
  { x: 57, y: 8, depth: 1, cap: "lavender", liquid: "blood", fill: 0.5, tilt: 20, seconds: 12, delay: -5 },
  { x: 73, y: 54, depth: 2, cap: "red", liquid: "serum", fill: 0.45, tilt: -14, seconds: 12, delay: -1 },
  { x: 88, y: 16, depth: 1, cap: "lavender", liquid: "blood", fill: 0.6, tilt: 16, seconds: 14, delay: -7 },
  { x: 93, y: 74, depth: 0, cap: "grey", liquid: "blood", fill: 0.55, tilt: -22, seconds: 16, delay: -4 },
  { x: 4, y: 86, depth: 1, cap: "green", liquid: "blood", fill: 0.5, tilt: 28, seconds: 13, delay: -8 },
  { x: 63, y: 90, depth: 1, cap: "lavender", liquid: "blood", fill: 0.6, tilt: -6, seconds: 15, delay: -9 },
  { x: 37, y: 42, depth: 0, cap: "lavender", liquid: "blood", fill: 0.55, tilt: 8, seconds: 17, delay: -10 },
  { x: 81, y: 36, depth: 0, cap: "gold", liquid: "serum", fill: 0.5, tilt: -30, seconds: 16, delay: -11 },
];

// Sized to the longer screen side, so a phone gets small tubes and a desktop
// monitor does not get a sparse scatter.
const DEPTH = [
  { width: "clamp(24px, 3.2vmax, 44px)", opacity: 0.4 },
  { width: "clamp(32px, 4.6vmax, 64px)", opacity: 0.65 },
  { width: "clamp(42px, 6.4vmax, 88px)", opacity: 0.9 },
] as const;

const LIQUID_STOPS: Record<Liquid, [string, string]> = {
  blood: ["#5A1216", "#9E2B2F"],
  serum: ["#B07F22", "#E8C36A"],
};

// Body geometry in the 48×200 viewBox.
const BODY_TOP = 44;
const BODY_BOTTOM = 196;
const BODY_PATH = "M7 44 H41 V179 A17 17 0 0 1 7 179 Z";

function Tube({ spec }: { spec: TubeSpec }) {
  const uid = useId().replace(/:/g, "");
  const [dark, light] = LIQUID_STOPS[spec.liquid];
  const liquidTop = BODY_BOTTOM - (BODY_BOTTOM - BODY_TOP) * spec.fill;
  const depth = DEPTH[spec.depth];
  // As a style, not a fill attribute: not every browser resolves var() in an
  // SVG presentation attribute.
  const capFill: CSSProperties = { fill: `var(--lf-cap-${spec.cap})` };

  const outer: CSSProperties = {
    left: `${spec.x}%`,
    top: `${spec.y}%`,
    width: depth.width,
    opacity: depth.opacity,
  };
  const inner = {
    "--lf-tube-tilt": `${spec.tilt}deg`,
    animationDuration: `${spec.seconds}s`,
    animationDelay: `${spec.delay}s`,
  } as CSSProperties;

  return (
    <div className="lf-tube absolute -translate-x-1/2 -translate-y-1/2" style={outer}>
      <div className="lf-tube-drift" style={inner}>
        <svg viewBox="0 0 48 200" className="block h-auto w-full overflow-visible" focusable="false">
          <defs>
            <linearGradient id={`${uid}g`} x1="0" x2="1">
              <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.7" />
              <stop offset="0.3" stopColor="#FFFFFF" stopOpacity="0.2" />
              <stop offset="0.7" stopColor="#FFFFFF" stopOpacity="0.08" />
              <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.5" />
            </linearGradient>
            <linearGradient id={`${uid}l`} x1="0" x2="1">
              <stop offset="0" stopColor={dark} />
              <stop offset="0.45" stopColor={light} />
              <stop offset="1" stopColor={dark} />
            </linearGradient>
            <linearGradient id={`${uid}s`} x1="0" x2="1">
              <stop offset="0" stopColor="#000000" stopOpacity="0.28" />
              <stop offset="0.4" stopColor="#FFFFFF" stopOpacity="0.22" />
              <stop offset="1" stopColor="#000000" stopOpacity="0.32" />
            </linearGradient>
            <clipPath id={`${uid}c`}>
              <path d={BODY_PATH} />
            </clipPath>
          </defs>

          {/* Glass body */}
          <path d={BODY_PATH} fill="rgba(205, 222, 234, 0.35)" />
          <g clipPath={`url(#${uid}c)`}>
            <rect x="0" y={liquidTop} width="48" height={BODY_BOTTOM - liquidTop} fill={`url(#${uid}l)`} />
            <ellipse cx="24" cy={liquidTop} rx="17" ry="3" fill={light} opacity="0.85" />
            {/* Label with barcode, wrapped around the tube */}
            <rect x="7" y="66" width="34" height="74" fill="#FFFFFF" opacity="0.94" />
            <rect x="7" y="66" width="34" height="7" style={capFill} opacity="0.9" />
            {[80, 84, 86, 91, 94, 99, 101, 104, 109, 112, 116, 118, 123].map((y, i) => (
              <rect key={y} x="13" y={y} width="22" height={i % 3 === 0 ? 2.2 : 1.1} fill="#1C2630" />
            ))}
            <rect x="0" y={BODY_TOP} width="48" height={BODY_BOTTOM - BODY_TOP} fill={`url(#${uid}g)`} />
          </g>
          <path d={BODY_PATH} fill="none" stroke="rgba(255, 255, 255, 0.85)" strokeWidth="1.4" />
          <rect x="12" y="50" width="3.5" height="126" rx="1.75" fill="#FFFFFF" opacity="0.55" />

          {/* Cap: colour from the specimen-cap tokens, ridged, shaded as a cylinder */}
          <rect x="4" y="34" width="40" height="14" rx="2" style={capFill} />
          <rect x="1" y="2" width="46" height="36" rx="6" style={capFill} />
          {[9, 14, 19, 24, 29].map((y) => (
            <line key={y} x1="3" x2="45" y1={y} y2={y} stroke="#000000" strokeOpacity="0.13" strokeWidth="1.2" />
          ))}
          <rect x="1" y="2" width="46" height="36" rx="6" fill={`url(#${uid}s)`} />
          <rect x="4" y="34" width="40" height="14" rx="2" fill={`url(#${uid}s)`} />
        </svg>
      </div>
    </div>
  );
}

export default function LabScene() {
  return (
    <div aria-hidden="true" className="lf-lab-scene no-print pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="lf-lab-scene-glow lf-lab-scene-glow--a" />
      <div className="lf-lab-scene-glow lf-lab-scene-glow--b" />
      {TUBES.map((spec, i) => (
        <Tube key={i} spec={spec} />
      ))}
    </div>
  );
}
