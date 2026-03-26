"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type Dispatch,
  type SetStateAction,
} from "react";
import { usePathname } from "next/navigation";
import type { CreateTransferInput, Transfer, TransferFile } from "@/types/transfer";
import { useAuth } from "@/context/AuthContext";
import { useEnterpriseOptional } from "@/context/EnterpriseContext";
import { getFirebaseAuth } from "@/lib/firebase/client";

function generateSlug(): string {
  return Math.random().toString(36).slice(2, 10);
}

function generateId(): string {
  return `tf_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`;
}

interface TransferContextValue {
  transfers: Transfer[];
  createTransfer: (input: CreateTransferInput) => Transfer;
  /** Add a transfer from API response (e.g. after POST or public GET /t/...). */
  addTransferFromApi: (data: Transfer) => void;
  getTransferBySlug: (slug: string) => Transfer | undefined;
  recordView: (slug: string, fileId: string) => void;
  recordDownload: (slug: string, fileId: string) => void;
  cancelTransfer: (id: string) => void;
  deleteTransfer: (slug: string) => Promise<void>;
  updateTransferPermission: (slug: string, permission: "view" | "downloadable") => Promise<void>;
  updateTransfer: (
    slug: string,
    updates: {
      permission?: "view" | "downloadable";
      expiresAt?: string | null;
      password?: string | null;
    }
  ) => Promise<void>;
}

const TransferContext = createContext<TransferContextValue | null>(null);

function TransferListSync({
  setTransfers,
}: {
  setTransfers: Dispatch<SetStateAction<Transfer[]>>;
}) {
  const { user } = useAuth();
  const pathname = usePathname() ?? "";
  const enterpriseCtx = useEnterpriseOptional();

  const isEnterprisePath = pathname.startsWith("/enterprise");
  const orgId = enterpriseCtx?.organization?.id ?? null;
  const orgLoading = enterpriseCtx?.loading ?? false;
  const teamOwnerUserId = /^\/team\/([^/]+)/.exec(pathname)?.[1]?.trim() ?? null;

  useEffect(() => {
    if (!user) {
      setTransfers([]);
      return;
    }

    const inApp =
      pathname.startsWith("/enterprise") ||
      pathname.startsWith("/desktop/app") ||
      pathname.startsWith("/team/") ||
      pathname.startsWith("/dashboard");

    if (!inApp) return;

    if (isEnterprisePath && orgLoading) {
      setTransfers([]);
      return;
    }

    if (isEnterprisePath && !orgId) {
      setTransfers([]);
      return;
    }

    let cancelled = false;

    (async () => {
      try {
        const token = await getFirebaseAuth().currentUser?.getIdToken();
        if (!token || cancelled) return;

        const params = new URLSearchParams();
        if (isEnterprisePath && orgId) {
          params.set("context", "enterprise");
          params.set("organization_id", orgId);
        } else if (teamOwnerUserId) {
          params.set("context", "personal_team");
          params.set("team_owner_user_id", teamOwnerUserId);
        } else {
          params.set("context", "personal");
        }

        const base = typeof window !== "undefined" ? window.location.origin : "";
        const res = await fetch(`${base}/api/transfers?${params.toString()}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as { transfers?: Transfer[] };
        if (!cancelled) setTransfers(Array.isArray(data.transfers) ? data.transfers : []);
      } catch {
        if (!cancelled) setTransfers([]);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [user, pathname, isEnterprisePath, orgId, orgLoading, teamOwnerUserId]);

  return null;
}

export function TransferProvider({ children }: { children: React.ReactNode }) {
  const [transfers, setTransfers] = useState<Transfer[]>([]);

  const createTransfer = useCallback((input: CreateTransferInput): Transfer => {
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
      hasPassword: !!(input.password && input.password.trim()),
      expiresAt: input.expiresAt,
      createdAt: now,
      status: "active",
      slug,
      organizationId: null,
      personalTeamOwnerId: input.personalTeamOwnerId ?? null,
    };
    setTransfers((prev) => [...prev, transfer]);
    return transfer;
  }, []);

  const addTransferFromApi = useCallback((data: Transfer) => {
    setTransfers((prev) => (prev.some((x) => x.slug === data.slug) ? prev : [data, ...prev]));
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
    setTransfers((prev) =>
      prev.map((t) => {
        if (t.slug !== slug) return t;
        return {
          ...t,
          files: t.files.map((f) =>
            f.id === fileId ? { ...f, views: f.views + 1 } : f
          ),
        };
      })
    );
  }, []);

  const recordDownload = useCallback((slug: string, fileId: string) => {
    setTransfers((prev) =>
      prev.map((t) => {
        if (t.slug !== slug) return t;
        return {
          ...t,
          files: t.files.map((f) =>
            f.id === fileId ? { ...f, downloads: f.downloads + 1 } : f
          ),
        };
      })
    );
  }, []);

  const cancelTransfer = useCallback((id: string) => {
    setTransfers((prev) =>
      prev.map((t) => (t.id === id ? { ...t, status: "cancelled" as const } : t))
    );
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

    setTransfers((prev) => prev.filter((t) => t.slug !== slug && t.id !== slug));
  }, []);

  const updateTransferPermission = useCallback(
    async (slug: string, permission: "view" | "downloadable") => {
      const { getFirebaseAuth } = await import("@/lib/firebase/client");
      const idToken = await getFirebaseAuth().currentUser?.getIdToken(true);
      if (!idToken) throw new Error("Not authenticated");

      let prevSnapshot: Transfer[] | null = null;
      setTransfers((prev) => {
        prevSnapshot = prev;
        return prev.map((t) =>
          t.slug === slug || t.id === slug ? { ...t, permission } : t
        );
      });

      try {
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
      } catch (err) {
        if (prevSnapshot) setTransfers(prevSnapshot);
        throw err;
      }
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

      let prevSnapshot: Transfer[] | null = null;
      setTransfers((prev) => {
        prevSnapshot = prev;
        return prev.map((t) => {
          if (t.slug !== slug && t.id !== slug) return t;
          return {
            ...t,
            ...(updates.permission !== undefined && { permission: updates.permission }),
            ...(updates.expiresAt !== undefined && { expiresAt: updates.expiresAt }),
            ...(updates.password !== undefined && {
              hasPassword: updates.password !== null,
            }),
          };
        });
      });

      try {
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
      } catch (err) {
        if (prevSnapshot) setTransfers(prevSnapshot);
        throw err;
      }
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
    <TransferContext.Provider value={value}>
      <TransferListSync setTransfers={setTransfers} />
      {children}
    </TransferContext.Provider>
  );
}

export function useTransfers() {
  const ctx = useContext(TransferContext);
  if (!ctx) throw new Error("useTransfers must be used within TransferProvider");
  return ctx;
}
