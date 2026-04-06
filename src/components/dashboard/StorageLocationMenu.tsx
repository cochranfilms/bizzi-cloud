"use client";

import type { ComponentType } from "react";
import { useEffect, useRef, useState } from "react";
import {
  ChevronDown,
  FolderInput,
  FolderPlus,
  Pencil,
  Pin,
  Share2,
} from "lucide-react";

export interface StorageLocationMenuProps {
  /** Current location only, e.g. "Storage" at drive root or the folder you are inside (not a full trail). */
  pathLabel: string;
  /** Whether we're inside a subfolder (not Storage root). */
  isInsideSubfolder: boolean;
  folderPinned: boolean;
  onNewFolder: () => void;
  onRename?: () => void;
  onShare: () => void;
  onMove?: () => void;
  onTogglePin: () => void;
}

export default function StorageLocationMenu({
  pathLabel,
  isInsideSubfolder,
  folderPinned,
  onNewFolder,
  onRename,
  onShare,
  onMove,
  onTogglePin,
}: StorageLocationMenuProps) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handle(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", handle);
    return () => document.removeEventListener("mousedown", handle);
  }, [open]);

  return (
    <div className="relative max-w-[min(100%,28rem)] min-w-0" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="inline-flex max-w-full items-center gap-1 rounded-lg border border-neutral-200 bg-white px-2.5 py-1.5 text-left text-sm font-medium text-neutral-900 shadow-sm hover:bg-neutral-50 dark:border-neutral-600 dark:bg-neutral-900 dark:text-white dark:hover:bg-neutral-800"
        title={pathLabel}
      >
        <span className="truncate">{pathLabel}</span>
        <ChevronDown className={`h-4 w-4 shrink-0 opacity-70 ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? (
        <div className="absolute left-0 top-full z-[60] mt-1 min-w-[240px] rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <MenuRow
            icon={FolderPlus}
            label="New folder"
            onClick={() => {
              onNewFolder();
              setOpen(false);
            }}
          />
          {isInsideSubfolder && onRename ? (
            <MenuRow
              icon={Pencil}
              label="Rename"
              onClick={() => {
                onRename();
                setOpen(false);
              }}
            />
          ) : null}
          <MenuRow
            icon={Share2}
            label="Share"
            onClick={() => {
              onShare();
              setOpen(false);
            }}
          />
          <div className="my-1 border-t border-neutral-100 dark:border-neutral-800" />
          {isInsideSubfolder && onMove ? (
            <MenuRow
              icon={FolderInput}
              label="Move to…"
              onClick={() => {
                onMove();
                setOpen(false);
              }}
            />
          ) : null}
          <MenuRow
            icon={Pin}
            label={folderPinned ? "Remove from Pin" : "Add to Pin"}
            onClick={() => {
              onTogglePin();
              setOpen(false);
            }}
          />
        </div>
      ) : null}
    </div>
  );
}

function MenuRow({
  icon: Icon,
  label,
  onClick,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-800 hover:bg-neutral-100 dark:text-neutral-200 dark:hover:bg-neutral-800"
    >
      <Icon className="h-4 w-4 shrink-0 opacity-80" />
      {label}
    </button>
  );
}
