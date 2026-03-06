"use client";

import { useState } from "react";
import { LayoutGrid, List, Folder, File } from "lucide-react";
import SharedItemCard, { type SharedItem } from "./SharedItemCard";

const mockSharedItems: SharedItem[] = [
  {
    name: "Client Assets",
    type: "folder",
    key: "shared-1",
    sharedBy: "sarah@studio.com",
    permission: "edit",
    items: 12,
  },
  {
    name: "Q1 Brand Guidelines.pdf",
    type: "file",
    key: "shared-2",
    sharedBy: "mike@agency.io",
    permission: "view",
  },
  {
    name: "Video B-Roll",
    type: "folder",
    key: "shared-3",
    sharedBy: "alex@films.co",
    permission: "edit",
    items: 8,
  },
  {
    name: "Contract Draft v2.docx",
    type: "file",
    key: "shared-4",
    sharedBy: "legal@bizzicloud.com",
    permission: "edit",
  },
  {
    name: "Project Icons",
    type: "folder",
    key: "shared-5",
    sharedBy: "design@creative.studio",
    permission: "view",
    items: 24,
  },
  {
    name: "Music Stems",
    type: "folder",
    key: "shared-6",
    sharedBy: "jordan@audio.pro",
    permission: "edit",
    items: 6,
  },
];

export default function SharedGrid() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [filter, setFilter] = useState<"all" | "folders" | "files">("all");

  const filteredItems =
    filter === "all"
      ? mockSharedItems
      : mockSharedItems.filter(
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
      {filteredItems.length === 0 ? (
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
