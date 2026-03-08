"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useRef, useState } from "react";
import {
  Star,
  Clock,
  FolderKanban,
  Activity,
  Share2,
  Loader2,
} from "lucide-react";
import StorageBadge from "./StorageBadge";
import SyncDriveButton from "./SyncDriveButton";
import { useBackup } from "@/context/BackupContext";
import { useCurrentFolder } from "@/context/CurrentFolderContext";

const quickAccessItems = (basePath: string) => [
  { href: `${basePath}/starred`, label: "Starred", icon: Star },
  { href: `${basePath}/recent`, label: "Recent", icon: Clock },
  { href: `${basePath}/projects`, label: "Projects", icon: FolderKanban },
];

interface RightPanelProps {
  onMobileClose?: () => void;
  /** Base path for links (e.g. /dashboard or /enterprise). Default: /dashboard */
  basePath?: string;
  /** Optional custom storage component (e.g. EnterpriseStorageBadge). Default: StorageBadge */
  storageComponent?: React.ReactNode;
}

const supportsDirectoryDrop =
  typeof DataTransferItem !== "undefined" &&
  "getAsFileSystemHandle" in DataTransferItem.prototype;

export default function RightPanel({
  onMobileClose,
  basePath = "/dashboard",
  storageComponent,
}: RightPanelProps) {
  const pathname = usePathname();
  const items = quickAccessItems(basePath);
  const [isDragging, setIsDragging] = useState(false);
  const dragCounterRef = useRef(0);
  const { currentDriveId } = useCurrentFolder();
  const {
    uploadFiles,
    linkDrive,
    startSync,
    fsAccessSupported,
    fileUploadProgress,
    syncProgress,
  } = useBackup();

  const isUploading =
    (fileUploadProgress?.status === "in_progress") ||
    (syncProgress?.status === "in_progress");

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current += 1;
    if (e.dataTransfer.types.includes("Files")) {
      setIsDragging(true);
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) {
      setIsDragging(false);
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.dataTransfer.types.includes("Files")) {
      e.dataTransfer.dropEffect = "copy";
    }
  }, []);

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);

      if (isUploading) return;

      const files: File[] = [];
      const dirHandles: FileSystemDirectoryHandle[] = [];

      if (supportsDirectoryDrop && fsAccessSupported) {
        const items = Array.from(e.dataTransfer.items).filter(
          (item) => item.kind === "file"
        );
        for (const item of items) {
          try {
            const handle = await item.getAsFileSystemHandle?.();
            if (!handle) continue;
            if (handle.kind === "directory") {
              dirHandles.push(handle as FileSystemDirectoryHandle);
            } else {
              const file = await (handle as FileSystemFileHandle).getFile();
              files.push(file);
            }
          } catch {
            const file = item.getAsFile();
            if (file) files.push(file);
          }
        }
      } else {
        const droppedFiles = Array.from(e.dataTransfer.files);
        files.push(...droppedFiles);
      }

      if (files.length > 0) {
        await uploadFiles(files, currentDriveId ?? undefined);
      }

      for (const handle of dirHandles) {
        try {
          const drive = await linkDrive(handle.name, handle);
          await startSync(drive);
        } catch (err) {
          console.error("Folder link/sync failed:", err);
        }
      }
    },
    [
      isUploading,
      fsAccessSupported,
      uploadFiles,
      linkDrive,
      startSync,
      currentDriveId,
    ]
  );

  return (
    <aside className="flex h-full w-56 flex-shrink-0 flex-col border-l border-neutral-200 bg-white shadow-xl dark:border-neutral-800 dark:bg-neutral-950 xl:shadow-none">
      {/* Quick access */}
      <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Quick access
        </h3>
        <ul className="space-y-0.5">
          {items.map((item) => {
            const Icon = item.icon;
            const isActive = pathname === item.href;
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={onMobileClose}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    isActive
                      ? "bg-bizzi-blue/10 font-medium text-bizzi-blue dark:bg-bizzi-blue/20 dark:text-bizzi-cyan"
                      : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      {/* Activity */}
      <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
        <Link
          href={`${basePath}/activity`}
          onClick={onMobileClose}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <Activity className="h-4 w-4" />
          Activity
        </Link>
      </div>

      {/* Shared shortcut */}
      <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
        <Link
          href={`${basePath}/shared`}
          onClick={onMobileClose}
          className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
        >
          <Share2 className="h-4 w-4" />
          Shared with you
        </Link>
      </div>

      {/* Drag zone */}
      <div className="flex-1 p-4">
        <div
          onDragEnter={handleDragEnter}
          onDragLeave={handleDragLeave}
          onDragOver={handleDragOver}
          onDrop={handleDrop}
          className={`rounded-xl border-2 border-dashed p-4 text-center transition-colors ${
            isDragging
              ? "border-bizzi-blue bg-bizzi-blue/5 dark:bg-bizzi-blue/10"
              : "border-neutral-200 dark:border-neutral-700"
          } ${isUploading ? "pointer-events-none opacity-70" : "cursor-pointer"}`}
        >
          {isUploading ? (
            <div className="flex flex-col items-center gap-2">
              <Loader2 className="h-6 w-6 animate-spin text-bizzi-blue dark:text-bizzi-cyan" />
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Uploading…
              </p>
            </div>
          ) : (
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              Drag important items here
            </p>
          )}
        </div>
      </div>

      {/* Backup drive */}
      <div className="border-t border-neutral-200 p-4 dark:border-neutral-800">
        <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          Backup
        </h3>
        <SyncDriveButton />
      </div>

      {/* Storage */}
      <div className="border-t border-neutral-200 p-4 dark:border-neutral-800">
        {storageComponent ?? <StorageBadge />}
      </div>
    </aside>
  );
}
