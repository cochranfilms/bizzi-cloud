"use client";

import { useEffect, useState } from "react";
import { FileIcon, RotateCcw, Trash2 } from "lucide-react";
import TopBar from "@/components/dashboard/TopBar";
import ItemActionsMenu from "@/components/dashboard/ItemActionsMenu";
import { useCloudFiles, type RecentFile } from "@/hooks/useCloudFiles";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

function formatDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function DeletedFileCard({
  file,
  onRestore,
  onPermanentDelete,
}: {
  file: RecentFile;
  onRestore: () => void;
  onPermanentDelete: () => void;
}) {
  return (
    <div className="group relative flex flex-col items-center rounded-xl border border-neutral-200 bg-white p-6 transition-colors dark:border-neutral-700 dark:bg-neutral-900">
      <div className="absolute right-2 top-2 z-10 opacity-0 transition-opacity group-hover:opacity-100">
        <ItemActionsMenu
          actions={[
            {
              id: "restore",
              label: "Restore to original location",
              icon: <RotateCcw className="h-4 w-4" />,
              onClick: onRestore,
            },
            {
              id: "permanent",
              label: "Permanently delete",
              icon: <Trash2 className="h-4 w-4" />,
              onClick: onPermanentDelete,
              destructive: true,
            },
          ]}
          ariaLabel="File actions"
          alignRight
        />
      </div>
      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-xl bg-neutral-100 text-neutral-500 dark:bg-neutral-700 dark:text-neutral-400">
        <FileIcon className="h-8 w-8" />
      </div>
      <h3
        className="mb-1 truncate w-full text-center text-sm font-medium text-neutral-900 dark:text-white"
        title={file.name}
      >
        {file.name}
      </h3>
      <p className="text-xs text-neutral-500 dark:text-neutral-400">
        {formatBytes(file.size)} · {file.driveName}
      </p>
      <p className="mt-0.5 text-xs text-neutral-400 dark:text-neutral-500">
        Deleted {formatDate(file.deletedAt ?? null)}
      </p>
    </div>
  );
}

export default function TrashPage() {
  const [deletedFiles, setDeletedFiles] = useState<RecentFile[]>([]);
  const [loading, setLoading] = useState(true);
  const { fetchDeletedFiles, restoreFile, permanentlyDeleteFile, refetch } =
    useCloudFiles();

  const loadDeleted = async () => {
    setLoading(true);
    try {
      const files = await fetchDeletedFiles();
      setDeletedFiles(files);
    } catch {
      setDeletedFiles([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDeleted();
  }, [fetchDeletedFiles]);

  const handleRestore = async (fileId: string) => {
    await restoreFile(fileId);
    refetch();
    setDeletedFiles((prev) => prev.filter((f) => f.id !== fileId));
  };

  const handlePermanentDelete = async (file: RecentFile) => {
    if (
      !window.confirm(
        `Permanently delete "${file.name}"? This action cannot be undone.`
      )
    )
      return;
    await permanentlyDeleteFile(file.id);
    refetch();
    setDeletedFiles((prev) => prev.filter((f) => f.id !== file.id));
  };

  return (
    <>
      <TopBar title="Deleted files" />
      <main className="flex-1 overflow-auto p-6">
        <p className="mb-6 text-neutral-500 dark:text-neutral-400">
          Deleted files are kept for 30 days before permanent deletion. Restore
          them to their original location or permanently delete them.
        </p>

        {loading ? (
          <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Loading deleted files…
          </div>
        ) : deletedFiles.length > 0 ? (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            {deletedFiles.map((file) => (
              <DeletedFileCard
                key={file.id}
                file={file}
                onRestore={() => handleRestore(file.id)}
                onPermanentDelete={() => handlePermanentDelete(file)}
              />
            ))}
          </div>
        ) : (
          <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            No deleted files. When you delete files from your drives, they will
            appear here.
          </div>
        )}
      </main>
    </>
  );
}
