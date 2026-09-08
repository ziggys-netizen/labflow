"use client";

import { useEffect, useState } from "react";

const SESSION_KEY = "labflow.wordmarkAnimated";

export type LabFlowWordmarkProps = {
  /**
   * When true, may play the open→closed animation once per browser session.
   * Only the sign-in screen should pass this. Auth must never wait on it.
   */
  animate?: boolean;
  className?: string;
  /** Visual size of the wordmark text. */
  size?: "sm" | "md" | "lg";
};

/**
 * Closed mark is `LabFlow` (bar width 0). Animated mark starts open
 * (`Lab — Flow`) and CSS-closes over 600ms ease-out. Reduced motion and
 * repeat visits in the same session stay closed.
 */
export default function LabFlowWordmark({
  animate = false,
  className = "",
  size = "md",
}: LabFlowWordmarkProps) {
  const [play, setPlay] = useState(false);

  useEffect(() => {
    if (!animate) return;
    let shouldPlay = false;
    try {
      const reduced =
        typeof window !== "undefined" &&
        window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const already = sessionStorage.getItem(SESSION_KEY);
      if (!reduced && !already) {
        sessionStorage.setItem(SESSION_KEY, "1");
        shouldPlay = true;
      } else if (!already) {
        sessionStorage.setItem(SESSION_KEY, "1");
      }
    } catch {
      // Private mode: skip animation rather than risk a loop.
    }
    setPlay(shouldPlay);
  }, [animate]);

  const sizeClass =
    size === "lg" ? "text-2xl" : size === "sm" ? "text-sm" : "text-lg";

  return (
    <span
      className={`lf-wordmark ${play ? "lf-wordmark--animate" : ""} ${sizeClass} ${className}`.trim()}
      aria-label="LabFlow"
    >
      <span className="lf-wordmark-accent" aria-hidden />
      <span className="lf-wordmark-text" aria-hidden>
        <span className="lf-wordmark-lab">Lab</span>
        <span className="lf-wordmark-bar" />
        <span className="lf-wordmark-flow">Flow</span>
      </span>
    </span>
  );
}
