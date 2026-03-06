"use client";

import { Search, Plus, Upload, FolderPlus, Send, ChevronDown, Loader2 } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import CreateTransferModal from "./CreateTransferModal";
import UserMenu from "./UserMenu";
import { useBackup } from "@/context/BackupContext";

interface TopBarProps {
  title?: string;
}

export default function TopBar({ title = "All files" }: TopBarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [newDropdownOpen, setNewDropdownOpen] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [folderUploading, setFolderUploading] = useState(false);
  const newDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const showCreateTransfer = pathname === "/dashboard/transfers";
  const { uploadSingleFile, uploadFolder, fsAccessSupported } = useBackup();

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (newDropdownRef.current && !newDropdownRef.current.contains(e.target as Node)) {
        setNewDropdownOpen(false);
      }
    }
    if (newDropdownOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [newDropdownOpen]);

  const handleFileUploadClick = () => {
    setNewDropdownOpen(false);
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setFileUploading(true);
    try {
      await uploadSingleFile(file);
    } catch (err) {
      console.error(err);
    } finally {
      setFileUploading(false);
    }
  };

  const handleFolderUploadClick = async () => {
    setNewDropdownOpen(false);
    if (!fsAccessSupported) return;
    setFolderUploading(true);
    try {
      await uploadFolder();
    } catch (err) {
      console.error(err);
    } finally {
      setFolderUploading(false);
    }
  };

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
          <div className="relative" ref={newDropdownRef}>
            <button
              type="button"
              onClick={() => setNewDropdownOpen((o) => !o)}
              disabled={fileUploading || folderUploading}
              className="flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:cursor-not-allowed disabled:opacity-70"
            >
              {(fileUploading || folderUploading) ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              New
              <ChevronDown className={`h-4 w-4 transition-transform ${newDropdownOpen ? "rotate-180" : ""}`} />
            </button>
            {newDropdownOpen && (
              <div className="absolute right-0 top-full z-50 mt-1 min-w-[180px] rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
                <button
                  type="button"
                  onClick={handleFileUploadClick}
                  disabled={fileUploading}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
                >
                  <Upload className="h-4 w-4 flex-shrink-0" />
                  File Upload
                </button>
                <button
                  type="button"
                  onClick={handleFolderUploadClick}
                  disabled={folderUploading || !fsAccessSupported}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
                  title={!fsAccessSupported ? "Folder upload requires Chrome or Edge" : undefined}
                >
                  <FolderPlus className="h-4 w-4 flex-shrink-0" />
                  Folder Upload
                </button>
              </div>
            )}
            <input
              ref={fileInputRef}
              type="file"
              multiple={false}
              onChange={handleFileChange}
              className="hidden"
              aria-hidden
            />
          </div>
        )}

        <UserMenu compact />
      </div>

      <CreateTransferModal
        open={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
      />
    </div>
  );
}
