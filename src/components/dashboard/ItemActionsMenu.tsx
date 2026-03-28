"use client";

import { MoreVertical, Trash2 } from "lucide-react";
import { useState, useRef, useEffect, useLayoutEffect } from "react";
import { createPortal } from "react-dom";

export interface ActionItem {
  id: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  destructive?: boolean;
}

interface ItemActionsMenuProps {
  actions: ActionItem[];
  ariaLabel?: string;
  /** Optional: align menu to the right edge of the trigger */
  alignRight?: boolean;
  /** When true, use light trigger background for visibility on dark cards (e.g. main folders) */
  triggerOnDark?: boolean;
}

const MENU_MIN_WIDTH_PX = 160;

const HIDDEN_OFFSCREEN: React.CSSProperties = {
  position: "fixed",
  left: -9999,
  top: 0,
  visibility: "hidden",
  pointerEvents: "none",
};

export default function ItemActionsMenu({
  actions,
  ariaLabel = "Actions",
  alignRight = false,
  triggerOnDark = false,
}: ItemActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const portalMenuRef = useRef<HTMLDivElement>(null);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open) {
      setMenuStyle(null);
      return;
    }

    const place = () => {
      const trigger = triggerRef.current;
      const menu = portalMenuRef.current;
      if (!trigger || !menu) return;

      const r = trigger.getBoundingClientRect();
      const vw = window.innerWidth;
      const vh = window.innerHeight;
      const edge = 8;
      const left = alignRight
        ? Math.min(vw - MENU_MIN_WIDTH_PX - edge, Math.max(edge, r.right - MENU_MIN_WIDTH_PX))
        : Math.min(vw - MENU_MIN_WIDTH_PX - edge, Math.max(edge, r.left));

      const h = menu.getBoundingClientRect().height;
      const gap = 4;
      const spaceBelow = vh - r.bottom - edge;
      const spaceAbove = r.top - edge;
      const preferBelow = h <= spaceBelow || spaceBelow >= spaceAbove;

      const base: React.CSSProperties = {
        left,
        visibility: "visible",
        right: "auto",
      };

      let next: React.CSSProperties;

      if (preferBelow) {
        const top = r.bottom + gap;
        const maxH = vh - top - edge;
        if (h > maxH) {
          next = {
            ...base,
            top,
            bottom: "auto",
            maxHeight: Math.max(96, maxH),
            overflowY: "auto",
          };
        } else {
          next = { ...base, top, bottom: "auto", maxHeight: undefined, overflowY: undefined };
        }
      } else {
        const bottom = vh - r.top + gap;
        const maxH = r.top - edge - gap;
        if (h > maxH) {
          next = {
            ...base,
            bottom,
            top: "auto",
            maxHeight: Math.max(96, maxH),
            overflowY: "auto",
          };
        } else {
          next = { ...base, bottom, top: "auto", maxHeight: undefined, overflowY: undefined };
        }
      }

      setMenuStyle(next);
    };

    place();
    const id = requestAnimationFrame(place);
    return () => cancelAnimationFrame(id);
  }, [open, alignRight, actions.length]);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (e: MouseEvent | TouchEvent) => {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (portalMenuRef.current?.contains(t)) return;
      setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("touchstart", onPointerDown, { passive: true });
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("touchstart", onPointerDown);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  const menuEl =
    open &&
    typeof document !== "undefined" &&
    createPortal(
      <div
        ref={portalMenuRef}
        className="fixed z-[200] min-w-[140px] rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800"
        style={menuStyle ?? HIDDEN_OFFSCREEN}
        role="menu"
      >
        {actions.map((action) => (
          <button
            key={action.id}
            type="button"
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              action.onClick();
              setOpen(false);
            }}
            className={`flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition-colors ${
              action.destructive
                ? "text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/30"
                : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-700"
            }`}
          >
            {action.icon ?? (action.destructive ? <Trash2 className="h-4 w-4" /> : null)}
            {action.label}
          </button>
        ))}
      </div>,
      document.body
    );

  return (
    <div className="relative" ref={wrapRef}>
      <button
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className={
          triggerOnDark
            ? "rounded-lg p-2 bg-white/90 text-neutral-700 transition-opacity hover:bg-white dark:bg-white/95 dark:text-neutral-800 dark:hover:bg-white"
            : "rounded-lg p-2 text-neutral-500 transition-opacity hover:bg-neutral-100 hover:opacity-100 dark:text-neutral-400 dark:hover:bg-neutral-700"
        }
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <MoreVertical
          className={
            triggerOnDark
              ? "h-4 w-4 text-neutral-700 dark:text-neutral-800"
              : "h-4 w-4 text-neutral-500 dark:text-neutral-400"
          }
        />
      </button>
      {menuEl}
    </div>
  );
}
