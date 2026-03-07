"use client";

import { Plus, Upload, FolderPlus, Send, ChevronDown, Loader2, AlertCircle, X } from "lucide-react";
import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import CreateTransferModal from "./CreateTransferModal";
import { useBackup } from "@/context/BackupContext";

interface TopBarProps {
  title?: string;
}

export default function TopBar({ title = "All files" }: TopBarProps) {
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [newDropdownOpen, setNewDropdownOpen] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [folderUploading, setFolderUploading] = useState(false);
  const newDropdownRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pathname = usePathname();
  const showCreateTransfer = pathname === "/dashboard/transfers";
  const { uploadSingleFile, uploadFolder, fileUploadError, clearFileUploadError, fsAccessSupported } = useBackup();

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
    <div className="flex h-12 flex-shrink-0 items-center justify-between gap-4 border-b border-neutral-200 bg-white px-4 md:px-6 dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-neutral-900/30">
      <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">
        {title}
      </h1>

      <div className="flex items-center gap-2">
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
          <div className="relative flex flex-col items-end gap-1" ref={newDropdownRef}>
            {fileUploadError && (
              <div className="flex w-full max-w-sm items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
                <AlertCircle className="h-4 w-4 flex-shrink-0 mt-0.5" />
                <span className="flex-1">{fileUploadError}</span>
                <button
                  type="button"
                  onClick={clearFileUploadError}
                  className="flex-shrink-0 rounded p-0.5 hover:bg-red-200/50 dark:hover:bg-red-900/30"
                  aria-label="Dismiss"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            )}
            <div className="relative">
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
          </div>
        )}
      </div>

      <CreateTransferModal
        open={transferModalOpen}
        onClose={() => setTransferModalOpen(false)}
      />
    </div>
  );
}
