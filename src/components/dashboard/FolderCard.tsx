"use client";

import { Folder, Share2 } from "lucide-react";
import { useState } from "react";
import ShareModal from "./ShareModal";
import ItemActionsMenu from "./ItemActionsMenu";

export interface FolderItem {
  name: string;
  type: "folder";
  key: string;
  items: number;
  isShared?: boolean;
  /** Hide share button (e.g. for synced drives) */
  hideShare?: boolean;
  /** Drive ID for navigation (when clickable) */
  driveId?: string;
}

interface FolderCardProps {
  item: FolderItem;
  onClick?: () => void;
  onDelete?: () => void;
}

export default function FolderCard({ item, onClick, onDelete }: FolderCardProps) {
  const [shareOpen, setShareOpen] = useState(false);
  const canNavigate = !!item.driveId && !!onClick;

  const handleDelete = () => {
    if (window.confirm(`Delete "${item.name}"? This will unlink the drive and remove it from your backups.`)) {
      onDelete?.();
    }
  };

  return (
    <>
      <div
        className={`group relative flex flex-col items-center rounded-xl border border-neutral-200 bg-white p-6 transition-colors dark:border-neutral-700 dark:bg-neutral-900 ${
          canNavigate
            ? "cursor-pointer hover:border-bizzi-blue/30 hover:bg-neutral-50/50 dark:hover:border-bizzi-blue/30 dark:hover:bg-neutral-800/50"
            : ""
        }`}
        role={canNavigate ? "button" : undefined}
        tabIndex={canNavigate ? 0 : undefined}
        onClick={canNavigate ? onClick : undefined}
        onKeyDown={
          canNavigate
            ? (e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick?.();
                }
              }
            : undefined
        }
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
        <div className="absolute right-2 top-2 flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
          {!item.hideShare && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setShareOpen(true);
              }}
              className="rounded-lg p-2 hover:bg-neutral-100 dark:hover:bg-neutral-700"
              aria-label="Share folder"
            >
              <Share2 className="h-4 w-4 text-neutral-500 dark:text-neutral-400" />
            </button>
          )}
          {(onDelete || (!item.hideShare && item.driveId)) && (
            <ItemActionsMenu
              actions={[
                ...(!item.hideShare && item.driveId
                  ? [
                      {
                        id: "share",
                        label: "Share",
                        icon: <Share2 className="h-4 w-4" />,
                        onClick: () => setShareOpen(true),
                      },
                    ]
                  : []),
                ...(onDelete
                  ? [
                      {
                        id: "delete",
                        label: "Delete",
                        onClick: handleDelete,
                        destructive: true,
                      },
                    ]
                  : []),
              ]}
              ariaLabel="Folder actions"
              alignRight
            />
          )}
        </div>
      </div>

      <ShareModal
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        folderName={item.name}
        linkedDriveId={item.driveId}
      />
    </>
  );
}
