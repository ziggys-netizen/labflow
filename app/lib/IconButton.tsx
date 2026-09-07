"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEventHandler, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ICON_HIT_AREA_CLASS, iconControlA11y, iconTooltipOpen } from "./iconAction";

type IconButtonBase = {
  label: string;
  children: ReactNode;
  className?: string;
  disabled?: boolean;
  danger?: boolean;
  onClick?: MouseEventHandler<HTMLElement>;
  "aria-expanded"?: boolean;
  "aria-haspopup"?: "menu";
};

type IconButtonProps = IconButtonBase & { href?: string; type?: "button" | "submit" };

function chromeClass(danger: boolean | undefined, disabled: boolean | undefined, extra?: string) {
  return [
    ICON_HIT_AREA_CLASS,
    "inline-flex items-center justify-center rounded-lf-md border border-lf-line bg-lf-surface",
    danger ? "text-lf-crit hover:bg-lf-crit-soft" : "text-lf-ink-2 hover:bg-lf-surface-2 hover:text-lf-ink",
    disabled ? "pointer-events-none opacity-50" : "",
    extra || "",
  ]
    .filter(Boolean)
    .join(" ");
}

/**
 * Icon-only control. Label is required and is used for aria-label and the hover/focus tooltip.
 * Hit area is the D2 44px lf-touch target; the glyph stays smaller.
 */
export default function IconButton({
  label,
  children,
  className,
  disabled,
  danger,
  onClick,
  href,
  type = "button",
  "aria-expanded": ariaExpanded,
  "aria-haspopup": ariaHasPopup,
}: IconButtonProps) {
  const a11y = iconControlA11y(label);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const linkRef = useRef<HTMLAnchorElement>(null);
  const [hover, setHover] = useState(false);
  const [focus, setFocus] = useState(false);
  const [coords, setCoords] = useState({ top: 0, left: 0, below: false });
  const open = iconTooltipOpen({ hover, focus });

  function place() {
    const el = href ? linkRef.current : buttonRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const below = r.top < 36;
    setCoords({
      top: below ? r.bottom + 6 : r.top - 6,
      left: r.left + r.width / 2,
      below,
    });
  }

  useEffect(() => {
    if (!open) return;
    place();
    function dismiss() {
      setHover(false);
      setFocus(false);
    }
    window.addEventListener("scroll", dismiss, true);
    window.addEventListener("resize", dismiss);
    return () => {
      window.removeEventListener("scroll", dismiss, true);
      window.removeEventListener("resize", dismiss);
    };
  }, [open, href]);

  const tooltip =
    open && typeof document !== "undefined"
      ? createPortal(
          <span
            role="tooltip"
            className={[
              "pointer-events-none fixed z-50 -translate-x-1/2 rounded-lf-sm bg-lf-ink px-2 py-1 text-xs text-lf-on-accent shadow-lg",
              coords.below ? "" : "-translate-y-full",
            ].join(" ")}
            style={{ top: coords.top, left: coords.left }}
          >
            {a11y.tooltip}
          </span>,
          document.body
        )
      : null;

  const handlers = {
    onMouseEnter: () => {
      setHover(true);
      place();
    },
    onMouseLeave: () => setHover(false),
    onFocus: () => {
      setFocus(true);
      place();
    },
    onBlur: () => setFocus(false),
    onClick: (e: Parameters<NonNullable<IconButtonBase["onClick"]>>[0]) => {
      setHover(false);
      setFocus(false);
      onClick?.(e);
    },
  };

  const cls = chromeClass(danger, disabled, className);
  const a11yProps = {
    "data-lf-role": "icon-button" as const,
    "aria-label": a11y["aria-label"],
  };

  if (href) {
    return (
      <>
        <Link
          ref={linkRef}
          href={href}
          {...a11yProps}
          aria-disabled={disabled || undefined}
          className={cls}
          onClick={(e) => {
            if (disabled) {
              e.preventDefault();
              e.stopPropagation();
              return;
            }
            handlers.onClick(e);
          }}
          onMouseEnter={handlers.onMouseEnter}
          onMouseLeave={handlers.onMouseLeave}
          onFocus={handlers.onFocus}
          onBlur={handlers.onBlur}
        >
          {children}
        </Link>
        {tooltip}
      </>
    );
  }

  return (
    <>
      <button
        ref={buttonRef}
        type={type}
        {...a11yProps}
        aria-expanded={ariaExpanded}
        aria-haspopup={ariaHasPopup}
        disabled={disabled}
        className={cls}
        onClick={handlers.onClick}
        onMouseEnter={handlers.onMouseEnter}
        onMouseLeave={handlers.onMouseLeave}
        onFocus={handlers.onFocus}
        onBlur={handlers.onBlur}
      >
        {children}
      </button>
      {tooltip}
    </>
  );
}
