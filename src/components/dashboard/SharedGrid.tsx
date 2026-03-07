"use client";

import { useMemo, useState } from "react";
import { LayoutGrid, List, Folder, File } from "lucide-react";
import SharedItemCard, { type SharedItem } from "./SharedItemCard";
import { useShares } from "@/hooks/useShares";

export default function SharedGrid() {
  const { owned, invited, loading, error } = useShares();
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filter, setFilter] = useState<"all" | "folders" | "files">("all");

  const sharedItems: SharedItem[] = useMemo(() => {
    const invitedItems: SharedItem[] = invited.map((s) => ({
      name: s.folder_name,
      type: "folder" as const,
      key: s.token,
      sharedBy: s.sharedBy ?? "Someone",
      permission: s.permission,
      href: s.share_url,
    }));
    const ownedItems: SharedItem[] = owned.map((s) => ({
      name: s.folder_name,
      type: "folder" as const,
      key: s.token,
      sharedBy: "You",
      permission: s.permission,
      href: s.share_url,
    }));
    return [...invitedItems, ...ownedItems];
  }, [invited, owned]);

  const filteredItems =
    filter === "all"
      ? sharedItems
      : sharedItems.filter(
          (item) => item.type === (filter === "folders" ? "folder" : "file")
        );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      {/* Filter tabs + view toggle */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1 rounded-lg border border-neutral-200 bg-neutral-50 p-1 dark:border-neutral-700 dark:bg-neutral-800">
          <button
            type="button"
            onClick={() => setFilter("all")}
            className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              filter === "all"
                ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-white"
                : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            }`}
          >
            All
          </button>
          <button
            type="button"
            onClick={() => setFilter("folders")}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              filter === "folders"
                ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-white"
                : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            }`}
          >
            <Folder className="h-4 w-4" />
            Folders
          </button>
          <button
            type="button"
            onClick={() => setFilter("files")}
            className={`flex items-center gap-2 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
              filter === "files"
                ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-white"
                : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            }`}
          >
            <File className="h-4 w-4" />
            Files
          </button>
        </div>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={() => setViewMode("grid")}
            className={`rounded p-2 ${
              viewMode === "grid"
                ? "bg-neutral-200 text-bizzi-blue dark:bg-neutral-700"
                : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
            aria-label="Grid view"
          >
            <LayoutGrid className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={() => setViewMode("list")}
            className={`rounded p-2 ${
              viewMode === "list"
                ? "bg-neutral-200 text-bizzi-blue dark:bg-neutral-700"
                : "text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
            }`}
            aria-label="List view"
          >
            <List className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Content */}
      {error ? (
        <div className="rounded-xl border border-red-200 bg-red-50 py-8 text-center dark:border-red-800 dark:bg-red-950/50">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      ) : loading ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 py-16 dark:border-neutral-700">
          <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-bizzi-blue border-t-transparent" />
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Loading shares…
          </p>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-xl border-2 border-dashed border-neutral-200 py-16 dark:border-neutral-700">
          <Folder className="mb-4 h-16 w-16 text-neutral-300 dark:text-neutral-600" />
          <p className="mb-1 text-lg font-medium text-neutral-700 dark:text-neutral-300">
            No shared {filter === "all" ? "items" : filter} yet
          </p>
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            When someone shares a file or folder with you, it will appear here.
          </p>
        </div>
      ) : viewMode === "grid" ? (
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {filteredItems.map((item) => (
            <SharedItemCard key={item.key} item={item} />
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
          {filteredItems.map((item, i) => (
            <div
              key={item.key}
              className={`flex items-center gap-4 px-4 py-3 transition-colors hover:bg-neutral-50 dark:hover:bg-neutral-800/50 ${
                i > 0 ? "border-t border-neutral-200 dark:border-neutral-700" : ""
              }`}
              role="button"
              tabIndex={0}
            >
              <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20">
                {item.type === "folder" ? (
                  <Folder className="h-5 w-5" />
                ) : (
                  <File className="h-5 w-5" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-neutral-900 dark:text-white">
                  {item.name}
                </p>
                <p className="truncate text-sm text-neutral-500 dark:text-neutral-400">
                  Shared by {item.sharedBy} · {item.permission === "edit" ? "Can edit" : "Can view"}
                </p>
              </div>
              <span
                className={`flex-shrink-0 rounded-full px-2 py-0.5 text-xs font-medium ${
                  item.permission === "edit"
                    ? "bg-bizzi-blue/20 text-bizzi-blue dark:bg-bizzi-blue/30 dark:text-bizzi-cyan"
                    : "bg-neutral-100 text-neutral-600 dark:bg-neutral-700 dark:text-neutral-400"
                }`}
              >
                {item.permission === "edit" ? "Can edit" : "Can view"}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
