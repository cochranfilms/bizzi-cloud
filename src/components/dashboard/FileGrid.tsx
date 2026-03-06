"use client";

import { useState } from "react";
import { Folder, LayoutGrid, List } from "lucide-react";
import FolderCard, { type FolderItem } from "./FolderCard";

const mockFolders: FolderItem[] = [
  { name: "Projects", type: "folder", key: "Projects/", items: 0 },
  { name: "Clients", type: "folder", key: "Clients/", items: 0, isShared: true },
  { name: "Vlog Content", type: "folder", key: "Vlog Content/", items: 0 },
  { name: "Contracts", type: "folder", key: "Contracts/", items: 0 },
  { name: "James Williams", type: "folder", key: "James Williams/", items: 0 },
  { name: "Dr. Raya Package", type: "folder", key: "Dr. Raya Package/", items: 0 },
];

const suggestedFolders = [
  { name: "Projects", type: "folder", key: "Projects/", items: 0 },
  { name: "Clients", type: "folder", key: "Clients/", items: 0 },
  { name: "Vlog Content", type: "folder", key: "Vlog Content/", items: 0 },
];

export default function FileGrid() {
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [activeTab, setActiveTab] = useState<"recents" | "starred">("recents");

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      {/* Pinned shortcuts */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-5 dark:border-neutral-800 dark:bg-neutral-900/50">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Pinned
          </h2>
          <button
            type="button"
            className="text-xs text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-400"
            aria-label="Dismiss"
          >
            ×
          </button>
        </div>
        <div className="flex gap-3 overflow-x-auto pb-1">
          {suggestedFolders.map((item) => (
            <div
              key={item.key}
              className="flex min-w-[120px] flex-col items-center rounded-xl bg-neutral-50 p-4 transition-colors hover:bg-bizzi-blue/5 dark:bg-neutral-800/50 dark:hover:bg-bizzi-blue/10"
            >
              <div className="mb-2 flex h-10 w-10 items-center justify-center rounded-lg bg-bizzi-blue/15 text-bizzi-blue dark:bg-bizzi-blue/25">
                <Folder className="h-5 w-5" />
              </div>
              <p className="truncate w-full text-center text-sm font-medium text-neutral-900 dark:text-white">
                {item.name}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Folder
              </p>
            </div>
          ))}
        </div>
      </section>

      {/* Recents / Starred tabs + view toggle */}
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900/50">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
          <div className="flex gap-1 rounded-xl border border-neutral-200 bg-neutral-50 p-1.5 dark:border-neutral-700 dark:bg-neutral-800">
            <button
              type="button"
              onClick={() => setActiveTab("recents")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "recents"
                  ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-white"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              Recents
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("starred")}
              className={`rounded-md px-4 py-2 text-sm font-medium transition-colors ${
                activeTab === "starred"
                  ? "bg-white text-neutral-900 shadow dark:bg-neutral-700 dark:text-white"
                  : "text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
              }`}
            >
              Starred
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

        {/* File grid */}
        <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
          {mockFolders.map((item) => (
            <FolderCard key={item.key} item={item} />
          ))}
        </div>
      </section>
    </div>
  );
}
