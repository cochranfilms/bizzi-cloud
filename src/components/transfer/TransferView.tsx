"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useTransfers } from "@/context/TransferContext";
import { File, Download, Lock, FolderOpen } from "lucide-react";
import Image from "next/image";
import type { Transfer, TransferFile } from "@/types/transfer";
import TransferPreviewModal from "./TransferPreviewModal";

interface TransferViewProps {
  slug: string;
}

export default function TransferView({ slug }: TransferViewProps) {
  const { getTransferBySlug, addTransferFromApi, recordView, recordDownload } = useTransfers();
  const [password, setPassword] = useState("");
  const [unlocked, setUnlocked] = useState(false);
  const [error, setError] = useState("");
  const [fetching, setFetching] = useState(false);
  const [previewFile, setPreviewFile] = useState<TransferFile | null>(null);

  const localTransfer = getTransferBySlug(slug);

  const fetchTransfer = useCallback(async () => {
    const base = typeof window !== "undefined" ? window.location.origin : "";
    const res = await fetch(`${base}/api/transfers/${slug}`);
    if (!res.ok) return;
    const data = (await res.json()) as {
      slug: string;
      name: string;
      clientName: string;
      clientEmail?: string;
      files: Array<{ id: string; name: string; path: string; backupFileId?: string; objectKey?: string }>;
      permission: string;
      password: string | null;
      expiresAt: string | null;
      createdAt: string;
      status: string;
    };
    const t: Transfer = {
      id: data.slug,
      slug: data.slug,
      name: data.name,
      clientName: data.clientName,
      clientEmail: data.clientEmail,
      files: data.files.map((f) => ({
        ...f,
        type: "file" as const,
        views: 0,
        downloads: 0,
        backupFileId: f.backupFileId,
        objectKey: f.objectKey,
      })),
      permission: (data.permission as "view" | "downloadable") ?? "downloadable",
      password: data.password,
      expiresAt: data.expiresAt,
      createdAt: data.createdAt,
      status: data.status as "active" | "expired" | "cancelled",
    };
    addTransferFromApi(t);
  }, [slug, addTransferFromApi]);

  useEffect(() => {
    if (localTransfer) return;
    setFetching(true);
    fetchTransfer().finally(() => setFetching(false));
  }, [localTransfer, fetchTransfer]);

  const transfer = localTransfer;
  const needsPassword = !!transfer?.password && !unlocked;

  useEffect(() => {
    if (transfer && !transfer.password) setUnlocked(true);
  }, [transfer]);

  useEffect(() => {
    if (transfer?.name && typeof document !== "undefined") {
      document.title = `${transfer.name} | Bizzi Cloud Transfer`;
    }
  }, [transfer?.name]);

  const handleUnlock = () => {
    if (!transfer?.password) return;
    if (password === transfer.password) {
      setUnlocked(true);
      setError("");
    } else {
      setError("Incorrect password");
    }
  };

  const handleFileView = (fileId: string) => {
    if (!transfer) return;
    recordView(transfer.slug, fileId);
  };

  const handleFileDownload = (fileId: string) => {
    if (!transfer) return;
    recordDownload(transfer.slug, fileId);
  };

  if (!transfer) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        {fetching ? (
          <>
            <div className="mb-4 h-8 w-8 animate-spin rounded-full border-2 border-bizzi-blue border-t-transparent" />
            <p className="text-sm text-neutral-500 dark:text-neutral-400">Loading transfer…</p>
          </>
        ) : (
          <>
            <FolderOpen className="mb-4 h-16 w-16 text-neutral-300 dark:text-neutral-600" />
            <h1 className="mb-2 text-xl font-semibold text-neutral-900 dark:text-white">
              Transfer not found
            </h1>
            <p className="text-sm text-neutral-500 dark:text-neutral-400">
              This transfer may have expired or been removed.
            </p>
          </>
        )}
      </div>
    );
  }

  if (transfer.status === "expired") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <FolderOpen className="mb-4 h-16 w-16 text-neutral-300 dark:text-neutral-600" />
        <h1 className="mb-2 text-xl font-semibold text-neutral-900 dark:text-white">
          Transfer expired
        </h1>
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          This transfer has expired and is no longer available.
        </p>
      </div>
    );
  }

  if (needsPassword) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-neutral-50 p-6 dark:bg-neutral-950">
        <div className="w-full max-w-sm space-y-6 rounded-xl border border-neutral-200 bg-white p-8 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <div className="flex flex-col items-center gap-2">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20">
              <Lock className="h-7 w-7" />
            </div>
            <h1 className="text-lg font-semibold text-neutral-900 dark:text-white">
              Password required
            </h1>
            <p className="text-center text-sm text-neutral-500 dark:text-neutral-400">
              This transfer is password protected. Enter the password to view files.
            </p>
          </div>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleUnlock();
            }}
            className="space-y-4"
          >
            <input
              type="password"
              placeholder="Enter password"
              value={password}
              onChange={(e) => {
                setPassword(e.target.value);
                setError("");
              }}
              className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              autoFocus
            />
            {error && (
              <p className="text-sm text-red-500">{error}</p>
            )}
            <button
              type="submit"
              className="w-full rounded-lg bg-bizzi-blue py-3 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
            >
              Unlock
            </button>
          </form>
        </div>
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
              alt="Bizzi Byte"
              width={28}
              height={28}
              className="object-contain"
            />
            <span className="font-semibold text-lg tracking-tight text-neutral-900 dark:text-white">
              Bizzi <span className="text-bizzi-blue">Cloud</span>
            </span>
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
        <div className="mb-8">
          <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white">
            {transfer.name}
          </h1>
          <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
            Shared with you
          </p>
        </div>

        <div className="space-y-2">
          {transfer.files.map((file) => {
            const canPreview = !!file.objectKey;
            return (
              <div
                key={file.id}
                onMouseEnter={() => handleFileView(file.id)}
                role={canPreview ? "button" : undefined}
                tabIndex={canPreview ? 0 : undefined}
                onClick={canPreview ? () => setPreviewFile(file) : undefined}
                onKeyDown={
                  canPreview
                    ? (e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setPreviewFile(file);
                        }
                      }
                    : undefined
                }
                className={`flex items-center justify-between rounded-xl border border-neutral-200 bg-white p-4 transition-colors dark:border-neutral-700 dark:bg-neutral-900 ${
                  canPreview
                    ? "cursor-pointer hover:border-bizzi-blue/30 hover:bg-neutral-50/50 dark:hover:border-bizzi-blue/30 dark:hover:bg-neutral-800/50"
                    : ""
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20">
                    <File className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-neutral-900 dark:text-white">
                      {file.name}
                    </p>
                    <p className="text-xs text-neutral-500 dark:text-neutral-400">
                      {file.path}
                    </p>
                  </div>
                </div>
                {transfer.permission !== "view" && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFileDownload(file.id);
                    }}
                    className="flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:border-bizzi-blue hover:bg-bizzi-blue/10 hover:text-bizzi-blue dark:border-neutral-700 dark:text-neutral-300 dark:hover:border-bizzi-cyan dark:hover:bg-bizzi-blue/20 dark:hover:text-bizzi-cyan"
                  >
                    <Download className="h-4 w-4" />
                    Download
                  </button>
                )}
              </div>
            );
          })}
        </div>

        <TransferPreviewModal
          slug={slug}
          file={previewFile}
          onClose={() => setPreviewFile(null)}
          password={transfer.password && unlocked ? password : undefined}
          permission={transfer.permission}
          onDownload={(fileId) => handleFileDownload(fileId)}
        />
      </main>
    </div>
  );
}
