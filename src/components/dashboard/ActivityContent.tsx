"use client";

import {
  Upload,
  FolderPlus,
  FileEdit,
  FolderEdit,
  Trash2,
  Link2,
  Link2Off,
  RotateCcw,
} from "lucide-react";
import type { ActivityLogItem } from "@/hooks/useActivityLogs";

const EVENT_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; color: string }
> = {
  file_uploaded: { label: "Uploaded file", icon: Upload, color: "text-green-600 dark:text-green-400" },
  folder_created: { label: "Created folder", icon: FolderPlus, color: "text-green-600 dark:text-green-400" },
  file_renamed: { label: "Renamed file", icon: FileEdit, color: "text-amber-600 dark:text-amber-400" },
  folder_renamed: { label: "Renamed folder", icon: FolderEdit, color: "text-amber-600 dark:text-amber-400" },
  file_moved: { label: "Moved file", icon: FolderEdit, color: "text-amber-600 dark:text-amber-400" },
  folder_moved: { label: "Moved folder", icon: FolderEdit, color: "text-amber-600 dark:text-amber-400" },
  file_deleted: { label: "Deleted file", icon: Trash2, color: "text-red-600 dark:text-red-400" },
  folder_deleted: { label: "Deleted folder", icon: Trash2, color: "text-red-600 dark:text-red-400" },
  file_restored: { label: "Restored file", icon: RotateCcw, color: "text-green-600 dark:text-green-400" },
  folder_restored: { label: "Restored folder", icon: RotateCcw, color: "text-green-600 dark:text-green-400" },
  share_link_created: { label: "Created share link", icon: Link2, color: "text-bizzi-blue dark:text-cyan-400" },
  share_link_removed: { label: "Removed share link", icon: Link2Off, color: "text-neutral-500 dark:text-neutral-400" },
  bulk_upload_completed: { label: "Bulk upload completed", icon: Upload, color: "text-green-600 dark:text-green-400" },
};

function formatTime(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  if (diffMins < 1) return "Just now";
  if (diffMins < 60) return `${diffMins}m ago`;
  if (diffHours < 24) return `${diffHours}h ago`;
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString();
}

function getEventConfig(eventType: string) {
  return EVENT_CONFIG[eventType] ?? {
    label: eventType.replace(/_/g, " "),
    icon: Upload,
    color: "text-neutral-600 dark:text-neutral-400",
  };
}

function EventRow({ item }: { item: ActivityLogItem }) {
  const cfg = getEventConfig(item.event_type);
  const Icon = cfg.icon;
  const targetName = item.target_name ?? item.file_path?.split("/").pop() ?? "item";
  const detail =
    item.event_type === "file_renamed" || item.event_type === "folder_renamed"
      ? item.old_path && item.new_path
        ? `${item.old_path.split("/").pop()} → ${item.new_path.split("/").pop()}`
        : targetName
      : targetName;

  return (
    <div className="flex items-start gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 dark:border-neutral-700 dark:bg-neutral-900">
      <div
        className={`mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-neutral-100 dark:bg-neutral-800 ${cfg.color}`}
      >
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-neutral-900 dark:text-white">
          {cfg.label}
          {detail && (
            <span className="ml-1 font-normal text-neutral-600 dark:text-neutral-400">
              — {detail}
            </span>
          )}
        </p>
        <p className="mt-0.5 text-xs text-neutral-500 dark:text-neutral-400">
          {formatTime(item.created_at)}
        </p>
      </div>
    </div>
  );
}

import { useActivityLogs } from "@/hooks/useActivityLogs";

interface ActivityContentProps {
  scope?: "personal" | "organization";
}

export default function ActivityContent({
  scope = "personal",
}: ActivityContentProps) {
  const { items, loading } = useActivityLogs(scope);

  if (loading && items.length === 0) {
    return (
      <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
        Loading…
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="py-12 text-center">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {scope === "organization"
            ? "Organization activity will appear here when files are uploaded, shared, or changed."
            : "Your recent activity will appear here (uploads, renames, shares, and more)."}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((item) => (
        <EventRow key={item.id} item={item} />
      ))}
    </div>
  );
}
