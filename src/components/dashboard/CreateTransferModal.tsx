"use client";

import { useState, useCallback, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Upload, File, Lock, Calendar, Copy, Check, Download, Loader2, Search, Folder, ChevronLeft, Zap, ListPlus } from "lucide-react";
import type { CreateTransferInput, TransferPermission } from "@/types/transfer";
import { useTransfers } from "@/context/TransferContext";
import { useBackup } from "@/context/BackupContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useCloudFiles } from "@/hooks/useCloudFiles";
import { useEffectivePowerUps } from "@/hooks/useEffectivePowerUps";
import { filterDriveFoldersByPowerUp } from "@/lib/drive-powerup-filter";
import { useConfirm } from "@/hooks/useConfirm";
import { usePathname, useRouter } from "next/navigation";
import { getFirebaseAuth } from "@/lib/firebase/client";
import UploadProgressPanel from "./UploadProgressPanel";
import TransferModalPickThumbnail from "./TransferModalPickThumbnail";

function transferFileKey(f: { path: string; name: string }) {
  return `${f.path}::${f.name}`;
}

function filesInFolderScope<T extends { driveId: string; fullPath: string }>(
  files: T[],
  driveId: string,
  pathPrefix?: string
): T[] {
  const prefix = pathPrefix !== undefined ? (pathPrefix ? `${pathPrefix}/` : "") : null;
  return files.filter((f) => {
    if (f.driveId !== driveId) return false;
    if (prefix === null) return true;
    return f.fullPath === pathPrefix || f.fullPath.startsWith(prefix);
  });
}

function sampleFilesInFolder<T extends { driveId: string; fullPath: string; objectKey?: string; name: string }>(
  files: T[],
  driveId: string,
  pathPrefix?: string
) {
  return filesInFolderScope(files, driveId, pathPrefix).slice(0, 4);
}

function countFilesInFolder<T extends { driveId: string; fullPath: string }>(
  files: T[],
  driveId: string,
  pathPrefix?: string
) {
  return filesInFolderScope(files, driveId, pathPrefix).length;
}

export type TransferModalFile = {
  name: string;
  path: string;
  type: "file";
  backupFileId?: string;
  objectKey?: string;
};

interface CreateTransferModalProps {
  open: boolean;
  onClose: () => void;
  onCreated?: (slug: string) => void;
  /** Pre-populate files when opening (e.g. from bulk selection) */
  initialFiles?: TransferModalFile[];
}

export default function CreateTransferModal({
  open,
  onClose,
  onCreated,
  initialFiles = [],
}: CreateTransferModalProps) {
  const { addTransferFromApi } = useTransfers();
  const { org } = useEnterprise();
  const pathname = usePathname();
  const router = useRouter();
  const isEnterprise = pathname?.startsWith("/enterprise") ?? false;
  const isDesktop = pathname?.startsWith("/desktop") ?? false;
  const teamOwnerFromPath = /^\/team\/([^/]+)/.exec(pathname ?? "")?.[1]?.trim() ?? null;
  const { confirm } = useConfirm();
  const {
    allFilesForTransfer,
    driveFolders,
    loading: filesLoading,
    loadingAllFiles,
    fetchAllFilesForTransfer,
  } = useCloudFiles();
  const { hasEditor, hasGallerySuite } = useEffectivePowerUps();
  const visibleDriveFolders = filterDriveFoldersByPowerUp(driveFolders, {
    hasEditor,
    hasGallerySuite,
  });
  const { uploadFiles, fileUploadProgress, cancelFileUpload } = useBackup();
  const uploadStartedByModalRef = useRef(false);
  const [name, setName] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [selectedFiles, setSelectedFiles] = useState<
    { name: string; path: string; type: "file"; backupFileId?: string; objectKey?: string }[]
  >([]);

  // Pre-populate when modal opens (only on open transition, not on every re-render)
  const wasOpenRef = useRef(false);
  useEffect(() => {
    if (open && !wasOpenRef.current) {
      setSelectedFiles(initialFiles.length > 0 ? [...initialFiles] : []);
      fetchAllFilesForTransfer();
    }
    wasOpenRef.current = open;
  }, [open, initialFiles, fetchAllFilesForTransfer]);
  const [permission, setPermission] = useState<TransferPermission>("downloadable");
  const [passwordEnabled, setPasswordEnabled] = useState(false);
  const [password, setPassword] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [isDragging, setIsDragging] = useState(false);
  const [createdSlug, setCreatedSlug] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef(0);
  const [fileSearch, setFileSearch] = useState("");
  const [browseDriveId, setBrowseDriveId] = useState<string | null>(null);
  const [browsePath, setBrowsePath] = useState<string>("");
  const [selectedFolderKeys, setSelectedFolderKeys] = useState<Set<string>>(new Set());

  const toggleFile = useCallback(
    (file: { name: string; path: string; type: "file"; backupFileId?: string; objectKey?: string }) => {
      const key = transferFileKey(file);
      setSelectedFiles((prev) =>
        prev.some((f) => transferFileKey(f) === key)
          ? prev.filter((f) => transferFileKey(f) !== key)
          : [...prev, file]
      );
    },
    []
  );

  const allFilesForSelection = allFilesForTransfer.map((f) => ({
    name: f.name,
    path: `${f.driveName}/${f.path}`.replace(/\/+/g, "/"),
    fullPath: f.path,
    driveId: f.driveId,
    driveName: f.driveName,
    type: "file" as const,
    backupFileId: f.id,
    objectKey: f.objectKey,
  }));

  const attachFolder = useCallback(
    (driveId: string, pathPrefix?: string) => {
      const folderKey = pathPrefix !== undefined ? `drive:${driveId}:${pathPrefix}` : `drive:${driveId}`;
      setSelectedFolderKeys((prev) => new Set(prev).add(folderKey));
      const prefix = pathPrefix !== undefined ? (pathPrefix ? `${pathPrefix}/` : "") : null;
      const filesInFolder = allFilesForSelection.filter((f) => {
        if (f.driveId !== driveId) return false;
        if (prefix === null) return true;
        return f.fullPath === pathPrefix || f.fullPath.startsWith(prefix);
      });
      const toAdd = filesInFolder.map((f) => ({
        name: f.name,
        path: f.path,
        type: "file" as const,
        backupFileId: f.backupFileId,
        objectKey: f.objectKey,
      }));
      setSelectedFiles((prev) => {
        const existingKeys = new Set(prev.map((f) => transferFileKey(f)));
        const newFiles = toAdd.filter((f) => !existingKeys.has(transferFileKey(f)));
        return newFiles.length > 0 ? [...prev, ...newFiles] : prev;
      });
    },
    [allFilesForSelection]
  );

  const openFolderInBrowser = useCallback((driveId: string, pathPrefix?: string) => {
    setBrowseDriveId(driveId);
    setBrowsePath(pathPrefix ?? "");
  }, []);

  const fileSearchLower = fileSearch.trim().toLowerCase();
  const hasSearch = fileSearchLower !== "";

  // Folder navigation: subfolders and files at current browse location
  const { browseSubfolders, browseFiles } = (() => {
    const prefix = browsePath ? `${browsePath}/` : "";
    if (browseDriveId) {
      const inDrive = allFilesForSelection.filter((f) => f.driveId === browseDriveId);
      const subfolderSet = new Map<string, string>();
      const files: typeof allFilesForSelection = [];
      for (const f of inDrive) {
        const rel = f.fullPath;
        if (!rel.startsWith(prefix)) continue;
        const suffix = rel.slice(prefix.length);
        if (suffix.includes("/")) {
          const nextSeg = suffix.split("/")[0];
          if (!subfolderSet.has(nextSeg)) subfolderSet.set(nextSeg, `${prefix}${nextSeg}`);
        } else {
          files.push(f);
        }
      }
      const subfolders = Array.from(subfolderSet.entries()).map(([name, pathPrefix]) => ({ name, pathPrefix }));
      return { browseSubfolders: subfolders, browseFiles: files };
    }
    return { browseSubfolders: [] as { name: string; pathPrefix: string }[], browseFiles: [] as typeof allFilesForSelection };
  })();

  // When searching: flat list of all matching files. When browsing: folders + files in current location (filtered by search if active)
  const filteredBrowseFiles = browseFiles.filter((f) => !hasSearch || f.name.toLowerCase().includes(fileSearchLower));
  const filteredBrowseSubfolders = hasSearch
    ? [] // When searching, hide folder navigation - show flat results
    : browseSubfolders.filter((f) => f.name.toLowerCase().includes(fileSearchLower));
  const flatFilteredFiles = allFilesForSelection.filter((f) => f.name.toLowerCase().includes(fileSearchLower));
  const displayFiles = hasSearch ? flatFilteredFiles : filteredBrowseFiles;

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounterRef.current = 0;
      setIsDragging(false);
      const files = Array.from(e.dataTransfer.files);
      if (files.length === 0) return;
      uploadStartedByModalRef.current = true;
      try {
        await uploadFiles(files, undefined, {
        onFileComplete: (f) => {
          const entry = {
            name: f.name,
            path: f.path,
            type: "file" as const,
            backupFileId: f.backupFileId,
            objectKey: f.objectKey,
          };
          setSelectedFiles((prev) => {
            if (prev.some((x) => x.path === f.path && x.name === f.name)) return prev;
            return [...prev, entry];
          });
        },
      });
      } finally {
        uploadStartedByModalRef.current = false;
      }
    },
    [uploadFiles]
  );

  const handleFileSelect = useCallback(
    async (e: React.ChangeEvent<HTMLInputElement>) => {
      const files = Array.from(e.target.files ?? []);
      e.target.value = "";
      if (files.length === 0) return;
      uploadStartedByModalRef.current = true;
      try {
        await uploadFiles(files, undefined, {
        onFileComplete: (f) => {
          const entry = {
            name: f.name,
            path: f.path,
            type: "file" as const,
            backupFileId: f.backupFileId,
            objectKey: f.objectKey,
          };
          setSelectedFiles((prev) => {
            if (prev.some((x) => x.path === f.path && x.name === f.name)) return prev;
            return [...prev, entry];
          });
        },
      });
      } finally {
        uploadStartedByModalRef.current = false;
      }
    },
    [uploadFiles]
  );

  const performClose = useCallback(() => {
    setName("");
    setClientName("");
    setClientEmail("");
    setSelectedFiles([]);
    setPermission("downloadable");
    setPasswordEnabled(false);
    setPassword("");
    setExpiresAt("");
    setCreatedSlug(null);
    setCopied(false);
    setFileSearch("");
    setBrowseDriveId(null);
    setBrowsePath("");
    setSelectedFolderKeys(new Set());
    onClose();
  }, [onClose]);

  const handleRequestClose = useCallback(async () => {
    const confirmed = await confirm({
      title: "Are you sure?",
      message:
        "Closing now will discard your work. Any selected files and transfer details will be lost.",
      confirmLabel: "Yes, discard",
      cancelLabel: "Cancel",
      destructive: true,
    });
    if (confirmed) performClose();
  }, [confirm, performClose]);

  const handleDone = useCallback(() => {
    performClose();
    const transfersHome = teamOwnerFromPath
      ? `/team/${teamOwnerFromPath}/transfers`
      : isDesktop
        ? "/desktop/app/transfers"
        : isEnterprise
          ? "/enterprise/transfers"
          : "/dashboard/transfers";
    router.push(transfersHome);
  }, [performClose, router, isEnterprise, isDesktop, teamOwnerFromPath]);

  const handleSubmit = useCallback(async () => {
    if (!name.trim() || !clientName.trim() || selectedFiles.length === 0) return;
    const idToken = await getFirebaseAuth().currentUser?.getIdToken(true);
    if (!idToken) return;

    const body = {
      name: name.trim(),
      clientName: clientName.trim(),
      clientEmail: clientEmail.trim() || undefined,
      files: selectedFiles.map((f) => ({
        name: f.name,
        path: f.path,
        type: "file" as const,
        backupFileId: f.backupFileId,
        objectKey: f.objectKey,
      })),
      permission,
      password: passwordEnabled && password.trim() ? password.trim() : null,
      expiresAt: expiresAt ? expiresAt : null,
      organizationId: isEnterprise && org?.id ? org.id : null,
      ...(teamOwnerFromPath ? { personal_team_owner_id: teamOwnerFromPath } : {}),
    };

    const base = typeof window !== "undefined" ? window.location.origin : "";
    const res = await fetch(`${base}/api/transfers`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${idToken}`,
      },
      body: JSON.stringify(body),
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "Failed to create transfer" }));
      console.error("[CreateTransfer] API error:", err);
      return;
    }

    const data = (await res.json()) as {
      slug: string;
      name: string;
      clientName: string;
      clientEmail?: string;
      files: Array<{
        id: string;
        name: string;
        path: string;
        backupFileId?: string;
        objectKey?: string;
      }>;
      permission: string;
      hasPassword?: boolean;
      expiresAt: string | null;
      createdAt: string;
      status: string;
    };

    const transfer = {
      id: data.slug,
      slug: data.slug,
      name: data.name,
      clientName: data.clientName,
      clientEmail: data.clientEmail,
      files: data.files.map((f) => ({
        id: f.id,
        name: f.name,
        path: f.path,
        type: "file" as const,
        views: 0,
        downloads: 0,
        backupFileId: f.backupFileId,
        objectKey: f.objectKey,
      })),
      permission: (data.permission as "view" | "downloadable") ?? "downloadable",
      hasPassword: data.hasPassword ?? false,
      expiresAt: data.expiresAt,
      createdAt: data.createdAt,
      status: data.status as "active" | "expired" | "cancelled",
      organizationId: (data as { organizationId?: string | null }).organizationId ?? null,
      personalTeamOwnerId:
        (data as { personalTeamOwnerId?: string | null }).personalTeamOwnerId ?? null,
    };

    addTransferFromApi(transfer);
    setCreatedSlug(data.slug);
    onCreated?.(data.slug);
  }, [
    name,
    clientName,
    clientEmail,
    selectedFiles,
    permission,
    passwordEnabled,
    password,
    expiresAt,
    isEnterprise,
    org?.id,
    teamOwnerFromPath,
    addTransferFromApi,
    onCreated,
  ]);

  const shareUrl =
    typeof window !== "undefined" && createdSlug
      ? `${window.location.origin}/t/${createdSlug}`
      : "";

  const copyLink = useCallback(() => {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [shareUrl]);

  if (!open) return null;

  const modal = (
    <div className="fixed inset-0 z-[100] flex min-h-screen items-start justify-center overflow-y-auto p-4 pt-16 pb-8 sm:items-center sm:pt-4">
      <div className="fixed inset-0 bg-black/50" aria-hidden />
      <div
        className="relative z-10 my-4 flex max-h-[calc(100vh-6rem)] sm:max-h-[88vh] w-full max-w-4xl flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900 sm:my-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-700">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Create transfer
          </h3>
          <button
            type="button"
            onClick={handleRequestClose}
            className="rounded-lg p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto space-y-4 p-4">
          {createdSlug ? (
            <div className="rounded-lg border border-bizzi-blue/30 bg-bizzi-blue/5 p-4 dark:bg-bizzi-blue/10">
              <p className="mb-2 text-sm font-medium text-neutral-900 dark:text-white">
                Transfer created! Share this link with your client:
              </p>
              <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                <input
                  type="text"
                  readOnly
                  value={shareUrl}
                  className="min-w-0 flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
                <button
                  type="button"
                  onClick={copyLink}
                  className="flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
                >
                  {copied ? (
                    <>
                      <Check className="h-4 w-4" />
                      Copied
                    </>
                  ) : (
                    <>
                      <Copy className="h-4 w-4" />
                      Copy
                    </>
                  )}
                </button>
              </div>
            </div>
          ) : null}
          {!createdSlug && (
          <>
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Transfer name
            </label>
            <input
              type="text"
              placeholder="e.g. Project deliverables for Acme Co"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Client name
              </label>
              <input
                type="text"
                placeholder="John Smith"
                value={clientName}
                onChange={(e) => setClientName(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>
            <div>
              <label className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Client email <span className="text-neutral-400">(optional)</span>
              </label>
              <input
                type="email"
                placeholder="client@example.com"
                value={clientEmail}
                onChange={(e) => setClientEmail(e.target.value)}
                className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>
          </div>

          {/* File drop zone + file browser */}
          <div>
            <label className="mb-1.5 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Files to transfer
            </label>
            {fileUploadProgress &&
              fileUploadProgress.files.length > 0 &&
              (fileUploadProgress.status === "in_progress" || fileUploadProgress.status === "completed") && (
                <div className="mb-3">
                  <UploadProgressPanel
                    fileUploadProgress={fileUploadProgress}
                    onCancelFile={cancelFileUpload}
                    inline
                  />
                </div>
              )}
            <div
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dragCounterRef.current += 1;
                setIsDragging(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                e.stopPropagation();
                dragCounterRef.current -= 1;
                if (dragCounterRef.current === 0) setIsDragging(false);
              }}
              onDrop={handleDrop}
              onClick={(e) => {
                if ((e.target as HTMLElement).closest('button[type="button"]')) return;
                fileInputRef.current?.click();
              }}
              className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-6 transition-colors sm:py-8 ${
                isDragging
                  ? "border-bizzi-blue bg-bizzi-blue/5 dark:bg-bizzi-blue/10"
                  : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                className="hidden"
                onChange={handleFileSelect}
              />
              {selectedFiles.length === 0 ? (
                <>
                  <Upload className="h-10 w-10 text-neutral-400 dark:text-neutral-500" />
                  <p className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
                    Drop files here or click to browse
                  </p>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Or select from your account below
                  </p>
                </>
              ) : (
                <>
                  <div className="flex flex-wrap justify-center gap-2">
                    {selectedFiles.slice(0, 8).map((f) => (
                      <div
                        key={transferFileKey(f)}
                        className="flex flex-col items-center gap-1"
                        title={f.name}
                      >
                        <TransferModalPickThumbnail
                          objectKey={f.objectKey}
                          fileName={f.name}
                          sizeClassName="h-11 w-11"
                        />
                        <span className="max-w-[4.5rem] truncate text-center text-[10px] text-neutral-600 dark:text-neutral-400">
                          {f.name}
                        </span>
                      </div>
                    ))}
                    {selectedFiles.length > 8 && (
                      <span className="self-center text-xs text-neutral-500 dark:text-neutral-400">
                        +{selectedFiles.length - 8} more
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    {selectedFiles.length} file{selectedFiles.length !== 1 ? "s" : ""} added • Drop more or click to add
                  </p>
                </>
              )}
            </div>

            {/* Select from existing uploaded files for faster transfer */}
            <div className="mt-4 rounded-xl border-2 border-neutral-200 bg-neutral-50/80 p-4 dark:border-neutral-700 dark:bg-neutral-800/80">
              <div className="mb-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                <h4 className="text-base font-semibold text-neutral-800 dark:text-neutral-200">
                  Select from existing uploaded files for faster transfer
                </h4>
                <div className="relative w-full sm:w-36 shrink-0">
                  <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-neutral-400" />
                  <input
                    type="text"
                    placeholder="Search files…"
                    value={fileSearch}
                    onChange={(e) => setFileSearch(e.target.value)}
                    className="w-full rounded-md border border-neutral-200 bg-white py-1.5 pl-7 pr-2 text-xs dark:border-neutral-600 dark:bg-neutral-900 dark:text-white"
                  />
                </div>
              </div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-lg border border-bizzi-blue/40 bg-bizzi-blue/5 px-3 py-1.5 dark:border-bizzi-blue/50 dark:bg-bizzi-blue/10">
                <Zap className="h-4 w-4 text-bizzi-blue" />
                <span className="text-xs font-medium text-bizzi-blue dark:text-bizzi-cyan">
                  Selecting existing files = INSTANT transfer (no upload needed)
                </span>
              </div>
              {filesLoading || loadingAllFiles ? (
                <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  Loading your files…
                </p>
              ) : allFilesForSelection.length === 0 ? (
                <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                  No files yet. Upload files first or drop them above.
                </p>
              ) : (() => {
                // At root (!browseDriveId), we show driveFolders (Storage, RAW, Gallery Media). Don't show "No files in this folder" when we have folders.
                const isEmpty =
                  hasSearch
                    ? displayFiles.length === 0
                    : !browseDriveId
                      ? visibleDriveFolders.length === 0
                      : filteredBrowseSubfolders.length === 0 && displayFiles.length === 0;
                return isEmpty;
              })() ? (
                <div className="rounded-lg border border-neutral-200 bg-white dark:border-neutral-600 dark:bg-neutral-900">
                  {!hasSearch && browseDriveId && (
                    <div className="flex items-center gap-1 border-b border-neutral-200 px-3 py-2 dark:border-neutral-700">
                      <button
                        type="button"
                        onClick={() => {
                          if (browsePath) {
                            const parts = browsePath.split("/").filter(Boolean);
                            parts.pop();
                            setBrowsePath(parts.join("/"));
                          } else {
                            setBrowseDriveId(null);
                            setBrowsePath("");
                          }
                        }}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        {browsePath ? "Up" : "Drives"}
                      </button>
                      {browsePath && (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">
                          / {browsePath.split("/").pop()}
                        </span>
                      )}
                    </div>
                  )}
                  <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
                    {hasSearch ? `No files match "${fileSearch}"` : "No files in this folder"}
                  </p>
                </div>
              ) : (
                <div className="max-h-[min(24rem,calc(100vh-12rem))] overflow-y-auto rounded-lg border border-neutral-200 bg-white p-3 dark:border-neutral-600 dark:bg-neutral-900">
                  {!hasSearch && browseDriveId && (
                    <div className="mb-2 flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => {
                          if (browsePath) {
                            const parts = browsePath.split("/").filter(Boolean);
                            parts.pop();
                            setBrowsePath(parts.join("/"));
                          } else {
                            setBrowseDriveId(null);
                            setBrowsePath("");
                          }
                        }}
                        className="flex items-center gap-1 rounded px-2 py-1 text-xs text-neutral-500 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-700"
                      >
                        <ChevronLeft className="h-3.5 w-3.5" />
                        {browsePath ? "Up" : "Drives"}
                      </button>
                      {browsePath && (
                        <span className="text-xs text-neutral-400 dark:text-neutral-500">
                          / {browsePath.split("/").pop()}
                        </span>
                      )}
                    </div>
                  )}
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {!hasSearch &&
                      !browseDriveId &&
                      visibleDriveFolders.map((folder) => {
                        const folderKey = `drive:${folder.id}`;
                        const isSelected = selectedFolderKeys.has(folderKey);
                        const previews = sampleFilesInFolder(allFilesForSelection, folder.id);
                        const n = countFilesInFolder(allFilesForSelection, folder.id);
                        return (
                          <div
                            key={folder.key}
                            className={`flex flex-col overflow-hidden rounded-lg border text-left transition-colors ${
                              isSelected
                                ? "border-bizzi-blue bg-bizzi-blue/10 dark:border-bizzi-blue dark:bg-bizzi-blue/20"
                                : "border-neutral-200 dark:border-neutral-600"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => openFolderInBrowser(folder.id)}
                              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800/80"
                            >
                              <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                              <span className="min-w-0 flex-1 truncate font-medium text-neutral-800 dark:text-neutral-200" title={folder.name}>
                                {folder.name}
                              </span>
                              <span className="shrink-0 text-xs text-neutral-400">{folder.items}</span>
                            </button>
                            {previews.length > 0 ? (
                              <div className="flex gap-1 border-t border-neutral-100 px-3 py-2 dark:border-neutral-700/80">
                                {previews.map((pf) => (
                                  <TransferModalPickThumbnail
                                    key={`${pf.fullPath}::${pf.name}`}
                                    objectKey={pf.objectKey}
                                    fileName={pf.name}
                                    sizeClassName="h-8 w-8"
                                  />
                                ))}
                              </div>
                            ) : null}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                attachFolder(folder.id);
                              }}
                              className="flex w-full items-center justify-center gap-1.5 border-t border-neutral-100 bg-neutral-50/90 py-2 text-xs font-medium text-bizzi-blue hover:bg-bizzi-blue/10 dark:border-neutral-700/80 dark:bg-neutral-900/60 dark:text-bizzi-cyan dark:hover:bg-bizzi-blue/15"
                            >
                              <ListPlus className="h-3.5 w-3.5" />
                              Add all {n} file{n !== 1 ? "s" : ""}
                            </button>
                          </div>
                        );
                      })}
                    {!hasSearch &&
                      browseDriveId &&
                      filteredBrowseSubfolders.map((folder) => {
                        const folderKey = `drive:${browseDriveId}:${folder.pathPrefix}`;
                        const isSelected = selectedFolderKeys.has(folderKey);
                        const previews = sampleFilesInFolder(allFilesForSelection, browseDriveId, folder.pathPrefix);
                        const n = countFilesInFolder(allFilesForSelection, browseDriveId, folder.pathPrefix);
                        return (
                          <div
                            key={folder.pathPrefix}
                            className={`flex flex-col overflow-hidden rounded-lg border text-left transition-colors ${
                              isSelected
                                ? "border-bizzi-blue bg-bizzi-blue/10 dark:border-bizzi-blue dark:bg-bizzi-blue/20"
                                : "border-neutral-200 dark:border-neutral-600"
                            }`}
                          >
                            <button
                              type="button"
                              onClick={() => openFolderInBrowser(browseDriveId, folder.pathPrefix)}
                              className="flex w-full items-center gap-2 px-3 py-2.5 text-sm hover:bg-neutral-100 dark:hover:bg-neutral-800/80"
                            >
                              <Folder className="h-4 w-4 shrink-0 text-amber-500" />
                              <span className="min-w-0 flex-1 truncate font-medium text-neutral-800 dark:text-neutral-200" title={folder.name}>
                                {folder.name}
                              </span>
                              <span className="shrink-0 text-xs text-neutral-400">{n}</span>
                            </button>
                            {previews.length > 0 ? (
                              <div className="flex gap-1 border-t border-neutral-100 px-3 py-2 dark:border-neutral-700/80">
                                {previews.map((pf) => (
                                  <TransferModalPickThumbnail
                                    key={`${pf.fullPath}::${pf.name}`}
                                    objectKey={pf.objectKey}
                                    fileName={pf.name}
                                    sizeClassName="h-8 w-8"
                                  />
                                ))}
                              </div>
                            ) : null}
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                attachFolder(browseDriveId, folder.pathPrefix);
                              }}
                              className="flex w-full items-center justify-center gap-1.5 border-t border-neutral-100 bg-neutral-50/90 py-2 text-xs font-medium text-bizzi-blue hover:bg-bizzi-blue/10 dark:border-neutral-700/80 dark:bg-neutral-900/60 dark:text-bizzi-cyan dark:hover:bg-bizzi-blue/15"
                            >
                              <ListPlus className="h-3.5 w-3.5" />
                              Add all {n} file{n !== 1 ? "s" : ""}
                            </button>
                          </div>
                        );
                      })}
                    {displayFiles.map((file) => {
                      const selected = selectedFiles.some(
                        (f) => f.path === file.path && f.name === file.name
                      );
                      return (
                        <button
                          key={transferFileKey(file)}
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleFile(file);
                          }}
                          className={`flex min-h-[4.25rem] items-center gap-3 rounded-lg border px-2.5 py-2 text-left text-sm transition-colors ${
                            selected
                              ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue dark:border-bizzi-blue dark:bg-bizzi-blue/20"
                              : "border-neutral-200 text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-700"
                          }`}
                        >
                          <TransferModalPickThumbnail
                            objectKey={file.objectKey}
                            fileName={file.name}
                            sizeClassName="h-11 w-11"
                          />
                          <span className="min-w-0 flex-1 truncate" title={file.name}>
                            {file.name}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
              {allFilesForSelection.length > 0 && (
                <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
                  {allFilesForSelection.length} file{allFilesForSelection.length !== 1 ? "s" : ""} available
                  {fileSearch.trim() && ` • ${displayFiles.length} match${displayFiles.length !== 1 ? "es" : ""}`}
                  {!hasSearch &&
                    " • Open a folder to browse with previews • Use “Add all” only when you want everything in that folder"}
                </p>
              )}
            </div>

            {selectedFiles.length > 0 && (
              <div className="mt-3">
                <p className="mb-2 text-xs font-medium text-neutral-600 dark:text-neutral-400">
                  Selected for transfer ({selectedFiles.length})
                </p>
                <div className="flex flex-wrap gap-3">
                  {selectedFiles.map((f) => (
                    <div
                      key={transferFileKey(f)}
                      className="group relative flex w-[5.5rem] flex-col items-center gap-1"
                    >
                      <div className="relative">
                        <TransferModalPickThumbnail
                          objectKey={f.objectKey}
                          fileName={f.name}
                          sizeClassName="h-14 w-14"
                        />
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedFiles((p) => p.filter((x) => transferFileKey(x) !== transferFileKey(f)));
                          }}
                          className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full border border-neutral-200 bg-white text-xs font-semibold text-neutral-600 shadow-sm hover:bg-red-50 hover:text-red-600 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-red-950/50"
                          aria-label={`Remove ${f.name}`}
                        >
                          ×
                        </button>
                      </div>
                      <span className="w-full truncate text-center text-[10px] text-neutral-600 dark:text-neutral-400" title={f.name}>
                        {f.name}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Permission: View vs Downloadable */}
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Recipient access
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setPermission("downloadable")}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  permission === "downloadable"
                    ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                <Download className="h-4 w-4" />
                Downloadable
              </button>
              <button
                type="button"
                onClick={() => setPermission("view")}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  permission === "view"
                    ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                <File className="h-4 w-4" />
                View only
              </button>
            </div>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              {permission === "downloadable"
                ? "Recipients can view and download files"
                : "Recipients can view only; downloads are disabled"}
            </p>
          </div>

          {/* Password protection */}
          <div>
            <div className="mb-2 flex items-center gap-2">
              <button
                type="button"
                onClick={() => setPasswordEnabled(!passwordEnabled)}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  passwordEnabled
                    ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                <Lock className="h-4 w-4" />
                Password protect
              </button>
            </div>
            {passwordEnabled && (
              <input
                type="password"
                placeholder="Enter password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="mt-2 w-full max-w-xs rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            )}
          </div>

          {/* Expiration */}
          <div>
            <label className="mb-1.5 flex items-center gap-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
              <Calendar className="h-4 w-4" />
              Expiration date
            </label>
            <input
              type="datetime-local"
              value={expiresAt}
              onChange={(e) => setExpiresAt(e.target.value)}
              min={new Date().toISOString().slice(0, 16)}
              className="w-full max-w-xs rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Leave empty for no expiration
            </p>
          </div>
          </>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-200 p-4 dark:border-neutral-700">
          <button
            type="button"
            onClick={createdSlug ? handleDone : handleRequestClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {createdSlug ? "Done" : "Cancel"}
          </button>
          {!createdSlug && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={!name.trim() || !clientName.trim() || selectedFiles.length === 0}
              className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:cursor-not-allowed disabled:opacity-50"
            >
              Create transfer
            </button>
          )}
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}
