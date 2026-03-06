"use client";

import { FileIcon } from "lucide-react";
import type { RecentFile } from "@/hooks/useCloudFiles";
import ItemActionsMenu from "./ItemActionsMenu";

interface FileCardProps {
  file: RecentFile;
  onClick?: () => void;
  onDelete?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 24 * 60 * 60 * 1000) return d.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });
  if (diff < 7 * 24 * 60 * 60 * 1000) return d.toLocaleDateString(undefined, { weekday: "short" });
  return d.toLocaleDateString();
}

export default function FileCard({ file, onClick, onDelete }: FileCardProps) {
  const canPreview = !!file.objectKey;

  const handleDelete = () => {
    if (window.confirm(`Delete "${file.name}"? This action cannot be undone.`)) {
      onDelete?.();
    }
  };

  return (
    <div
      className={`group relative flex flex-col items-center rounded-xl border border-neutral-200 bg-white p-6 transition-colors dark:border-neutral-700 dark:bg-neutral-900 ${
        canPreview
          ? "cursor-pointer hover:border-bizzi-blue/30 hover:bg-neutral-50/50 dark:hover:border-bizzi-blue/30 dark:hover:bg-neutral-800/50"
          : ""
      }`}
      role={canPreview ? "button" : undefined}
      tabIndex={canPreview ? 0 : undefined}
      onClick={canPreview ? onClick : undefined}
      onKeyDown={
        canPreview
          ? (e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                onClick?.();
              }
            }
          : undefined
      }
    >
      {onDelete && (
        <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100">
          <ItemActionsMenu
            actions={[
              {
                id: "delete",
                label: "Delete",
                onClick: handleDelete,
                destructive: true,
              },
            ]}
            ariaLabel="File actions"
            alignRight
          />
        </div>
      )}
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">
        <FileIcon className="h-8 w-8" />
      </div>
      <h3 className="mb-1 truncate w-full text-center text-sm font-medium text-neutral-900 dark:text-white" title={file.name}>
        {file.name}
      </h3>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {formatBytes(file.size)} · {file.driveName}
      </p>
      <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
        {formatDate(file.modifiedAt)}
      </p>
    </div>
  );
}
