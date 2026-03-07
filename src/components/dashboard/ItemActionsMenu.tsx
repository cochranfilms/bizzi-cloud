"use client";

import { MoreVertical, Trash2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";

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
}

export default function ItemActionsMenu({
  actions,
  ariaLabel = "Actions",
  alignRight = false,
}: ItemActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="rounded-lg p-2 text-neutral-500 transition-opacity hover:bg-neutral-100 hover:opacity-100 dark:text-neutral-400 dark:hover:bg-neutral-700"
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="true"
      >
        <MoreVertical className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
      </button>
      {open && (
        <div
          className={`absolute top-full z-50 mt-1 min-w-[140px] rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800 ${
            alignRight ? "right-0" : "left-0"
          }`}
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
        </div>
      )}
    </div>
  );
}
