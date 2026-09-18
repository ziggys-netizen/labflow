"use client";

import { useId, type CSSProperties, type ReactNode } from "react";
import type { SceneObject } from "./labScenes";

/**
 * The drawn laboratory objects the backdrops are made of. Each is plain SVG
 * with its own shading, so it reads as a solid object when a scene turns it in
 * 3D. Cap and label colours use the specimen-cap tokens, set as style: not
 * every browser resolves var() inside an SVG presentation attribute.
 */

export const CAPS = ["lavender", "gold", "blue", "red", "grey", "green"] as const;
type Cap = (typeof CAPS)[number];

const capStyle = (cap: Cap, prop: "fill" | "stroke" = "fill"): CSSProperties => ({
  [prop]: `var(--lf-cap-${cap})`,
});

interface ObjectDef {
  /** viewBox width and height */
  w: number;
  h: number;
  /** on-screen width relative to a specimen tube */
  scale: number;
  draw: (id: string, variant: number) => ReactNode;
}

function Cylinder({ id, dark, light }: { id: string; dark: string; light: string }) {
  return (
    <linearGradient id={id} x1="0" x2="1">
      <stop offset="0" stopColor={dark} />
      <stop offset="0.42" stopColor={light} />
      <stop offset="1" stopColor={dark} />
    </linearGradient>
  );
}

function Shade({ id }: { id: string }) {
  return (
    <linearGradient id={id} x1="0" x2="1">
      <stop offset="0" stopColor="#000000" stopOpacity="0.28" />
      <stop offset="0.4" stopColor="#FFFFFF" stopOpacity="0.22" />
      <stop offset="1" stopColor="#000000" stopOpacity="0.32" />
    </linearGradient>
  );
}

function Sphere({ id, color, core }: { id: string; color: string; core: string }) {
  return (
    <radialGradient id={id} cx="0.35" cy="0.3" r="0.75">
      <stop offset="0" stopColor={core} />
      <stop offset="0.55" stopColor={color} />
      <stop offset="1" stopColor="#1C2630" stopOpacity="0.9" />
    </radialGradient>
  );
}

const GLASS = "rgba(205, 222, 234, 0.35)";
const GLASS_EDGE = "rgba(255, 255, 255, 0.85)";
const BLOOD: [string, string] = ["#5A1216", "#9E2B2F"];
const SERUM: [string, string] = ["#B07F22", "#E8C36A"];
const BARS = [0, 4, 6, 11, 14, 19, 21, 24, 29, 32, 36, 38, 43];

/* ------------------------------------------------------------------ tube */
const TUBE_BODY = "M7 44 H41 V179 A17 17 0 0 1 7 179 Z";
function drawTube(id: string, variant: number) {
  const cap = CAPS[variant % CAPS.length];
  const [dark, light] = cap === "gold" || cap === "red" ? SERUM : BLOOD;
  const liquidTop = 196 - 152 * (0.45 + ((variant * 37) % 20) / 100);
  return (
    <>
      <defs>
        <linearGradient id={`${id}g`} x1="0" x2="1">
          <stop offset="0" stopColor="#FFFFFF" stopOpacity="0.7" />
          <stop offset="0.3" stopColor="#FFFFFF" stopOpacity="0.2" />
          <stop offset="0.7" stopColor="#FFFFFF" stopOpacity="0.08" />
          <stop offset="1" stopColor="#FFFFFF" stopOpacity="0.5" />
        </linearGradient>
        <Cylinder id={`${id}l`} dark={dark} light={light} />
        <Shade id={`${id}s`} />
        <clipPath id={`${id}c`}>
          <path d={TUBE_BODY} />
        </clipPath>
      </defs>
      <path d={TUBE_BODY} fill={GLASS} />
      <g clipPath={`url(#${id}c)`}>
        <rect x="0" y={liquidTop} width="48" height={196 - liquidTop} fill={`url(#${id}l)`} />
        <ellipse cx="24" cy={liquidTop} rx="17" ry="3" fill={light} opacity="0.85" />
        <rect x="7" y="66" width="34" height="74" fill="#FFFFFF" opacity="0.94" />
        <rect x="7" y="66" width="34" height="7" style={capStyle(cap)} opacity="0.9" />
        {BARS.map((d, i) => (
          <rect key={d} x="13" y={80 + d} width="22" height={i % 3 === 0 ? 2.2 : 1.1} fill="#1C2630" />
        ))}
        <rect x="0" y="44" width="48" height="152" fill={`url(#${id}g)`} />
      </g>
      <path d={TUBE_BODY} fill="none" stroke={GLASS_EDGE} strokeWidth="1.4" />
      <rect x="12" y="50" width="3.5" height="126" rx="1.75" fill="#FFFFFF" opacity="0.55" />
      <rect x="4" y="34" width="40" height="14" rx="2" style={capStyle(cap)} />
      <rect x="1" y="2" width="46" height="36" rx="6" style={capStyle(cap)} />
      {[9, 14, 19, 24, 29].map((y) => (
        <line key={y} x1="3" x2="45" y1={y} y2={y} stroke="#000000" strokeOpacity="0.13" strokeWidth="1.2" />
      ))}
      <rect x="1" y="2" width="46" height="36" rx="6" fill={`url(#${id}s)`} />
      <rect x="4" y="34" width="40" height="14" rx="2" fill={`url(#${id}s)`} />
    </>
  );
}

/* ------------------------------------------------------------------ vial */
function drawVial(id: string, variant: number) {
  const cap = CAPS[(variant + 2) % CAPS.length];
  return (
    <>
      <defs>
        <Cylinder id={`${id}m`} dark="#7D8A94" light="#E8EDF1" />
        <Cylinder id={`${id}l`} dark="#2E6D96" light="#9FD0F0" />
        <Shade id={`${id}s`} />
      </defs>
      <rect x="8" y="24" width="34" height="62" rx="6" fill={GLASS} stroke={GLASS_EDGE} strokeWidth="1.4" />
      <rect x="10" y="52" width="30" height="32" rx="4" fill={`url(#${id}l)`} opacity="0.85" />
      <rect x="10" y="40" width="30" height="16" fill="#FFFFFF" opacity="0.9" />
      <rect x="10" y="40" width="30" height="4" style={capStyle(cap)} />
      <rect x="13" y="28" width="3" height="52" rx="1.5" fill="#FFFFFF" opacity="0.55" />
      <rect x="6" y="12" width="38" height="16" rx="3" fill={`url(#${id}m)`} />
      <rect x="12" y="3" width="26" height="11" rx="3" style={capStyle(cap)} />
      <rect x="12" y="3" width="26" height="11" rx="3" fill={`url(#${id}s)`} />
    </>
  );
}

/* ------------------------------------------------------------------ rack */
function drawRack(id: string, variant: number) {
  const xs = [34, 72, 110, 148, 186];
  return (
    <>
      <defs>
        <linearGradient id={`${id}f`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#3C7FAE" />
          <stop offset="1" stopColor="#14476B" />
        </linearGradient>
        <Cylinder id={`${id}b`} dark={BLOOD[0]} light={BLOOD[1]} />
      </defs>
      <rect x="16" y="112" width="12" height="34" rx="2" fill="#14476B" />
      <rect x="192" y="112" width="12" height="34" rx="2" fill="#14476B" />
      <polygon points="20,62 200,62 214,80 6,80" fill="#6BA5CE" />
      {xs.map((x) => (
        <ellipse key={`h${x}`} cx={x} cy="71" rx="13" ry="4.5" fill="#0E2E45" />
      ))}
      {xs.map((x, i) => {
        const cap = CAPS[(variant + i) % CAPS.length];
        return (
          <g key={x}>
            <rect x={x - 11} y="18" width="22" height="54" fill={GLASS} stroke={GLASS_EDGE} strokeWidth="1.2" />
            <rect x={x - 10} y={40 + ((i * 7) % 12)} width="20" height={32 - ((i * 7) % 12)} fill={`url(#${id}b)`} />
            <rect x={x - 7} y="22" width="3" height="46" fill="#FFFFFF" opacity="0.5" />
            <rect x={x - 13} y="4" width="26" height="16" rx="3" style={capStyle(cap)} />
          </g>
        );
      })}
      <rect x="6" y="80" width="208" height="36" rx="4" fill={`url(#${id}f)`} />
      <rect x="6" y="80" width="208" height="5" fill="#FFFFFF" opacity="0.25" />
    </>
  );
}

/* --------------------------------------------------------------- pipette */
function drawPipette(id: string, variant: number) {
  const cap = CAPS[(variant + 1) % CAPS.length];
  return (
    <>
      <defs>
        <Cylinder id={`${id}p`} dark="#AEBBC5" light="#F4F7F9" />
        <Cylinder id={`${id}t`} dark="#C9B26A" light="#F6EBC4" />
      </defs>
      <rect x="17" y="8" width="6" height="18" fill="#9AA7B1" />
      <rect x="11" y="0" width="18" height="12" rx="5" style={capStyle(cap)} />
      <path d="M8 26 H32 Q36 26 36 34 V104 Q36 114 28 116 H12 Q4 114 4 104 V34 Q4 26 8 26 Z" fill={`url(#${id}p)`} />
      <path d="M36 44 Q46 50 36 60" fill="none" stroke="#AEBBC5" strokeWidth="5" strokeLinecap="round" />
      <rect x="11" y="40" width="18" height="20" rx="3" fill="#1C2630" />
      <rect x="14" y="46" width="12" height="2" fill="#7FE0B0" />
      <rect x="14" y="51" width="8" height="2" fill="#7FE0B0" />
      <polygon points="9,116 31,116 26,170 14,170" fill={`url(#${id}p)`} />
      <rect x="12" y="166" width="16" height="6" rx="2" fill="#7D8A94" />
      <polygon points="14,172 26,172 21.5,214 18.5,214" fill={`url(#${id}t)`} opacity="0.8" />
      <circle cx="20" cy="217" r="3" fill="#3C86B8" />
    </>
  );
}

/* ----------------------------------------------------------------- petri */
function drawPetri(id: string) {
  const colonies = [
    [52, 58, 6, "#FFF6DE"],
    [70, 48, 4, "#E57F7F"],
    [98, 62, 7, "#FFF6DE"],
    [84, 74, 4, "#9BD1A8"],
    [60, 74, 5, "#E57F7F"],
    [110, 50, 3, "#9BD1A8"],
    [40, 66, 3, "#FFFFFF"],
    [118, 70, 4, "#FFF6DE"],
  ] as const;
  return (
    <>
      <defs>
        <radialGradient id={`${id}a`} cx="0.45" cy="0.4" r="0.7">
          <stop offset="0" stopColor="#F6DD92" />
          <stop offset="1" stopColor="#C98E2F" />
        </radialGradient>
      </defs>
      <ellipse cx="80" cy="70" rx="76" ry="38" fill="rgba(140, 160, 176, 0.45)" />
      <ellipse cx="80" cy="60" rx="76" ry="38" fill={GLASS} stroke={GLASS_EDGE} strokeWidth="1.5" />
      <ellipse cx="80" cy="61" rx="66" ry="31" fill={`url(#${id}a)`} />
      {colonies.map(([x, y, r, c]) => (
        <ellipse key={`${x}-${y}`} cx={x} cy={y} rx={r} ry={r * 0.6} fill={c} opacity="0.95" />
      ))}
      <path d="M22 44 Q50 22 110 26" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.7" />
    </>
  );
}

/* ----------------------------------------------------------------- flask */
const FLASK = "M46 8 H74 V14 H70 V56 L112 140 Q116 152 104 152 H16 Q4 152 8 140 L50 56 V14 H46 Z";
function drawFlask(id: string, variant: number) {
  const tints: [string, string][] = [
    ["#2F8C7A", "#7ED3C0"],
    ["#7A4FB0", "#C7A7EE"],
    ["#2E6D96", "#9FD0F0"],
  ];
  const [dark, light] = tints[variant % tints.length];
  return (
    <>
      <defs>
        <Cylinder id={`${id}l`} dark={dark} light={light} />
        <clipPath id={`${id}c`}>
          <path d={FLASK} />
        </clipPath>
      </defs>
      <path d={FLASK} fill={GLASS} />
      <g clipPath={`url(#${id}c)`}>
        <rect x="0" y="98" width="120" height="60" fill={`url(#${id}l)`} opacity="0.9" />
        <ellipse cx="60" cy="98" rx="40" ry="4" fill={light} />
        <circle cx="48" cy="126" r="4" fill="#FFFFFF" opacity="0.5" />
        <circle cx="70" cy="136" r="2.5" fill="#FFFFFF" opacity="0.5" />
        <circle cx="62" cy="114" r="2" fill="#FFFFFF" opacity="0.5" />
      </g>
      {[80, 96, 112].map((y) => (
        <line key={y} x1="76" x2="86" y1={y} y2={y} stroke="#FFFFFF" strokeWidth="1.5" opacity="0.8" />
      ))}
      <path d={FLASK} fill="none" stroke={GLASS_EDGE} strokeWidth="2" />
      <path d="M54 20 V58 L22 136" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.55" />
    </>
  );
}

/* ---------------------------------------------------------------- beaker */
const BEAKER = "M14 10 H96 L92 16 V128 Q92 136 84 136 H26 Q18 136 18 128 V16 L10 10 Z";
function drawBeaker(id: string) {
  return (
    <>
      <defs>
        <Cylinder id={`${id}l`} dark="#2E6D96" light="#9FD0F0" />
        <clipPath id={`${id}c`}>
          <path d={BEAKER} />
        </clipPath>
      </defs>
      <path d={BEAKER} fill={GLASS} />
      <g clipPath={`url(#${id}c)`}>
        <rect x="0" y="64" width="110" height="80" fill={`url(#${id}l)`} opacity="0.85" />
        <ellipse cx="55" cy="64" rx="37" ry="3.5" fill="#BFE3F7" />
        {[
          [40, 110, 4],
          [62, 92, 3],
          [52, 124, 2.5],
          [74, 116, 2],
        ].map(([x, y, r]) => (
          <circle key={`${x}${y}`} cx={x} cy={y} r={r} fill="#FFFFFF" opacity="0.55" />
        ))}
      </g>
      {[36, 52, 68, 84, 100, 116].map((y, i) => (
        <line key={y} x1={i % 2 ? 76 : 70} x2="86" y1={y} y2={y} stroke="#FFFFFF" strokeWidth="1.5" opacity="0.85" />
      ))}
      <path d={BEAKER} fill="none" stroke={GLASS_EDGE} strokeWidth="2" />
      <rect x="24" y="20" width="4" height="104" rx="2" fill="#FFFFFF" opacity="0.5" />
    </>
  );
}

/* ----------------------------------------------------------------- slide */
function drawSlide(id: string) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}s`}>
          <stop offset="0" stopColor="#C85C7E" stopOpacity="0.85" />
          <stop offset="0.7" stopColor="#E7A3B6" stopOpacity="0.7" />
          <stop offset="1" stopColor="#E7A3B6" stopOpacity="0" />
        </radialGradient>
      </defs>
      <rect x="6" y="14" width="192" height="54" rx="4" fill="rgba(120, 140, 155, 0.25)" />
      <rect x="4" y="8" width="192" height="54" rx="4" fill="rgba(215, 230, 240, 0.55)" stroke={GLASS_EDGE} strokeWidth="1.5" />
      <rect x="4" y="8" width="46" height="54" rx="4" fill="#FFFFFF" opacity="0.85" />
      {[20, 28, 36].map((y) => (
        <rect key={y} x="12" y={y} width={y === 36 ? 18 : 30} height="3" rx="1.5" fill="#7C8994" />
      ))}
      <rect x="12" y="46" width="30" height="8" style={capStyle("lavender")} />
      <ellipse cx="124" cy="35" rx="50" ry="19" fill={`url(#${id}s)`} />
      <rect x="80" y="12" width="92" height="46" fill="#FFFFFF" fillOpacity="0.16" stroke="#FFFFFF" strokeOpacity="0.7" />
    </>
  );
}

/* ------------------------------------------------------------ blood cells */
function drawRbc(id: string) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}r`}>
          <stop offset="0" stopColor="#E88A86" />
          <stop offset="0.38" stopColor="#D65B5B" />
          <stop offset="0.72" stopColor="#B3363A" />
          <stop offset="1" stopColor="#7E1A1E" />
        </radialGradient>
      </defs>
      <circle cx="50" cy="50" r="44" fill={`url(#${id}r)`} />
      <circle cx="50" cy="50" r="22" fill="none" stroke="#7E1A1E" strokeOpacity="0.25" strokeWidth="6" />
      <ellipse cx="34" cy="28" rx="14" ry="7" fill="#FFFFFF" opacity="0.28" transform="rotate(-30 34 28)" />
    </>
  );
}

function drawWbc(id: string) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}c`} cx="0.4" cy="0.35">
          <stop offset="0" stopColor="#F8F2FB" />
          <stop offset="1" stopColor="#CDB6E2" />
        </radialGradient>
        <Sphere id={`${id}n`} color="#7B5AAE" core="#A68AD0" />
      </defs>
      <circle cx="50" cy="50" r="44" fill={`url(#${id}c)`} stroke="#B89AD6" strokeWidth="2" />
      <circle cx="38" cy="44" r="16" fill={`url(#${id}n)`} />
      <circle cx="60" cy="38" r="14" fill={`url(#${id}n)`} />
      <circle cx="54" cy="62" r="15" fill={`url(#${id}n)`} />
      {[
        [24, 62],
        [72, 60],
        [66, 22],
        [30, 26],
        [44, 80],
        [78, 44],
      ].map(([x, y]) => (
        <circle key={`${x}${y}`} cx={x} cy={y} r="2" fill="#9E7CC6" opacity="0.8" />
      ))}
    </>
  );
}

/**
 * Trigonometry on the server (Node) and in the browser can differ in the last
 * binary digit, so an unrounded coordinate renders as two different strings and
 * React reports a hydration mismatch. Two decimals is far below a pixel.
 */
function round2(n: number) {
  return Math.round(n * 100) / 100;
}

/* ------------------------------------------------------------------- dna */
const DNA_RUNGS = Array.from({ length: 14 }, (_, i) => 12 + i * 16);
function helixX(y: number, phase: number) {
  return round2(40 + 28 * Math.sin(y / 18 + phase));
}
const DNA_A = Array.from({ length: 58 }, (_, i) => `${helixX(4 + i * 4, 0).toFixed(1)},${4 + i * 4}`).join(" ");
const DNA_B = Array.from({ length: 58 }, (_, i) => `${helixX(4 + i * 4, Math.PI).toFixed(1)},${4 + i * 4}`).join(" ");
function drawDna() {
  return (
    <>
      {DNA_RUNGS.map((y, i) => (
        <line
          key={y}
          x1={helixX(y, 0)}
          x2={helixX(y, Math.PI)}
          y1={y}
          y2={y}
          style={capStyle(CAPS[i % CAPS.length], "stroke")}
          strokeWidth="4"
          strokeLinecap="round"
        />
      ))}
      <polyline points={DNA_A} fill="none" stroke="#3C86B8" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
      <polyline points={DNA_B} fill="none" stroke="#8E6CC4" strokeWidth="6" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

/* -------------------------------------------------------------- molecule */
function drawMolecule(id: string) {
  const ring = Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return [round2(80 + 36 * Math.cos(a)), round2(70 + 36 * Math.sin(a))] as const;
  });
  const colours = ["c", "o", "c", "n", "c", "c"];
  return (
    <>
      <defs>
        <Sphere id={`${id}c`} color="#5B6770" core="#AEB9C1" />
        <Sphere id={`${id}o`} color="#C9423E" core="#F29A96" />
        <Sphere id={`${id}n`} color="#3F72B5" core="#9CC3EE" />
        <Sphere id={`${id}h`} color="#DDE3E8" core="#FFFFFF" />
      </defs>
      <line x1={ring[0][0]} y1={ring[0][1]} x2="80" y2="8" stroke="#9AA7B1" strokeWidth="5" />
      <line x1={ring[3][0]} y1={ring[3][1]} x2="80" y2="132" stroke="#9AA7B1" strokeWidth="5" />
      <line x1={ring[1][0]} y1={ring[1][1]} x2="146" y2="40" stroke="#9AA7B1" strokeWidth="5" />
      {ring.map(([x, y], i) => {
        const [nx, ny] = ring[(i + 1) % 6];
        return <line key={i} x1={x} y1={y} x2={nx} y2={ny} stroke="#9AA7B1" strokeWidth="6" />;
      })}
      <circle cx="80" cy="8" r="7" fill={`url(#${id}h)`} />
      <circle cx="80" cy="132" r="7" fill={`url(#${id}h)`} />
      <circle cx="146" cy="40" r="9" fill={`url(#${id}o)`} />
      {ring.map(([x, y], i) => (
        <circle key={`a${i}`} cx={x} cy={y} r="11" fill={`url(#${id}${colours[i]})`} />
      ))}
    </>
  );
}

/* ------------------------------------------------------------ microplate */
function drawMicroplate(id: string, variant: number) {
  const wells: ReactNode[] = [];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 12; c++) {
      const filled = (r * 5 + c * 3 + variant) % 4 === 0;
      wells.push(
        <circle
          key={`${r}-${c}`}
          cx={22 + c * 16}
          cy={32 + r * 13}
          r="5.5"
          fill={filled ? undefined : "#E6ECF0"}
          style={filled ? capStyle(CAPS[(r + c) % CAPS.length]) : undefined}
          stroke="#B5C2CB"
          strokeWidth="1"
        />
      );
    }
  }
  return (
    <>
      <defs>
        <linearGradient id={`${id}p`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#F7F9FB" />
          <stop offset="1" stopColor="#D3DCE2" />
        </linearGradient>
      </defs>
      <rect x="4" y="22" width="212" height="124" rx="10" fill="#A9B7C1" />
      <rect x="4" y="14" width="212" height="124" rx="10" fill={`url(#${id}p)`} stroke="#B5C2CB" strokeWidth="1.5" />
      {wells}
    </>
  );
}

/* --------------------------------------------------------------- droplet */
function drawDroplet(id: string) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}d`} cx="0.4" cy="0.6" r="0.7">
          <stop offset="0" stopColor="#BFE3F7" />
          <stop offset="1" stopColor="#2E6D96" />
        </radialGradient>
      </defs>
      <path d="M30 4 C30 4 54 36 54 52 A24 24 0 0 1 6 52 C6 36 30 4 30 4 Z" fill={`url(#${id}d)`} />
      <ellipse cx="20" cy="50" rx="5" ry="10" fill="#FFFFFF" opacity="0.5" />
    </>
  );
}

/* ------------------------------------------------------------ centrifuge */
function drawCentrifuge(id: string) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}r`} cx="0.45" cy="0.4">
          <stop offset="0" stopColor="#FAFCFD" />
          <stop offset="1" stopColor="#B7C3CB" />
        </radialGradient>
        <linearGradient id={`${id}h`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#E3E9EE" />
          <stop offset="1" stopColor="#8E9CA6" />
        </linearGradient>
      </defs>
      <circle cx="100" cy="100" r="96" fill={`url(#${id}h)`} />
      <circle cx="100" cy="100" r="80" fill={`url(#${id}r)`} stroke="#8E9CA6" strokeWidth="2" />
      {Array.from({ length: 8 }, (_, i) => (
        <g key={i} transform={`rotate(${i * 45} 100 100)`}>
          <rect x="92" y="26" width="16" height="50" rx="7" fill="rgba(160, 180, 195, 0.6)" stroke="#FFFFFF" strokeWidth="1.2" />
          <rect x="94" y="46" width="12" height="28" rx="5" fill={BLOOD[1]} />
          <rect x="90" y="20" width="20" height="12" rx="3" style={capStyle(CAPS[i % CAPS.length])} />
        </g>
      ))}
      <circle cx="100" cy="100" r="22" fill="#3B4852" />
      <circle cx="100" cy="100" r="8" fill="#9AA7B1" />
      <path d="M40 60 A70 70 0 0 1 100 30" fill="none" stroke="#FFFFFF" strokeWidth="4" strokeLinecap="round" opacity="0.6" />
    </>
  );
}

/* --------------------------------------------------------------- cuvette */
function drawCuvette(id: string) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}l`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#E0A6EE" />
          <stop offset="1" stopColor="#9A55B8" />
        </linearGradient>
      </defs>
      <rect x="8" y="50" width="34" height="74" fill={`url(#${id}l)`} opacity="0.8" />
      <rect x="8" y="8" width="34" height="116" rx="2" fill={GLASS} stroke={GLASS_EDGE} strokeWidth="1.5" />
      <rect x="8" y="8" width="7" height="116" fill="#FFFFFF" opacity="0.6" />
      <rect x="35" y="8" width="7" height="116" fill="#FFFFFF" opacity="0.6" />
      <rect x="5" y="3" width="40" height="7" rx="2" fill="#DCE3E8" stroke={GLASS_EDGE} />
    </>
  );
}

/* ------------------------------------------------------------------- box */
function drawBox(id: string, variant: number) {
  const cap = CAPS[(variant + 3) % CAPS.length];
  return (
    <>
      <defs>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#F2DDB4" />
          <stop offset="1" stopColor="#DDBD86" />
        </linearGradient>
      </defs>
      <polygon points="80,8 150,40 80,72 10,40" fill={`url(#${id}t)`} />
      <polygon points="10,40 80,72 80,132 10,100" fill="#CFA869" />
      <polygon points="80,72 150,40 150,100 80,132" fill="#B88D4E" />
      <polygon points="60,17 72,12 142,44 130,49" fill="#E8D1A4" opacity="0.8" />
      <g transform="matrix(1 -0.457 0 1 80 72)">
        <rect x="12" y="12" width="46" height="34" rx="2" fill="#FFFFFF" />
        <rect x="12" y="12" width="46" height="7" style={capStyle(cap)} />
        {BARS.slice(0, 10).map((d, i) => (
          <rect key={d} x={17 + d} y="24" width={i % 3 === 0 ? 2.2 : 1.1} height="16" fill="#1C2630" />
        ))}
      </g>
      <polygon points="10,40 80,72 80,76 10,44" fill="#000000" opacity="0.08" />
    </>
  );
}

/* ---------------------------------------------------------------- report */
function drawReport(id: string) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}h`} x1="0" x2="1">
          <stop offset="0" stopColor="#14476B" />
          <stop offset="1" stopColor="#2E6D96" />
        </linearGradient>
      </defs>
      <rect x="12" y="12" width="128" height="168" rx="4" fill="rgba(20, 40, 60, 0.18)" />
      <rect x="6" y="6" width="128" height="168" rx="4" fill="#FFFFFF" stroke="#D5DDE3" />
      <rect x="6" y="6" width="128" height="24" rx="4" fill={`url(#${id}h)`} />
      <rect x="14" y="14" width="40" height="4" rx="2" fill="#FFFFFF" opacity="0.9" />
      {[42, 52, 62, 72, 82].map((y, i) => (
        <g key={y}>
          <rect x="16" y={y} width={[60, 48, 66, 40, 56][i]} height="4" rx="2" fill="#B9C4CC" />
          <rect x="100" y={y} width="22" height="4" rx="2" fill={i === 2 ? "#B33A2B" : "#7C8994"} />
        </g>
      ))}
      <rect x="16" y="98" width="108" height="50" rx="3" fill="#F2F6F8" />
      <polyline points="22,138 38,126 54,132 70,112 86,118 102,104 118,110" fill="none" stroke="#1A6E45" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M86 162 q8 -10 14 0 t14 -2 t12 0" fill="none" stroke="#14476B" strokeWidth="2" />
    </>
  );
}

/* ------------------------------------------------------------ microscope */
function drawMicroscope(id: string) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}a`} x1="0" x2="1">
          <stop offset="0" stopColor="#9AA8B2" />
          <stop offset="0.45" stopColor="#F2F5F7" />
          <stop offset="1" stopColor="#8795A0" />
        </linearGradient>
        <linearGradient id={`${id}d`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#4A5A67" />
          <stop offset="1" stopColor="#1C2630" />
        </linearGradient>
      </defs>
      <path d="M20 180 H140 Q150 180 150 190 V198 H10 V190 Q10 180 20 180 Z" fill={`url(#${id}d)`} />
      <path d="M104 182 V150 Q134 138 130 98 Q126 58 98 40 L84 56 Q106 70 108 100 Q110 128 88 138 V182 Z" fill={`url(#${id}a)`} />
      <rect x="28" y="120" width="96" height="10" rx="2" fill={`url(#${id}d)`} />
      <rect x="44" y="114" width="40" height="6" fill="rgba(215, 230, 240, 0.9)" />
      <polygon points="52,22 76,20 88,98 66,102" fill={`url(#${id}a)`} />
      <polygon points="48,6 78,4 80,24 50,26" fill={`url(#${id}d)`} />
      <polygon points="66,100 84,97 86,112 70,114" fill="#C89B2E" />
      <circle cx="112" cy="116" r="13" fill={`url(#${id}d)`} />
      <circle cx="108" cy="112" r="4" fill="#FFFFFF" opacity="0.35" />
      <circle cx="76" cy="168" r="7" fill="#F6DD92" opacity="0.9" />
    </>
  );
}

/* -------------------------------------------------------------- bacteria */
function drawBacteria(id: string) {
  return (
    <>
      <defs>
        <linearGradient id={`${id}b`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#9FDBB8" />
          <stop offset="1" stopColor="#2F7A52" />
        </linearGradient>
      </defs>
      <path d="M124 30 q8 -12 16 0 t16 0" fill="none" stroke="#3E8E63" strokeWidth="2.5" strokeLinecap="round" transform="translate(-20 0)" />
      <path d="M16 30 q-8 12 -16 0" fill="none" stroke="#3E8E63" strokeWidth="2.5" strokeLinecap="round" transform="translate(6 0)" />
      <rect x="16" y="12" width="108" height="36" rx="18" fill={`url(#${id}b)`} />
      <rect x="30" y="17" width="70" height="7" rx="3.5" fill="#FFFFFF" opacity="0.35" />
      {[40, 62, 84, 104].map((x) => (
        <circle key={x} cx={x} cy="34" r="3" fill="#1F5C3C" opacity="0.5" />
      ))}
    </>
  );
}

/* ------------------------------------------------------------------ atom */
function drawAtom(id: string) {
  return (
    <>
      <defs>
        <Sphere id={`${id}p`} color="#C9423E" core="#F29A96" />
        <Sphere id={`${id}n`} color="#6F7D87" core="#C5CED5" />
        <Sphere id={`${id}e`} color="#3C86B8" core="#BFE3F7" />
      </defs>
      {[0, 60, 120].map((a) => (
        <g key={a} transform={`rotate(${a} 80 80)`}>
          <ellipse cx="80" cy="80" rx="72" ry="24" fill="none" stroke="#6BA5CE" strokeWidth="2.5" opacity="0.8" />
          <circle cx="152" cy="80" r="6" fill={`url(#${id}e)`} />
        </g>
      ))}
      <circle cx="74" cy="76" r="9" fill={`url(#${id}p)`} />
      <circle cx="87" cy="78" r="9" fill={`url(#${id}n)`} />
      <circle cx="78" cy="89" r="9" fill={`url(#${id}n)`} />
      <circle cx="84" cy="70" r="8" fill={`url(#${id}p)`} />
    </>
  );
}

/* ---------------------------------------------------------------- bubble */
function drawBubble(id: string) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}b`}>
          <stop offset="0.6" stopColor="#FFFFFF" stopOpacity="0.05" />
          <stop offset="1" stopColor="#8FC3E6" stopOpacity="0.45" />
        </radialGradient>
      </defs>
      <circle cx="30" cy="30" r="26" fill={`url(#${id}b)`} stroke="#FFFFFF" strokeOpacity="0.85" strokeWidth="1.5" />
      <path d="M14 22 A18 18 0 0 1 28 10" fill="none" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" opacity="0.8" />
    </>
  );
}

/* ----------------------------------------------------------------- clock */
function drawClock(id: string) {
  return (
    <>
      <defs>
        <radialGradient id={`${id}f`} cx="0.45" cy="0.4">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#DCE3E8" />
        </radialGradient>
      </defs>
      <rect x="52" y="0" width="16" height="12" rx="3" fill="#14476B" />
      <rect x="18" y="16" width="12" height="8" rx="3" fill="#14476B" transform="rotate(-40 24 20)" />
      <circle cx="60" cy="66" r="50" fill={`url(#${id}f)`} stroke="#14476B" strokeWidth="8" />
      {Array.from({ length: 12 }, (_, i) => (
        <line
          key={i}
          x1="60"
          x2="60"
          y1="24"
          y2={i % 3 === 0 ? 34 : 30}
          stroke="#4A5A67"
          strokeWidth={i % 3 === 0 ? 3 : 1.5}
          transform={`rotate(${i * 30} 60 66)`}
        />
      ))}
      <line x1="60" y1="66" x2="60" y2="38" stroke="#16212B" strokeWidth="4" strokeLinecap="round" />
      <line x1="60" y1="66" x2="82" y2="76" stroke="#B33A2B" strokeWidth="3" strokeLinecap="round" />
      <circle cx="60" cy="66" r="5" fill="#16212B" />
    </>
  );
}

/* ---------------------------------------------------------------- shield */
function drawShield(id: string) {
  const path = "M60 6 L108 24 V66 Q108 108 60 134 Q12 108 12 66 V24 Z";
  return (
    <>
      <defs>
        <linearGradient id={`${id}s`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#3C7FAE" />
          <stop offset="1" stopColor="#14476B" />
        </linearGradient>
      </defs>
      <path d={path} fill={`url(#${id}s)`} />
      <path d="M60 16 L98 30 V66 Q98 100 60 122" fill="none" stroke="#FFFFFF" strokeWidth="3" opacity="0.3" />
      <path d="M38 70 L54 86 L84 52" fill="none" stroke="#FFFFFF" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
    </>
  );
}

/* ----------------------------------------------------------- thermometer */
function drawThermometer(id: string) {
  return (
    <>
      <defs>
        <Sphere id={`${id}b`} color="#C94444" core="#F29A96" />
      </defs>
      <rect x="12" y="6" width="16" height="176" rx="8" fill={GLASS} stroke={GLASS_EDGE} strokeWidth="1.5" />
      <rect x="16.5" y="64" width="7" height="118" rx="3.5" fill="#C94444" />
      <circle cx="20" cy="180" r="16" fill={`url(#${id}b)`} />
      {Array.from({ length: 9 }, (_, i) => (
        <line key={i} x1="30" x2={i % 2 ? 35 : 38} y1={24 + i * 16} y2={24 + i * 16} stroke="#7C8994" strokeWidth="1.5" />
      ))}
      <rect x="15" y="12" width="3" height="150" rx="1.5" fill="#FFFFFF" opacity="0.55" />
    </>
  );
}

/* ------------------------------------------------------------ barcodeTag */
function drawBarcodeTag(id: string, variant: number) {
  const cap = CAPS[(variant + 4) % CAPS.length];
  const widths = [3, 1, 2, 1, 1, 3, 2, 1, 3, 1, 2, 2, 1, 3, 1, 1, 2, 3, 1, 2, 1, 3, 1, 2];
  let x = 44;
  return (
    <>
      <defs>
        <linearGradient id={`${id}t`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#FFFFFF" />
          <stop offset="1" stopColor="#E9EEF2" />
        </linearGradient>
      </defs>
      <rect x="8" y="12" width="150" height="64" rx="8" fill="rgba(20, 40, 60, 0.15)" />
      <rect x="4" y="8" width="150" height="64" rx="8" fill={`url(#${id}t)`} stroke="#D5DDE3" />
      <rect x="4" y="8" width="150" height="10" rx="4" style={capStyle(cap)} />
      <circle cx="22" cy="42" r="7" fill="#DCE3E8" stroke="#B5C2CB" />
      {widths.map((wd, i) => {
        const bar = i % 2 === 0 ? <rect key={i} x={x} y="26" width={wd * 1.6} height="30" fill="#1C2630" /> : null;
        x += wd * 1.6 + 1.6;
        return bar;
      })}
      <rect x="44" y="60" width="64" height="4" rx="2" fill="#7C8994" />
    </>
  );
}

export const OBJECTS: Record<SceneObject, ObjectDef> = {
  tube: { w: 48, h: 200, scale: 1, draw: drawTube },
  vial: { w: 50, h: 90, scale: 1, draw: drawVial },
  rack: { w: 220, h: 150, scale: 3.2, draw: drawRack },
  pipette: { w: 40, h: 222, scale: 0.9, draw: drawPipette },
  petri: { w: 160, h: 110, scale: 2.6, draw: drawPetri },
  flask: { w: 120, h: 160, scale: 2.1, draw: drawFlask },
  beaker: { w: 110, h: 140, scale: 1.9, draw: drawBeaker },
  slide: { w: 200, h: 70, scale: 3, draw: drawSlide },
  rbc: { w: 100, h: 100, scale: 1.5, draw: drawRbc },
  wbc: { w: 100, h: 100, scale: 1.6, draw: drawWbc },
  dna: { w: 80, h: 240, scale: 1.4, draw: drawDna },
  molecule: { w: 160, h: 140, scale: 2.4, draw: drawMolecule },
  microplate: { w: 220, h: 150, scale: 3.2, draw: drawMicroplate },
  droplet: { w: 60, h: 80, scale: 1, draw: drawDroplet },
  centrifuge: { w: 200, h: 200, scale: 3, draw: drawCentrifuge },
  cuvette: { w: 50, h: 130, scale: 0.9, draw: drawCuvette },
  box: { w: 160, h: 140, scale: 2.4, draw: drawBox },
  report: { w: 146, h: 186, scale: 2.2, draw: drawReport },
  microscope: { w: 160, h: 200, scale: 2.6, draw: drawMicroscope },
  bacteria: { w: 160, h: 60, scale: 2.2, draw: drawBacteria },
  atom: { w: 160, h: 160, scale: 2.4, draw: drawAtom },
  bubble: { w: 60, h: 60, scale: 1, draw: drawBubble },
  clock: { w: 120, h: 120, scale: 1.8, draw: drawClock },
  shield: { w: 120, h: 140, scale: 1.8, draw: drawShield },
  thermometer: { w: 40, h: 200, scale: 0.7, draw: drawThermometer },
  barcodeTag: { w: 162, h: 80, scale: 2.4, draw: drawBarcodeTag },
};

/** One drawn object, sized by its container's width. */
export function LabObject({ object, variant = 0 }: { object: SceneObject; variant?: number }) {
  const id = `lfo${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const def = OBJECTS[object];
  return (
    <svg
      viewBox={`0 0 ${def.w} ${def.h}`}
      className="block h-auto w-full overflow-visible"
      focusable="false"
      aria-hidden="true"
    >
      {def.draw(id, variant)}
    </svg>
  );
}
