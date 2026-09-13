"use client";

import { useEffect, useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import IconButton from "./IconButton";
import { ICON_ACTION_LABELS } from "./iconAction";
import { placeMenu } from "./menuPosition";

/**
 * The "⋯" row menu. The list is drawn at the top of the page, not inside the
 * row, so a table's scroll container and its pinned action column cannot hide
 * it. See app/lib/menuPosition.ts.
 */
export default function MoreMenu({
  open,
  onToggle,
  onClose,
  children,
}: {
  open: boolean;
  onToggle: () => void;
  onClose: () => void;
  children: ReactNode;
}) {
  const triggerRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  // Position is written straight to the element before paint, so the menu
  // never flashes at the wrong place and nothing re-renders on scroll.
  useLayoutEffect(() => {
    if (!open) return;
    function position() {
      const trigger = triggerRef.current;
      const menu = menuRef.current;
      if (!trigger || !menu) return;
      const t = trigger.getBoundingClientRect();
      const { top, left } = placeMenu({
        trigger: { top: t.top, bottom: t.bottom, left: t.left, right: t.right },
        menu: { width: menu.offsetWidth, height: menu.offsetHeight },
        viewport: { width: document.documentElement.clientWidth, height: window.innerHeight },
      });
      menu.style.top = `${top}px`;
      menu.style.left = `${left}px`;
    }
    position();
    window.addEventListener("scroll", position, true);
    window.addEventListener("resize", position);
    return () => {
      window.removeEventListener("scroll", position, true);
      window.removeEventListener("resize", position);
    };
  }, [open]);

  // The list is outside the trigger in the DOM now, so a press inside it must
  // not count as a press outside — that would close the menu on mousedown and
  // the item's click would never arrive.
  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || menuRef.current?.contains(target)) return;
      onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key !== "Escape") return;
      onClose();
      triggerRef.current?.querySelector("button")?.focus();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  return (
    <div ref={triggerRef} className="shrink-0">
      <IconButton
        label={ICON_ACTION_LABELS.more}
        aria-expanded={open}
        aria-haspopup="menu"
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
      >
        <span aria-hidden="true">⋯</span>
      </IconButton>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div
              ref={menuRef}
              role="menu"
              className="fixed left-0 top-0 z-40 min-w-[13rem] max-w-[calc(100vw-1rem)] rounded-lf-md border border-lf-line bg-lf-surface py-1 shadow-lg"
            >
              {children}
            </div>,
            document.body
          )
        : null}
    </div>
  );
}

/**
 * A list renders each row twice — cards on a phone, a table row on a wider
 * screen — with one hidden by CSS. Keying the open menu by layout keeps the
 * hidden copy shut; otherwise it would open too, and now that the list is
 * drawn at the top of the page, CSS on the row would no longer hide it.
 */
export type MenuLayout = "card" | "row";

export function moreMenuKey(where: MenuLayout, id: string) {
  return `${where}:${id}`;
}

export function moreMenuItemClass(danger = false) {
  return [
    // whitespace-nowrap so a two-word action keeps its own line rather than
    // wrapping into something that reads like two separate options.
    "lf-touch flex w-full items-center whitespace-nowrap px-4 text-left text-sm",
    danger ? "text-lf-crit hover:bg-lf-crit-soft" : "text-lf-ink hover:bg-lf-surface-2",
  ].join(" ");
}
