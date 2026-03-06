"use client";

import { Search, Plus, Upload, FolderPlus, Send } from "lucide-react";
import { useState } from "react";
import { usePathname } from "next/navigation";
import CreateTransferModal from "./CreateTransferModal";
import UserMenu from "./UserMenu";

interface TopBarProps {
  title?: string;
}

export default function TopBar({ title = "All files" }: TopBarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const pathname = usePathname();
  const showCreateTransfer = pathname === "/dashboard/transfers";

  return (
    <div className="flex h-14 flex-shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-white pl-14 pr-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-neutral-900/50 lg:pl-6 lg:pr-6">
      <h1 className="text-xl font-semibold text-neutral-900 dark:text-white">
        {title}
      </h1>

      <div className="flex flex-1 items-center justify-end gap-2">
        <div className="relative hidden max-w-xs flex-1 md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
          <input
            type="search"
            placeholder="Search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-3 text-sm placeholder-neutral-400 outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder-neutral-500"
          />
        </div>

        {showCreateTransfer ? (
          <button
            type="button"
            onClick={() => setTransferModalOpen(true)}
            className="flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
          >
            <Send className="h-4 w-4" />
            Create transfer
          </button>
        ) : (
          <button
            type="button"
            className="flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
          >
            <Plus className="h-4 w-4" />
            New
          </button>
        )}

        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <Upload className="h-4 w-4" />
          Upload
        </button>

        <button
          type="button"
          className="flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <FolderPlus className="h-4 w-4" />
          New folder
        </button>

        <UserMenu compact />
      </div>

      <CreateTransferModal
        open={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
      />
    </div>
  );
}
