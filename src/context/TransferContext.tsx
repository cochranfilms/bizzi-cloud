"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import type { CreateTransferInput, Transfer, TransferFile } from "@/types/transfer";

function generateSlug(): string {
  return Math.random().toString(36).slice(2, 10);
}

function generateId(): string {
  return `tf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

const STORAGE_KEY = "bizzi-transfers";

function loadTransfers(): Transfer[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed)
      ? parsed.map((t: Transfer) => ({
          ...t,
          permission: t.permission ?? "downloadable",
        }))
      : [];
  } catch {
    return [];
  }
}

function saveTransfers(transfers: Transfer[]) {
  if (typeof window === "undefined") return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(transfers));
}

interface TransferContextValue {
  transfers: Transfer[];
  createTransfer: (input: CreateTransferInput) => Transfer;
  /** Add a transfer from API response (e.g. after POST). Syncs to localStorage. */
  addTransferFromApi: (data: Transfer) => void;
  getTransferBySlug: (slug: string) => Transfer | undefined;
  recordView: (slug: string, fileId: string) => void;
  recordDownload: (slug: string, fileId: string) => void;
  cancelTransfer: (id: string) => void;
}

const TransferContext = createContext<TransferContextValue | null>(null);

export function TransferProvider({ children }: { children: React.ReactNode }) {
  // Start with [] on both server and client to avoid hydration mismatch
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  useEffect(() => {
    setTransfers(loadTransfers());
  }, []);

  const createTransfer = useCallback(
    (input: CreateTransferInput): Transfer => {
      const now = new Date().toISOString();
      const slug = generateSlug();
      const files: TransferFile[] = input.files.map((f) => ({
        ...f,
        id: generateId(),
        views: 0,
        downloads: 0,
      }));
      const transfer: Transfer = {
        id: generateId(),
        name: input.name,
        clientName: input.clientName,
        clientEmail: input.clientEmail,
        files,
        permission: input.permission ?? "downloadable",
        password: input.password ?? null,
        expiresAt: input.expiresAt,
        createdAt: now,
        status: "active",
        slug,
      };
      setTransfers((prev) => {
        const next = [...prev, transfer];
        saveTransfers(next);
        return next;
      });
      return transfer;
    },
    []
  );

  const addTransferFromApi = useCallback((data: Transfer) => {
    setTransfers((prev) => {
      const next = prev.some((x) => x.slug === data.slug) ? prev : [data, ...prev];
      saveTransfers(next);
      return next;
    });
  }, []);

  const getTransferBySlug = useCallback(
    (slug: string): Transfer | undefined => {
      const t = transfers.find((x) => x.slug === slug);
      if (!t) return undefined;
      const expired = t.expiresAt && new Date(t.expiresAt) < new Date();
      return { ...t, status: expired ? "expired" : t.status };
    },
    [transfers]
  );

  const recordView = useCallback((slug: string, fileId: string) => {
    setTransfers((prev) => {
      const next = prev.map((t) => {
        if (t.slug !== slug) return t;
        return {
          ...t,
          files: t.files.map((f) =>
            f.id === fileId ? { ...f, views: f.views + 1 } : f
          ),
        };
      });
      saveTransfers(next);
      return next;
    });
  }, []);

  const recordDownload = useCallback((slug: string, fileId: string) => {
    setTransfers((prev) => {
      const next = prev.map((t) => {
        if (t.slug !== slug) return t;
        return {
          ...t,
          files: t.files.map((f) =>
            f.id === fileId ? { ...f, downloads: f.downloads + 1 } : f
          ),
        };
      });
      saveTransfers(next);
      return next;
    });
  }, []);

  const cancelTransfer = useCallback((id: string) => {
    setTransfers((prev) => {
      const next = prev.map((t) =>
        t.id === id ? { ...t, status: "cancelled" as const } : t
      );
      saveTransfers(next);
      return next;
    });
  }, []);

  const value = useMemo<TransferContextValue>(
    () => ({
      transfers,
      createTransfer,
      addTransferFromApi,
      getTransferBySlug,
      recordView,
      recordDownload,
      cancelTransfer,
    }),
    [
      transfers,
      createTransfer,
      addTransferFromApi,
      getTransferBySlug,
      recordView,
      recordDownload,
      cancelTransfer,
    ]
  );

  return (
    <TransferContext.Provider value={value}>{children}</TransferContext.Provider>
  );
}

export function useTransfers() {
  const ctx = useContext(TransferContext);
  if (!ctx) throw new Error("useTransfers must be used within TransferProvider");
  return ctx;
}
