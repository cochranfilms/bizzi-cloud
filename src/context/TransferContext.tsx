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
  /** Delete a transfer (only if user owns it). Calls API and removes from local state. */
  deleteTransfer: (slug: string) => Promise<void>;
  /** Update permission (view | downloadable) for a transfer. Calls API and updates local state. */
  updateTransferPermission: (slug: string, permission: "view" | "downloadable") => Promise<void>;
  /** Update transfer settings: permission, expiresAt, password. Partial updates supported. */
  updateTransfer: (slug: string, updates: {
    permission?: "view" | "downloadable";
    expiresAt?: string | null;
    password?: string | null;
  }) => Promise<void>;
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

  const deleteTransfer = useCallback(async (slug: string) => {
    const { getFirebaseAuth } = await import("@/lib/firebase/client");
    const idToken = await getFirebaseAuth().currentUser?.getIdToken(true);
    if (!idToken) throw new Error("Not authenticated");

    const base = typeof window !== "undefined" ? window.location.origin : "";
    const res = await fetch(`${base}/api/transfers/${encodeURIComponent(slug)}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${idToken}` },
    });

    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      throw new Error(data?.error ?? "Failed to delete transfer");
    }

    setTransfers((prev) => {
      const next = prev.filter((t) => t.slug !== slug && t.id !== slug);
      saveTransfers(next);
      return next;
    });
  }, []);

  const updateTransferPermission = useCallback(
    async (slug: string, permission: "view" | "downloadable") => {
      const { getFirebaseAuth } = await import("@/lib/firebase/client");
      const idToken = await getFirebaseAuth().currentUser?.getIdToken(true);
      if (!idToken) throw new Error("Not authenticated");

      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/transfers/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ permission }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Failed to update permission");
      }

      setTransfers((prev) => {
        const next = prev.map((t) =>
          t.slug === slug || t.id === slug ? { ...t, permission } : t
        );
        saveTransfers(next);
        return next;
      });
    },
    []
  );

  const updateTransfer = useCallback(
    async (
      slug: string,
      updates: {
        permission?: "view" | "downloadable";
        expiresAt?: string | null;
        password?: string | null;
      }
    ) => {
      const { getFirebaseAuth } = await import("@/lib/firebase/client");
      const idToken = await getFirebaseAuth().currentUser?.getIdToken(true);
      if (!idToken) throw new Error("Not authenticated");

      const body: Record<string, unknown> = {};
      if (updates.permission !== undefined) body.permission = updates.permission;
      if (updates.expiresAt !== undefined) body.expiresAt = updates.expiresAt;
      if (updates.password !== undefined) body.password = updates.password;

      if (Object.keys(body).length === 0) return;

      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/transfers/${encodeURIComponent(slug)}`, {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${idToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data?.error ?? "Failed to update transfer");
      }

      setTransfers((prev) => {
        const next = prev.map((t) => {
          if (t.slug !== slug && t.id !== slug) return t;
          return {
            ...t,
            ...(updates.permission !== undefined && { permission: updates.permission }),
            ...(updates.expiresAt !== undefined && { expiresAt: updates.expiresAt }),
            ...(updates.password !== undefined && { password: updates.password }),
          };
        });
        saveTransfers(next);
        return next;
      });
    },
    []
  );

  const value = useMemo<TransferContextValue>(
    () => ({
      transfers,
      createTransfer,
      addTransferFromApi,
      getTransferBySlug,
      recordView,
      recordDownload,
      cancelTransfer,
      deleteTransfer,
      updateTransferPermission,
      updateTransfer,
    }),
    [
      transfers,
      createTransfer,
      addTransferFromApi,
      getTransferBySlug,
      recordView,
      recordDownload,
      cancelTransfer,
      deleteTransfer,
      updateTransferPermission,
      updateTransfer,
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
