"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import Image from "next/image";
import { File, Download, FolderOpen } from "lucide-react";

interface ShareViewProps {
  token: string;
}

interface ShareFile {
  id: string;
  name: string;
  path: string;
  object_key: string;
  size_bytes: number;
}

interface ShareData {
  folder_name: string;
  permission: string;
  files: ShareFile[];
}

export default function ShareView({ token }: ShareViewProps) {
  const [data, setData] = useState<ShareData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    async function fetchShare() {
      try {
        const res = await fetch(`/api/shares/${encodeURIComponent(token)}`);
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? `Failed to load (${res.status})`);
        }
        const json = await res.json();
        if (!cancelled) setData(json);
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    fetchShare();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const handleDownload = useCallback(
    async (file: ShareFile) => {
      setDownloadingId(file.id);
      try {
        const res = await fetch(`/api/shares/${encodeURIComponent(token)}/download`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ object_key: file.object_key }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({}));
          throw new Error(body.error ?? "Download failed");
        }
        const { url } = await res.json();
        window.open(url, "_blank", "noopener,noreferrer");
      } catch (err) {
        console.error("Download error:", err);
      } finally {
        setDownloadingId(null);
      }
    },
    [token]
  );

  function formatSize(bytes: number): string {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }

  if (loading) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <FolderOpen className="mb-4 h-16 w-16 animate-pulse text-neutral-300 dark:text-neutral-600" />
        <p className="text-neutral-500 dark:text-neutral-400">Loading…</p>
      </div>
    );
  }

  if (error || !data) {
    const isExpired = error?.toLowerCase().includes("expired");
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <FolderOpen className="mb-4 h-16 w-16 text-neutral-300 dark:text-neutral-600" />
        <h1 className="mb-2 text-xl font-semibold text-neutral-900 dark:text-white">
          {isExpired ? "Share expired" : "Share not found"}
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          {error ?? "This share may have been removed."}
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-neutral-50 dark:bg-neutral-950">
      <header className="border-b border-neutral-200 bg-white dark:border-neutral-800 dark:bg-neutral-900">
        <div className="mx-auto flex max-w-4xl items-center justify-between px-4 py-4 sm:px-6">
          <Link href="/" className="flex items-center gap-2">
            <Image
              src="/logo.png"
              alt="Bizzi Cloud"
              width={28}
              height={28}
              className="object-contain"
            />
            <span className="text-lg font-semibold tracking-tight text-neutral-900 dark:text-white">
              Bizzi <span className="text-bizzi-blue">Cloud</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
            {data.folder_name}
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Shared with you · {data.files.length}{" "}
            {data.files.length === 1 ? "file" : "files"}
          </p>
        </div>

        {data.files.length === 0 ? (
          <div className="rounded-xl border border-neutral-200 bg-white py-12 text-center dark:border-neutral-700 dark:bg-neutral-900">
            <FolderOpen className="mx-auto mb-4 h-12 w-12 text-neutral-300 dark:text-neutral-600" />
            <p className="text-neutral-500 dark:text-neutral-400">
              This folder is empty.
            </p>
          </div>
        ) : (
          <div className="space-y-2">
            {data.files.map((file) => (
              <div
                key={file.id}
                className="flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4 transition-colors hover:border-bizzi-blue/30 hover:bg-neutral-50/50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-bizzi-blue/30 dark:hover:bg-neutral-800/50"
              >
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20">
                    <File className="h-5 w-5" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-neutral-900 dark:text-white">
                      {file.name}
                    </p>
                    <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                      {formatSize(file.size_bytes)}
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => handleDownload(file)}
                  disabled={downloadingId === file.id}
                  className="ml-4 flex flex-shrink-0 items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-bizzi-blue hover:bg-bizzi-blue/10 hover:text-bizzi-blue disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-bizzi-cyan dark:hover:bg-bizzi-blue/20 dark:hover:text-bizzi-cyan"
                >
                  <Download className="h-4 w-4" />
                  {downloadingId === file.id ? "Opening…" : "Download"}
                </button>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
