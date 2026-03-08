"use client";

import Link from "next/link";
import { File, Folder, Trash2 } from "lucide-react";

export interface SharedItem {
  name: string;
  type: "folder" | "file";
  key: string;
  sharedBy: string;
  permission: "view" | "edit";
  items?: number;
  modifiedAt?: string;
  /** When set, card links to this URL (e.g. share link) */
  href?: string;
}

interface SharedItemCardProps {
  item: SharedItem;
  isOwned?: boolean;
  onDelete?: (e: React.MouseEvent) => void;
}

const cardClassName =
  "group relative flex flex-col items-center rounded-xl border border-neutral-200 bg-white p-6 transition-colors hover:border-bizzi-blue/30 hover:bg-neutral-50/50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-bizzi-blue/30 dark:hover:bg-neutral-800/50";

export default function SharedItemCard({ item, isOwned, onDelete }: SharedItemCardProps) {
  const content = (
    <>
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-xl bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20">
        {item.type === "folder" ? (
          <Folder className="h-8 w-8" />
        ) : (
          <File className="h-8 w-8" />
        )}
      </div>
      <h3 className="mb-1 truncate w-full text-center text-sm font-medium text-neutral-900 dark:text-white">
        {item.name}
      </h3>
      <p className="mb-0.5 truncate w-full text-center text-xs text-neutral-500 dark:text-neutral-400">
        Shared by {item.sharedBy}
      </p>
      <span
        className={`rounded-full px-2 py-0.5 text-xs font-medium ${
          item.permission === "edit"
            ? "bg-bizzi-blue/20 text-bizzi-blue dark:bg-bizzi-blue/30 dark:text-bizzi-cyan"
            : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400"
        }`}
      >
        {item.permission === "edit" ? "Can download" : "Can view"}
      </span>
    </>
  );

  const cardContent = (
    <div className="relative">
      {content}
      {isOwned && onDelete && (
        <button
          type="button"
          onClick={(e) => {
            e.preventDefault();
            e.stopPropagation();
            onDelete(e);
          }}
          className="absolute right-2 top-2 rounded p-1.5 text-neutral-400 opacity-0 transition-opacity hover:bg-red-50 hover:text-red-600 group-hover:opacity-100 dark:hover:bg-red-950/30 dark:hover:text-red-400"
          aria-label="Delete share"
        >
          <Trash2 className="h-4 w-4" />
        </button>
      )}
    </div>
  );

  if (item.href) {
    return (
      <Link href={item.href} className={cardClassName}>
        {cardContent}
      </Link>
    );
  }

  return (
    <div
      className={cardClassName}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") e.preventDefault();
      }}
    >
      {cardContent}
    </div>
  );
}
