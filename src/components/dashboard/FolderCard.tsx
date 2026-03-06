"use client";

import { Folder, Share2 } from "lucide-react";
import { useState } from "react";
import ShareModal from "./ShareModal";

export interface FolderItem {
  name: string;
  type: "folder";
  key: string;
  items: number;
  isShared?: boolean;
  /** Hide share button (e.g. for synced drives) */
  hideShare?: boolean;
}

interface FolderCardProps {
  item: FolderItem;
}

export default function FolderCard({ item }: FolderCardProps) {
  const [shareOpen, setShareOpen] = useState(false);

  return (
    <>
      <div
        className="group relative flex flex-col items-center rounded-xl border border-neutral-200 bg-white p-6 transition-colors hover:border-bizzi-blue/30 hover:bg-neutral-50/50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-bizzi-blue/30 dark:hover:bg-neutral-800/50"
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            // Navigate to folder (placeholder)
          }
        }}
      >
        <div className="relative mb-3">
          <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20">
            <Folder className="h-8 w-8" />
          </div>
          {item.isShared && (
            <div className="absolute -right-1 -top-1 rounded-full bg-bizzi-blue p-1">
              <Share2 className="h-3 w-3 text-white" />
            </div>
          )}
        </div>
        <h3 className="mb-1 truncate w-full text-center text-sm font-medium text-neutral-900 dark:text-white">
          {item.name}
        </h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">
          {item.items} {item.items === 1 ? "item" : "items"}
        </p>
        {!item.hideShare && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setShareOpen(true);
            }}
            className="absolute right-2 top-2 rounded-lg p-2 opacity-0 transition-opacity hover:bg-neutral-100 group-hover:opacity-100 dark:hover:bg-neutral-700"
            aria-label="Share folder"
          >
            <Share2 className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
          </button>
        )}
      </div>

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        folderName={item.name}
      />
    </>
  );
}
