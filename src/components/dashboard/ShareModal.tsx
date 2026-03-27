"use client";

import { useState, useCallback, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { X, Copy, Check, Link2, Lock, UserPlus, Download, File, Building2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useEnterprise } from "@/context/EnterpriseContext";

function shareUiOriginFromPath(path: string): "dashboard" | "personal_team" | "enterprise" {
  if (path.startsWith("/enterprise")) return "enterprise";
  if (/^\/team\/[^/]+/.test(path)) return "personal_team";
  if (/^\/desktop\/app\/team\/[^/]+/.test(path)) return "personal_team";
  return "dashboard";
}

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  /** Display name (file or folder name) */
  folderName: string;
  linkedDriveId?: string;
  /** When sharing a single file, pass the backup_file id */
  backupFileId?: string;
  /** When creating a bulk/virtual share, pass file IDs to reference (share created on first add/copy) */
  referencedFileIds?: string[];
  /** When share already exists (e.g. virtual bulk share), pass token and initial state */
  initialShareToken?: string;
  initialAccessLevel?: "private" | "public";
  initialPermission?: "view" | "edit";
  initialInvitedEmails?: string[];
}

export default function ShareModal({
  open,
  onClose,
  folderName,
  linkedDriveId,
  backupFileId,
  referencedFileIds,
  initialShareToken,
  initialAccessLevel = "private",
  initialPermission = "view",
  initialInvitedEmails = [],
}: ShareModalProps) {
  const { user } = useAuth();
  const pathname = usePathname() ?? "";
  const { org } = useEnterprise();
  const routeTeamOwnerId = useMemo(() => {
    const m = pathname.match(/^\/team\/([^/]+)/);
    return m?.[1] ?? null;
  }, [pathname]);

  type WorkspacePick = {
    kind: "enterprise_workspace" | "personal_team";
    id: string;
    label: string;
  };

  const [shareName, setShareName] = useState<string>(folderName.trim() || "");
  const [shareToken, setShareToken] = useState<string | null>(initialShareToken ?? null);
  const [shareVersion, setShareVersion] = useState<number>(1);
  const [accessLevel, setAccessLevel] = useState<"private" | "public">(initialAccessLevel);
  const [permission, setPermission] = useState<"view" | "edit">(initialPermission);
  const [invitedEmails, setInvitedEmails] = useState<string[]>(initialInvitedEmails);
  const [emailInput, setEmailInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nameError, setNameError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [recipientTab, setRecipientTab] = useState<"email" | "workspace">("email");
  const [workspaceTarget, setWorkspaceTarget] = useState<WorkspacePick | null>(null);
  const [targetQuery, setTargetQuery] = useState("");
  const [targetResults, setTargetResults] = useState<
    { kind: "enterprise_workspace" | "personal_team"; id: string; label: string; subtitle: string }[]
  >([]);
  const [targetsLoading, setTargetsLoading] = useState(false);

  const hasValidShareName = shareName.trim().length > 0;
  const lastFetchedForRef = useRef<string | null>(null);
  const prevOpenRef = useRef(false);

  const shareUrl =
    shareToken && typeof window !== "undefined"
      ? `${window.location.origin}/s/${shareToken}`
      : null;

  const fetchExistingShare = useCallback(async () => {
    if (!linkedDriveId || !user) return;
    try {
      const token = await user.getIdToken();
      const params = new URLSearchParams({ linked_drive_id: linkedDriveId });
      if (backupFileId) params.set("backup_file_id", backupFileId);
      if (recipientTab === "workspace" && workspaceTarget) {
        params.set("share_recipient", "workspace");
        params.set("workspace_kind", workspaceTarget.kind);
        params.set("workspace_id", workspaceTarget.id);
      } else {
        params.set("share_recipient", "email");
      }
      const res = await fetch(`/api/shares?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setShareToken(data.token);
        setShareVersion(typeof data.version === "number" ? data.version : 1);
        setShareName((data.folder_name as string) ?? folderName);
        setAccessLevel((data.access_level as "private" | "public") ?? "private");
        setPermission((data.permission as "view" | "edit") ?? "view");
        setInvitedEmails(data.invited_emails ?? []);
      } else {
        setShareToken(null);
        setShareVersion(1);
      }
    } catch {
      setShareToken(null);
    }
  }, [linkedDriveId, backupFileId, user, folderName, recipientTab, workspaceTarget]);

  const fetchShareVersion = useCallback(
    async (token: string) => {
      if (!user) return 1;
      try {
        const authToken = await user.getIdToken();
        const res = await fetch(`/api/shares/${encodeURIComponent(token)}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          return typeof data.version === "number" ? data.version : 1;
        }
      } catch {
        // ignore
      }
      return 1;
    },
    [user]
  );

  const fetchShareDetails = useCallback(
    async (token: string) => {
      if (!user) return;
      try {
        const authToken = await user.getIdToken();
        const res = await fetch(`/api/shares/${encodeURIComponent(token)}`, {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setShareVersion(typeof data.version === "number" ? data.version : 1);
          setShareName((data.folder_name as string) ?? folderName);
          setAccessLevel((data.access_level as "private" | "public") ?? "private");
          setPermission((data.permission as "view" | "edit") ?? "view");
          setInvitedEmails(Array.isArray(data.invited_emails) ? data.invited_emails : []);
          if (data.recipient_mode === "workspace" && data.workspace_target?.kind && data.workspace_target?.id) {
            setRecipientTab("workspace");
            setWorkspaceTarget({
              kind: data.workspace_target.kind as WorkspacePick["kind"],
              id: data.workspace_target.id,
              label: `Workspace ${data.workspace_target.id.slice(0, 8)}…`,
            });
          } else {
            setRecipientTab("email");
          }
        }
      } catch {
        // ignore
      }
    },
    [user, folderName]
  );

  useEffect(() => {
    const justOpened = open && !prevOpenRef.current;
    prevOpenRef.current = open;

    if (open) {
      if (justOpened) {
        setShareName(folderName.trim() || "");
        if (routeTeamOwnerId) {
          setRecipientTab("workspace");
          setWorkspaceTarget({
            kind: "personal_team",
            id: routeTeamOwnerId,
            label: "This team",
          });
        } else if (pathname.startsWith("/enterprise")) {
          setRecipientTab("workspace");
          setWorkspaceTarget(null);
        } else {
          setRecipientTab("email");
          setWorkspaceTarget(null);
        }
        setTargetQuery("");
        setTargetResults([]);
      }
      setNameError(null);
      if (initialShareToken) {
        setShareToken(initialShareToken);
        if (justOpened) {
          setAccessLevel(initialAccessLevel);
          setPermission(initialPermission);
          setInvitedEmails(initialInvitedEmails);
          if (linkedDriveId) {
            fetchShareVersion(initialShareToken).then(setShareVersion);
          } else if (lastFetchedForRef.current !== initialShareToken) {
            lastFetchedForRef.current = initialShareToken;
            fetchShareDetails(initialShareToken);
          }
        }
      } else if (linkedDriveId && justOpened) {
        lastFetchedForRef.current = null;
      }
    } else {
      lastFetchedForRef.current = null;
      setShareToken(initialShareToken ?? null);
      setShareVersion(1);
      setShareName(folderName.trim() || "");
      setError(null);
      setNameError(null);
      setCopied(false);
      setEmailInput("");
    }
  }, [
    open,
    linkedDriveId,
    initialShareToken,
    initialAccessLevel,
    initialPermission,
    initialInvitedEmails,
    folderName,
    fetchShareVersion,
    fetchShareDetails,
    routeTeamOwnerId,
    pathname,
  ]);

  useEffect(() => {
    if (!open || !linkedDriveId || !user || initialShareToken) return;
    if (recipientTab === "workspace" && !workspaceTarget && !routeTeamOwnerId) return;
    fetchExistingShare();
  }, [
    open,
    linkedDriveId,
    user,
    initialShareToken,
    fetchExistingShare,
    recipientTab,
    workspaceTarget,
    routeTeamOwnerId,
  ]);

  useEffect(() => {
    if (!open || recipientTab !== "workspace" || !user || routeTeamOwnerId) return;
    const t = setTimeout(async () => {
      setTargetsLoading(true);
      try {
        const token = await user.getIdToken();
        const params = new URLSearchParams({ q: targetQuery });
        if (org?.id) params.set("organization_id", org.id);
        const res = await fetch(`/api/share-targets?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data = await res.json().catch(() => ({}));
        setTargetResults(Array.isArray(data.targets) ? data.targets : []);
      } catch {
        setTargetResults([]);
      } finally {
        setTargetsLoading(false);
      }
    }, 280);
    return () => clearTimeout(t);
  }, [open, recipientTab, user, targetQuery, org?.id, routeTeamOwnerId]);

  useEffect(() => {
    if (routeTeamOwnerId) return;
    setWorkspaceTarget((prev) => {
      if (!prev) return prev;
      const row = targetResults.find((r) => r.kind === prev.kind && r.id === prev.id);
      if (row && row.label !== prev.label) return { ...prev, label: row.label };
      return prev;
    });
  }, [targetResults, routeTeamOwnerId]);

  const recipientLocked = !!(shareToken || initialShareToken);

  const ensureShare = useCallback(async (): Promise<string | null> => {
    if (!user) return null;
    if (initialShareToken || shareToken) return initialShareToken ?? shareToken;
    const name = shareName.trim();
    if (!name) {
      setNameError("Please name your share before copying the link or adding people.");
      return null;
    }
    if (recipientTab === "workspace" && !workspaceTarget) {
      setNameError("Select a team or organization workspace first.");
      return null;
    }
    setNameError(null);

    const isVirtualShare = Array.isArray(referencedFileIds) && referencedFileIds.length > 0;
    if (!linkedDriveId && !isVirtualShare) return null;

    setLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const body: Record<string, unknown> = {
        folder_name: name,
        permission,
        access_level: accessLevel,
        invited_emails: recipientTab === "workspace" ? [] : invitedEmails,
        recipient_mode: recipientTab === "workspace" ? "workspace" : "email",
        share_ui_origin: shareUiOriginFromPath(pathname),
      };
      if (recipientTab === "workspace" && workspaceTarget) {
        body.workspace_target = { kind: workspaceTarget.kind, id: workspaceTarget.id };
      }
      if (isVirtualShare) {
        body.referenced_file_ids = referencedFileIds;
      } else {
        body.linked_drive_id = linkedDriveId;
        body.backup_file_id = backupFileId ?? undefined;
      }
      const res = await fetch("/api/shares", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to create share");
      }
      const data = await res.json();
      setShareToken(data.token);
      setShareVersion(1);
      return data.token;
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create share");
      return null;
    } finally {
      setLoading(false);
    }
  }, [
    linkedDriveId,
    backupFileId,
    referencedFileIds,
    user,
    shareToken,
    initialShareToken,
    permission,
    accessLevel,
    invitedEmails,
    shareName,
    recipientTab,
    workspaceTarget,
    pathname,
  ]);

  const copyLink = useCallback(async () => {
    if (!hasValidShareName && !shareToken && !initialShareToken) {
      setNameError("Please name your share before copying the link.");
      return;
    }
    setNameError(null);
    const token = await ensureShare();
    if (!token) return;
    const url = `${window.location.origin}/s/${token}`;
    await navigator.clipboard.writeText(url);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [ensureShare, hasValidShareName, shareToken, initialShareToken]);

  const addEmail = useCallback(async () => {
    if (recipientTab === "workspace") return;
    const trimmed = emailInput.trim().toLowerCase();
    if (!trimmed) return;
    if (invitedEmails.includes(trimmed)) return;
    // When we have an existing share token, always allow adding (edit mode)
    const tokenForCheck = shareToken ?? initialShareToken;
    const canCreate = (linkedDriveId && hasValidShareName) || (referencedFileIds?.length && hasValidShareName);
    if (!tokenForCheck && !canCreate) {
      setNameError("Please name your share before adding people.");
      return;
    }
    setNameError(null);
    const next = [...invitedEmails, trimmed];
    setInvitedEmails(next);
    setEmailInput("");
    const token = (await ensureShare()) ?? shareToken ?? initialShareToken ?? null;
    if (token) {
      setLoading(true);
      setError(null);
      try {
        const authToken = await user?.getIdToken();
        if (!authToken) return;
        const patchBody: Record<string, unknown> = {
          invited_emails: next,
          version: shareVersion,
        };
        if (shareName.trim()) {
          patchBody.folder_name = shareName.trim();
        }
        const res = await fetch(`/api/shares/${token}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify(patchBody),
        });
        if (!res.ok) {
          if (res.status === 409) {
            fetchShareVersion(token).then(setShareVersion);
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error ?? "Share was modified. Refreshed.");
          }
          throw new Error("Failed to add");
        }
        setShareVersion((v) => v + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to add");
      } finally {
        setLoading(false);
      }
    }
  }, [
    recipientTab,
    emailInput,
    invitedEmails,
    ensureShare,
    user,
    shareVersion,
    fetchShareVersion,
    hasValidShareName,
    shareToken,
    initialShareToken,
    shareName,
    linkedDriveId,
    referencedFileIds,
  ]);

  const removeEmail = useCallback(
    async (email: string) => {
      if (recipientTab === "workspace") return;
      const next = invitedEmails.filter((e) => e !== email);
      setInvitedEmails(next);
      const token = shareToken ?? initialShareToken;
      if (token && user) {
        setLoading(true);
        setError(null);
        try {
          const authToken = await user.getIdToken();
          const res = await fetch(`/api/shares/${token}`, {
            method: "PATCH",
            headers: {
              "Content-Type": "application/json",
              Authorization: `Bearer ${authToken}`,
            },
            body: JSON.stringify({ invited_emails: next, version: shareVersion }),
          });
          if (!res.ok) {
            if (res.status === 409) {
              fetchShareVersion(token).then(setShareVersion);
              const data = await res.json().catch(() => ({}));
              throw new Error(data.error ?? "Share was modified. Refreshed.");
            }
            throw new Error("Failed to remove");
          }
          setShareVersion((v) => v + 1);
        } catch (err) {
          setError(err instanceof Error ? err.message : "Failed to remove");
        } finally {
          setLoading(false);
        }
      }
    },
    [recipientTab, invitedEmails, shareToken, initialShareToken, user, shareVersion, fetchShareVersion]
  );

  const saveChanges = useCallback(
    async (overrides?: {
      access_level?: "private" | "public";
      invited_emails?: string[];
      permission?: "view" | "edit";
    }) => {
      const shareTokenToUse = shareToken ?? initialShareToken;
      if (!shareTokenToUse || !user) return;
      const level = overrides?.access_level ?? accessLevel;
      const emails =
        recipientTab === "workspace" ? [] : overrides?.invited_emails ?? invitedEmails;
      const perm = overrides?.permission ?? permission;
      setLoading(true);
      setError(null);
      try {
        const token = await user.getIdToken();
        const res = await fetch(`/api/shares/${shareTokenToUse}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            access_level: level,
            invited_emails: emails,
            permission: perm,
            version: shareVersion,
          }),
        });
        if (!res.ok) {
          if (res.status === 409) {
            fetchShareVersion(shareTokenToUse).then(setShareVersion);
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error ?? "Share was modified. Refreshed.");
          }
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to update");
        }
        setShareVersion((v) => v + 1);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to update");
      } finally {
        setLoading(false);
      }
    },
    [recipientTab, shareToken, initialShareToken, user, accessLevel, invitedEmails, permission, shareVersion, fetchShareVersion]
  );

  const handleClose = useCallback(async () => {
    if (loading) return;

    let token = shareToken ?? initialShareToken ?? null;

    if (recipientTab === "workspace" && !initialShareToken) {
      if (!workspaceTarget) {
        setNameError("Select a team or organization workspace first.");
        return;
      }
      if (!shareName.trim()) {
        setNameError("Please name your share before closing.");
        return;
      }
      const canCreate =
        Boolean(linkedDriveId) ||
        (Array.isArray(referencedFileIds) && referencedFileIds.length > 0);
      if (!canCreate) {
        setError("Nothing to share (missing folder or file context).");
        return;
      }
      if (!token) {
        const created = await ensureShare();
        if (!created) return;
        token = created;
      }
    }

    const nameChanged =
      token &&
      user &&
      shareName.trim().length > 0 &&
      shareName.trim() !== folderName.trim();

    if (nameChanged && token) {
      setLoading(true);
      try {
        const authToken = await user.getIdToken();
        const res = await fetch(`/api/shares/${encodeURIComponent(token)}`, {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${authToken}`,
          },
          body: JSON.stringify({
            folder_name: shareName.trim(),
            version: shareVersion,
          }),
        });
        if (res.ok) {
          // Name saved; onClose will trigger refetch
        }
        // On 409/error we still close; user can retry by reopening
      } catch {
        // Ignore; close anyway
      } finally {
        setLoading(false);
      }
    }
    onClose();
  }, [
    onClose,
    shareToken,
    initialShareToken,
    user,
    shareName,
    folderName,
    shareVersion,
    loading,
    recipientTab,
    workspaceTarget,
    linkedDriveId,
    referencedFileIds,
    ensureShare,
  ]);

  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[100] overflow-y-auto bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="share-modal-title"
    >
      <div
        className="flex min-h-full items-center justify-center px-4 pt-[max(3rem,calc(1.25rem+env(safe-area-inset-top,0px)))] pb-[max(3rem,calc(1.25rem+env(safe-area-inset-bottom,0px)))] sm:px-6 sm:pt-14 sm:pb-14 md:pt-16 md:pb-16"
        onClick={handleClose}
      >
        <div
          className="relative z-10 my-auto flex w-full max-w-3xl max-h-[calc(100dvh-7rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] flex-col rounded-xl border border-neutral-200 bg-white shadow-xl sm:max-h-[calc(100dvh-8rem-env(safe-area-inset-top,0px)-env(safe-area-inset-bottom,0px))] dark:border-neutral-700 dark:bg-neutral-900"
          onClick={(e) => e.stopPropagation()}
        >
        <div className="flex shrink-0 items-center justify-between border-b border-neutral-200 px-4 py-4 sm:px-6 dark:border-neutral-700">
          <h3 id="share-modal-title" className="text-lg font-semibold text-neutral-900 dark:text-white">
            Share &quot;{shareName || folderName}&quot;
          </h3>
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="space-y-4 overflow-y-auto p-4 sm:p-6 sm:space-y-6">
          {error && (
            <p className="text-sm text-red-500 dark:text-red-400">{error}</p>
          )}
          {nameError && (
            <p className="text-sm text-red-500 dark:text-red-400">{nameError}</p>
          )}

          {/* Share name - required */}
          <div>
            <label htmlFor="share-name" className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Share name <span className="text-red-500">*</span>
            </label>
            <input
              id="share-name"
              type="text"
              value={shareName}
              onChange={(e) => {
                setShareName(e.target.value);
                setNameError(null);
              }}
              placeholder="e.g. Client Deliverables March 2026"
              className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              disabled={loading}
            />
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Give your share a unique name so you can find it easily.
            </p>
          </div>

          {/* Recipients: email vs workspace */}
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Share with
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                disabled={recipientLocked}
                onClick={() => {
                  setRecipientTab("email");
                  if (!recipientLocked) setShareToken(null);
                }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                  recipientTab === "email"
                    ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                <UserPlus className="h-4 w-4" />
                Email
              </button>
              <button
                type="button"
                disabled={recipientLocked}
                onClick={() => {
                  setRecipientTab("workspace");
                  if (!recipientLocked) setShareToken(null);
                  if (routeTeamOwnerId) {
                    setWorkspaceTarget({
                      kind: "personal_team",
                      id: routeTeamOwnerId,
                      label: "This team",
                    });
                  }
                }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors disabled:opacity-60 ${
                  recipientTab === "workspace"
                    ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                <Building2 className="h-4 w-4" />
                Team / org
              </button>
            </div>
            {recipientTab === "workspace" && (
              <div className="mt-3 space-y-2">
                {routeTeamOwnerId ? (
                  <div
                    className="rounded-lg border border-bizzi-blue bg-bizzi-blue/10 px-3 py-2.5 text-sm text-neutral-800 ring-1 ring-bizzi-blue/25 dark:bg-bizzi-blue/15 dark:text-neutral-200 dark:ring-bizzi-blue/35"
                    role="status"
                  >
                    <span className="font-medium text-neutral-900 dark:text-white">
                      {workspaceTarget?.label ?? "This team"}
                    </span>
                    <span className="mt-0.5 block text-xs text-neutral-600 dark:text-neutral-400">
                      Personal team · All seat members will be notified.
                    </span>
                  </div>
                ) : (
                  <>
                    <input
                      type="search"
                      placeholder="Search teams and organizations…"
                      value={targetQuery}
                      onChange={(e) => setTargetQuery(e.target.value)}
                      className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                    />
                    {targetsLoading ? (
                      <p className="text-xs text-neutral-500">Searching…</p>
                    ) : (
                      <ul className="max-h-52 overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-700">
                        {targetResults.length === 0 ? (
                          <li className="px-3 py-2 text-xs text-neutral-500">No matches</li>
                        ) : (
                          targetResults.map((row) => {
                            const selected =
                              workspaceTarget?.kind === row.kind && workspaceTarget?.id === row.id;
                            return (
                              <li key={`${row.kind}:${row.id}`} className="border-b border-neutral-100 last:border-b-0 dark:border-neutral-800">
                                <button
                                  type="button"
                                  aria-pressed={selected}
                                  className={`flex w-full flex-col items-start gap-0.5 px-3 py-2.5 text-left text-sm transition-colors ${
                                    selected
                                      ? "bg-bizzi-blue/10 font-medium ring-2 ring-inset ring-bizzi-blue/40 dark:bg-bizzi-blue/15 dark:ring-bizzi-blue/50"
                                      : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
                                  }`}
                                  onClick={() =>
                                    setWorkspaceTarget({
                                      kind: row.kind,
                                      id: row.id,
                                      label: row.label,
                                    })
                                  }
                                >
                                  <span
                                    className={
                                      selected
                                        ? "font-semibold text-bizzi-blue dark:text-bizzi-cyan"
                                        : "font-medium text-neutral-900 dark:text-white"
                                    }
                                  >
                                    {row.label}
                                  </span>
                                  <span className="text-xs text-neutral-500 dark:text-neutral-400">
                                    {row.subtitle}
                                  </span>
                                </button>
                              </li>
                            );
                          })
                        )}
                      </ul>
                    )}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Copy link - primary action */}
          <div className="flex gap-2">
            <button
              type="button"
              onClick={copyLink}
              disabled={(!linkedDriveId && !initialShareToken && !(referencedFileIds?.length)) || !user || loading}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-2.5 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700 disabled:opacity-50"
            >
              <Link2 className="h-4 w-4" />
              {copied ? (
                <>
                  <Check className="h-4 w-4 text-green-600" />
                  Copied
                </>
              ) : (
                "Copy link"
              )}
            </button>
          </div>

          {shareUrl && (
            <div className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800">
              <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                {shareUrl}
              </p>
            </div>
          )}

          {/* Access level */}
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              General access
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setAccessLevel("private");
                  if (shareToken && user) saveChanges({ access_level: "private" });
                }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  accessLevel === "private"
                    ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                <Lock className="h-4 w-4" />
                Private
              </button>
              <button
                type="button"
                onClick={() => {
                  setAccessLevel("public");
                  if (shareToken && user) saveChanges({ access_level: "public" });
                }}
                className={`flex flex-1 items-center justify-center gap-2 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  accessLevel === "public"
                    ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                <Link2 className="h-4 w-4" />
                Anyone with link
              </button>
            </div>
            <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              {accessLevel === "private"
                ? "Only people you add can access"
                : "Anyone on the internet with the link can view"}
            </p>
          </div>

          {/* Permission: View vs Download (matches transfer UI) */}
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Permission
            </label>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => {
                  setPermission("view");
                  if (shareToken && user) saveChanges({ permission: "view" });
                }}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  permission === "view"
                    ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                <File className="h-4 w-4" />
                View only
              </button>
              <button
                type="button"
                onClick={() => {
                  setPermission("edit");
                  if (shareToken && user) saveChanges({ permission: "edit" });
                }}
                className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition-colors ${
                  permission === "edit"
                    ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                <Download className="h-4 w-4" />
                Download
              </button>
            </div>
            <p className="mt-1.5 text-xs text-neutral-500 dark:text-neutral-400">
              {permission === "edit"
                ? "Recipients can view and download files"
                : "Recipients can view only; downloads are disabled"}
            </p>
          </div>

          {/* Add people */}
          {recipientTab === "email" && (
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Add people
            </label>
            <div className="flex gap-2">
              <input
                type="email"
                placeholder="Add people by email"
                value={emailInput}
                onChange={(e) => setEmailInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addEmail())}
                className="flex-1 rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
              <button
                type="button"
                onClick={addEmail}
                className="flex items-center gap-1 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
              >
                <UserPlus className="h-4 w-4" />
                Add
              </button>
            </div>
          </div>
          )}

          {/* People with access */}
          {recipientTab === "email" && (user?.email || invitedEmails.length > 0) && (
            <div>
              <p className="mb-2 text-sm font-medium text-neutral-700 dark:text-neutral-300">
                People with access
              </p>
              <div className="space-y-2">
                {user?.email && (
                  <div className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700">
                    <span className="text-sm text-neutral-700 dark:text-neutral-300">
                      {user.email} (you)
                    </span>
                    <span className="text-xs text-neutral-500 dark:text-neutral-400">
                      Owner
                    </span>
                  </div>
                )}
                {invitedEmails.map((em) => (
                  <div
                    key={em}
                    className="flex items-center justify-between rounded-lg border border-neutral-200 px-3 py-2 dark:border-neutral-700"
                  >
                    <span className="text-sm text-neutral-700 dark:text-neutral-300">
                      {em}
                    </span>
                    <button
                      type="button"
                      onClick={() => removeEmail(em)}
                      className="text-xs text-red-600 hover:underline dark:text-red-400"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
        </div>

        <div className="flex shrink-0 justify-end border-t border-neutral-200 px-4 py-4 sm:px-6 dark:border-neutral-700">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
          >
            Done
          </button>
        </div>
      </div>
      </div>
    </div>
  );

  return typeof document !== "undefined"
    ? createPortal(modal, document.body)
    : null;
}
