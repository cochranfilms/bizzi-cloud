"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { useBackup } from "@/context/BackupContext";
import SettingsSectionScope from "@/components/settings/SettingsSectionScope";
import { productSettingsCopy } from "@/lib/product-settings-copy";
import { ChevronRight, CloudUpload, Folder, FolderOpen, File as FileGlyph, Loader2 } from "lucide-react";
import { getFirebaseFirestore, isFirebaseConfigured } from "@/lib/firebase/client";
import {
  MIGRATION_FILES_SUBCOLLECTION,
  MIGRATION_JOBS_COLLECTION,
  migrationMaxFoldersPerJob,
} from "@/lib/migration-constants";
import MigrationCloudProgressBar from "./MigrationCloudProgressBar";
import type { MigrationProvider } from "@/lib/migration-constants";

type Provider = MigrationProvider;

export type WorkspaceMigrationSectionProps = {
  oauthReturnPath: string;
  defaultWorkspaceId?: string | null;
  scopeLabel?: string;
};

type SourcePick = { ref: string; name: string; kind: "folder" | "file" };

type ProviderEntry = {
  id: string;
  name: string;
  isFolder: boolean;
  mimeType?: string;
  path_lower?: string;
};

function oauthStartErrorMessage(
  status: number,
  code: string | undefined,
  error: string | undefined,
  providerLabel: string
): string {
  if (code === "oauth_not_configured") {
    return `${providerLabel} import is not enabled on this server yet (OAuth credentials missing). Your admin needs to configure migration OAuth environment variables.`;
  }
  if (code === "app_url_missing") {
    return "OAuth cannot start: set NEXT_PUBLIC_APP_URL or MIGRATION_PUBLIC_APP_URL so the callback URL is known.";
  }
  if (code === "rate_limited") {
    return "Too many connection attempts. Please wait a minute and try again.";
  }
  if (error) return error;
  if (status === 503) {
    return "Import service is unavailable (503). Check server configuration and logs.";
  }
  return `Could not start OAuth (${status}).`;
}

function useMigrationJobFileProgress(jobId: string | undefined, subscribe: boolean) {
  const [agg, setAgg] = useState({ total: 0, done: 0, failed: 0, inFlight: 0 });
  useEffect(() => {
    if (!jobId || !subscribe || !isFirebaseConfigured()) return;
    const db = getFirebaseFirestore();
    const coll = collection(db, MIGRATION_JOBS_COLLECTION, jobId, MIGRATION_FILES_SUBCOLLECTION);
    const unsub = onSnapshot(
      coll,
      (snap) => {
        let done = 0;
        let failed = 0;
        let inFlight = 0;
        for (const doc of snap.docs) {
          const t = doc.data().transfer_status as string;
          if (t === "completed" || t === "skipped") done += 1;
          else if (t === "failed") failed += 1;
          else if (
            t === "in_progress" ||
            t === "session_initializing" ||
            t === "needs_repair" ||
            t === "verifying" ||
            t === "finalizing"
          ) {
            inFlight += 1;
          }
        }
        setAgg({ total: snap.size, done, failed, inFlight });
      },
      (err) => console.warn("[migration] files snapshot", err)
    );
    return () => unsub();
  }, [jobId, subscribe]);
  return agg;
}

function formatProviderLabel(p: string): string {
  if (p === "google_drive") return "Google Drive";
  if (p === "dropbox") return "Dropbox";
  return p.replace(/_/g, " ");
}

function formatJobStatusTitle(status: string): string {
  const labels: Record<string, string> = {
    queued: "Queued",
    scanning: "1. Scanning your cloud",
    scan_completed: "Scan complete",
    ready: "Ready to copy",
    running: "2. Copying into Storage",
    paused: "Paused",
    completed: "Import finished",
    completed_with_issues: "Finished with some issues",
    failed: "Import failed",
    canceled: "Canceled",
    blocked_quota: "Needs more storage",
    blocked_destination_invalid: "Destination unavailable",
  };
  return labels[status] ?? status.replace(/_/g, " ");
}

function jobDestinationLabel(j: Record<string, unknown>): string {
  const c = j.destination_contract as { destination_path_prefix?: string; drive_name_snapshot?: string } | undefined;
  const path = typeof c?.destination_path_prefix === "string" ? c.destination_path_prefix.trim() : "";
  const drive = typeof c?.drive_name_snapshot === "string" ? c.drive_name_snapshot.trim() : "";
  if (path && drive) return `${drive} → ${path}`;
  if (path) return path;
  if (drive) return drive;
  return "Storage";
}

type MigrationJobCardProps = {
  job: Record<string, unknown> & { id?: string };
  onStart: (id: string) => void;
  onPause: (id: string) => void;
  onResume: (id: string) => void;
};

function MigrationJobCard({ job, onStart, onPause, onResume }: MigrationJobCardProps) {
  const id = String(job.id ?? "");
  const status = String(job.status ?? "");
  const scanned = typeof job.files_total_scanned === "number" ? job.files_total_scanned : null;
  const supported = typeof job.files_supported_count === "number" ? job.files_supported_count : null;
  const prov = String((job as { provider?: string }).provider ?? "");
  const dest = jobDestinationLabel(job);
  const showFileListener = [
    "scanning",
    "ready",
    "running",
    "paused",
    "completed",
    "completed_with_issues",
  ].includes(status);
  const fileAgg = useMigrationJobFileProgress(id, showFileListener && !!id);

  const scanComplete = !["scanning", "queued"].includes(status);
  const scanPercent = scanComplete ? 100 : null;
  const scanSubtitle =
    status === "scanning"
      ? scanned != null && scanned > 0
        ? `Discovered ${scanned.toLocaleString()} item${scanned === 1 ? "" : "s"} so far…`
        : "Listing folders and files from your connected account…"
      : scanComplete
        ? supported != null
          ? `${supported.toLocaleString()} file${supported === 1 ? "" : "s"} ready to copy.`
          : "Scan complete."
        : null;

  const showTransferBar = ["ready", "running", "paused", "completed", "completed_with_issues"].includes(status);

  let transferPercent: number | null = 0;
  let transferSubtitle: string | null = null;
  if (showTransferBar) {
    const totalFiles = fileAgg.total > 0 ? fileAgg.total : supported ?? 0;
    if (status === "ready") {
      transferPercent = 0;
      transferSubtitle =
        totalFiles > 0
          ? `${totalFiles.toLocaleString()} file${totalFiles === 1 ? "" : "s"} ready — press Start import when you want them copied into Bizzi.`
          : "Preparing your file list…";
    } else if (status === "running" || status === "paused") {
      if (fileAgg.total > 0) {
        transferPercent = (fileAgg.done / fileAgg.total) * 100;
        transferSubtitle = `${fileAgg.done.toLocaleString()} of ${fileAgg.total.toLocaleString()} files copied`;
        if (fileAgg.inFlight > 0) transferSubtitle += ` · ${fileAgg.inFlight} in progress`;
        if (fileAgg.failed > 0) transferSubtitle += ` · ${fileAgg.failed} could not finish`;
      } else {
        transferPercent = null;
        transferSubtitle = "Starting copy…";
      }
    } else if (status === "completed" || status === "completed_with_issues") {
      transferPercent =
        fileAgg.total > 0 ? Math.min(100, (fileAgg.done / fileAgg.total) * 100) : 100;
      transferSubtitle =
        fileAgg.total > 0
          ? `${fileAgg.done.toLocaleString()} of ${fileAgg.total.toLocaleString()} files done${fileAgg.failed > 0 ? ` · ${fileAgg.failed} failed` : ""}`
          : "Done.";
    }
  }

  const failedBlock = ["failed", "canceled", "blocked_quota", "blocked_destination_invalid"].includes(status);

  return (
    <li className="list-none rounded-2xl border border-bizzi-blue/20 bg-white/90 p-5 shadow-md shadow-bizzi-blue/5 dark:border-bizzi-blue/25 dark:bg-neutral-900/85">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-base font-semibold text-bizzi-navy dark:text-white">{formatJobStatusTitle(status)}</p>
          <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-300">
            <span className="font-medium text-bizzi-blue dark:text-bizzi-cyan">{formatProviderLabel(prov)}</span>
            <span className="text-neutral-400 dark:text-neutral-500"> · </span>
            <span className="text-neutral-800 dark:text-neutral-200">Into {dest}</span>
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          {status === "ready" && (
            <button
              type="button"
              className="rounded-lg bg-gradient-to-r from-bizzi-blue to-bizzi-cyan px-4 py-2 text-xs font-semibold text-white shadow-md shadow-bizzi-blue/25 hover:brightness-110"
              onClick={() => onStart(id)}
            >
              Start import
            </button>
          )}
          {(status === "scanning" || status === "running") && (
            <button
              type="button"
              className="rounded-lg border border-amber-400/60 bg-amber-50 px-3 py-1.5 text-xs font-medium text-amber-900 dark:border-amber-500/50 dark:bg-amber-950/40 dark:text-amber-100"
              onClick={() => onPause(id)}
            >
              Pause
            </button>
          )}
          {status === "paused" && (
            <button
              type="button"
              className="rounded-lg border border-emerald-500/40 bg-emerald-50 px-3 py-1.5 text-xs font-medium text-emerald-900 dark:border-emerald-500/40 dark:bg-emerald-950/30 dark:text-emerald-100"
              onClick={() => onResume(id)}
            >
              Resume
            </button>
          )}
        </div>
      </div>
      <div className="space-y-4">
        <MigrationCloudProgressBar label="Scan cloud library" subtitle={scanSubtitle} percent={scanPercent} />
        {showTransferBar && !failedBlock ? (
          <MigrationCloudProgressBar
            label="Copy into Bizzi Storage"
            subtitle={transferSubtitle}
            percent={transferPercent}
          />
        ) : null}
      </div>
      {failedBlock && job.failure_message ? (
        <p className="mt-4 text-sm text-red-600 dark:text-red-400">{String(job.failure_message)}</p>
      ) : null}
      <details className="mt-4 text-xs text-neutral-400">
        <summary className="cursor-pointer select-none text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300">
          Technical details
        </summary>
        <p className="mt-2 break-all font-mono text-[10px] text-neutral-500 dark:text-neutral-500">
          Reference: {id}
        </p>
      </details>
    </li>
  );
}

export default function WorkspaceMigrationSection({
  oauthReturnPath,
  defaultWorkspaceId = null,
  scopeLabel = productSettingsCopy.scopes.personalAccountOnly,
}: WorkspaceMigrationSectionProps) {
  const { user } = useAuth();
  const { linkedDrives } = useBackup();
  const searchParams = useSearchParams();

  const storageDrive = useMemo(
    () =>
      linkedDrives.find(
        (d) => (d.name === "Storage" || d.name === "Uploads") && !d.is_creator_raw
      ),
    [linkedDrives]
  );

  const [accounts, setAccounts] = useState<{ provider: Provider; connected: boolean }[] | null>(null);
  const [jobs, setJobs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [browseLoading, setBrowseLoading] = useState(false);

  const [provider, setProvider] = useState<Provider>("google_drive");
  const [googleFolderId, setGoogleFolderId] = useState("root");
  const [dropboxPath, setDropboxPath] = useState("");
  const [providerEntries, setProviderEntries] = useState<ProviderEntry[]>([]);
  const [providerTrail, setProviderTrail] = useState<{ id: string; name: string; dropboxPath?: string }[]>(
    [{ id: "root", name: "Drive", dropboxPath: "" }]
  );

  const [picks, setPicks] = useState<SourcePick[]>([]);
  const [destRelPath, setDestRelPath] = useState("");
  const [destTrail, setDestTrail] = useState<{ path: string; name: string }[]>([{ path: "", name: "Storage" }]);
  const [newSubfolder, setNewSubfolder] = useState("");
  const [duplicate_mode, setDuplicateMode] = useState<"skip" | "rename">("skip");
  const [message, setMessage] = useState<string | null>(null);

  const workspace_id = defaultWorkspaceId?.trim() || "";

  const authHeader = useCallback(async () => {
    const t = await user?.getIdToken();
    if (!t) return null;
    return { Authorization: `Bearer ${t}` };
  }, [user]);

  const refreshAccounts = useCallback(async () => {
    const h = await authHeader();
    if (!h) return;
    const res = await fetch("/api/migrations/accounts", { headers: h });
    if (res.ok) {
      const d = (await res.json()) as { accounts: { provider: Provider; connected: boolean }[] };
      setAccounts(d.accounts);
    }
  }, [authHeader]);

  const fetchJobsViaApi = useCallback(async () => {
    const h = await authHeader();
    if (!h) return;
    const res = await fetch("/api/migrations/jobs", { headers: h });
    if (res.ok) {
      const d = (await res.json()) as { jobs: Record<string, unknown>[] };
      setJobs(d.jobs);
    }
  }, [authHeader]);

  useEffect(() => {
    void refreshAccounts();
  }, [refreshAccounts, user?.uid]);

  useEffect(() => {
    if (!user?.uid || !isFirebaseConfigured()) {
      setJobs([]);
      return;
    }
    const db = getFirebaseFirestore();
    const q = query(
      collection(db, MIGRATION_JOBS_COLLECTION),
      where("user_id", "==", user.uid),
      orderBy("updated_at", "desc"),
      limit(30)
    );
    const unsub = onSnapshot(
      q,
      (snap) => {
        setJobs(snap.docs.map((d) => ({ id: d.id, ...d.data() })));
      },
      (err) => {
        console.warn("[migration] jobs snapshot failed, falling back to API", err);
        void fetchJobsViaApi();
      }
    );
    return () => unsub();
  }, [user?.uid, fetchJobsViaApi]);

  useEffect(() => {
    const connected = searchParams.get("connected");
    const oauthErr = searchParams.get("oauth_error");
    if (connected) {
      setMessage(`Connected: ${connected.replace("_", " ")}`);
      void refreshAccounts();
    } else if (oauthErr) {
      setMessage(`OAuth error: ${oauthErr}`);
    }
    if (connected || oauthErr) {
      const url = new URL(window.location.href);
      url.searchParams.delete("connected");
      url.searchParams.delete("oauth_error");
      window.history.replaceState(null, "", url.pathname + url.search + url.hash);
    }
  }, [searchParams, refreshAccounts]);

  const loadProviderFolder = useCallback(async () => {
    const h = await authHeader();
    if (!h) return;
    setBrowseLoading(true);
    try {
      const body =
        provider === "google_drive"
          ? { provider, google_folder_id: googleFolderId }
          : { provider, dropbox_path: dropboxPath };
      const res = await fetch("/api/migrations/browse", {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const d = (await res.json().catch(() => ({}))) as { error?: string };
        throw new Error(d.error ?? "browse_failed");
      }
      const d = (await res.json()) as { entries: ProviderEntry[] };
      const list = d.entries ?? [];
      list.sort((a, b) => {
        if (a.isFolder !== b.isFolder) return a.isFolder ? -1 : 1;
        return a.name.localeCompare(b.name, undefined, { sensitivity: "base" });
      });
      setProviderEntries(list);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Could not list cloud folder");
      setProviderEntries([]);
    } finally {
      setBrowseLoading(false);
    }
  }, [authHeader, provider, googleFolderId, dropboxPath]);

  const [destFolderChoices, setDestFolderChoices] = useState<{ path: string; name: string }[]>([]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const h = await authHeader();
      if (!storageDrive?.id || !h) {
        setDestFolderChoices([]);
        return;
      }
      const res = await fetch("/api/mount/metadata", {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ drive_id: storageDrive.id, paths: [destRelPath] }),
      });
      if (!res.ok || cancelled) return;
      const d = (await res.json()) as {
        entries: Array<{ type: string; path: string; name: string }>;
      };
      const folders = (d.entries ?? [])
        .filter((e) => e.type === "folder")
        .map((e) => ({ path: e.path, name: e.name }));
      folders.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: "base" }));
      if (!cancelled) setDestFolderChoices(folders);
    })();
    return () => {
      cancelled = true;
    };
  }, [authHeader, storageDrive?.id, destRelPath]);

  useEffect(() => {
    const connected = accounts?.find((a) => a.provider === provider)?.connected;
    if (connected) void loadProviderFolder();
  }, [accounts, provider, googleFolderId, dropboxPath, loadProviderFolder]);

  useEffect(() => {
    setPicks([]);
    setProviderEntries([]);
    setProviderTrail([{ id: "root", name: provider === "google_drive" ? "My Drive" : "Dropbox", dropboxPath: "" }]);
    if (provider === "google_drive") {
      setGoogleFolderId("root");
      setDropboxPath("");
    } else {
      setGoogleFolderId("root");
      setDropboxPath("");
    }
  }, [provider]);

  function enterProviderFolder(entry: ProviderEntry) {
    if (!entry.isFolder) return;
    if (provider === "google_drive") {
      setGoogleFolderId(entry.id);
      setProviderTrail((t) => [...t, { id: entry.id, name: entry.name }]);
    } else {
      setDropboxPath(entry.path_lower ?? entry.id);
      setProviderTrail((t) => [
        ...t,
        { id: entry.path_lower ?? entry.id, name: entry.name, dropboxPath: entry.path_lower ?? "" },
      ]);
    }
  }

  function goProviderCrumb(idx: number) {
    const crumb = providerTrail[idx];
    if (!crumb) return;
    setProviderTrail((t) => t.slice(0, idx + 1));
    if (provider === "google_drive") {
      setGoogleFolderId(crumb.id === "root" ? "root" : crumb.id);
    } else {
      setDropboxPath(crumb.dropboxPath ?? "");
    }
  }

  function togglePick(entry: ProviderEntry) {
    const ref = provider === "google_drive" ? entry.id : entry.path_lower ?? entry.id;
    const kind = entry.isFolder ? "folder" : "file";
    setPicks((prev) => {
      const i = prev.findIndex((p) => p.ref === ref && p.kind === kind);
      if (i >= 0) return prev.filter((_, j) => j !== i);
      if (prev.length >= migrationMaxFoldersPerJob()) {
        setMessage(`You can select at most ${migrationMaxFoldersPerJob()} items per import.`);
        return prev;
      }
      return [...prev, { ref, name: entry.name, kind }];
    });
  }

  function enterDestFolder(path: string, name: string) {
    setDestRelPath(path);
    setDestTrail((t) => [...t, { path, name }]);
  }

  function goDestCrumb(idx: number) {
    const crumb = destTrail[idx];
    if (!crumb) return;
    setDestTrail((t) => t.slice(0, idx + 1));
    setDestRelPath(crumb.path);
  }

  function composedDestinationPrefix(): string {
    const base = destRelPath.trim();
    const sub = newSubfolder.trim().replace(/^\/+|\/+$/g, "").replace(/\.\./g, "");
    if (!sub) return base;
    return base ? `${base}/${sub}` : sub;
  }

  async function connectGoogle() {
    setLoading(true);
    setMessage(null);
    try {
      const h = await authHeader();
      if (!h) throw new Error("Sign in first");
      const res = await fetch("/api/migrations/oauth/google/start", {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ return_path: oauthReturnPath }),
      });
      const d = (await res.json().catch(() => ({}))) as { url?: string; error?: string; code?: string };
      if (!res.ok) {
        throw new Error(oauthStartErrorMessage(res.status, d.code, d.error, "Google Drive"));
      }
      if (d.url) window.location.href = d.url;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function connectDropbox() {
    setLoading(true);
    setMessage(null);
    try {
      const h = await authHeader();
      if (!h) throw new Error("Sign in first");
      const res = await fetch("/api/migrations/oauth/dropbox/start", {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({ return_path: oauthReturnPath }),
      });
      const d = (await res.json().catch(() => ({}))) as { url?: string; error?: string; code?: string };
      if (!res.ok) {
        throw new Error(oauthStartErrorMessage(res.status, d.code, d.error, "Dropbox"));
      }
      if (d.url) window.location.href = d.url;
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function createJob() {
    setLoading(true);
    setMessage(null);
    try {
      if (!storageDrive?.id) throw new Error("No Storage drive found for this workspace. Open Files once, then try again.");
      if (picks.length === 0) throw new Error("Select at least one folder or file from Google Drive or Dropbox.");
      const h = await authHeader();
      if (!h) throw new Error("Sign in first");
      const destination_path_prefix = composedDestinationPrefix();
      const sources = picks.map((p) => ({
        ref: p.ref,
        label: p.kind === "folder" ? p.name.replace(/[/\\]/g, "_") : p.name.replace(/[/\\]/g, "_"),
        kind: p.kind,
      }));
      const res = await fetch("/api/migrations/jobs", {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({
          provider,
          duplicate_mode,
          drive_id: storageDrive.id,
          workspace_id: workspace_id || null,
          destination_path_prefix,
          sources,
        }),
      });
      const d = (await res.json()) as { job_id?: string; error?: string; code?: string };
      if (!res.ok) throw new Error(d.error ?? "create_failed");
      setMessage("Import started — track scan and copy progress below.");
      setPicks([]);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Failed");
    } finally {
      setLoading(false);
    }
  }

  async function startJob(id: string) {
    const h = await authHeader();
    if (!h) return;
    await fetch(`/api/migrations/jobs/${id}/start`, { method: "POST", headers: h });
  }

  async function pauseJob(id: string) {
    const h = await authHeader();
    if (!h) return;
    await fetch(`/api/migrations/jobs/${id}/pause`, { method: "POST", headers: h });
  }

  async function resumeJob(id: string) {
    const h = await authHeader();
    if (!h) return;
    await fetch(`/api/migrations/jobs/${id}/resume`, { method: "POST", headers: h });
  }

  async function disconnectProvider(p: Provider) {
    const h = await authHeader();
    if (!h) return;
    await fetch(`/api/migrations/accounts?provider=${p}`, { method: "DELETE", headers: h });
    await refreshAccounts();
  }

  const googleConnected = accounts?.find((a) => a.provider === "google_drive")?.connected;
  const dropboxConnected = accounts?.find((a) => a.provider === "dropbox")?.connected;
  const providerConnected = provider === "google_drive" ? googleConnected : dropboxConnected;

  const canStartScan = !!(user && providerConnected && storageDrive?.id && picks.length > 0 && !loading);

  return (
    <section
      id="migration"
      className="relative overflow-hidden rounded-2xl border border-bizzi-blue/25 bg-gradient-to-br from-white via-bizzi-sky/35 to-white p-6 shadow-lg shadow-bizzi-blue/10 sm:p-8 dark:from-neutral-950 dark:via-bizzi-navy/25 dark:to-neutral-950 dark:border-bizzi-blue/30 dark:shadow-bizzi-blue/5"
    >
      <div className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-bizzi-blue/15 blur-3xl dark:bg-bizzi-cyan/10" />
      <div className="pointer-events-none absolute -bottom-20 -left-16 h-56 w-56 rounded-full bg-sky-200/40 blur-3xl dark:bg-bizzi-navy/30" />

      <div className="relative">
        <SettingsSectionScope label={scopeLabel} />
        <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h2 className="mb-2 flex items-center gap-2 text-xl font-bold tracking-tight text-bizzi-navy dark:text-white sm:text-2xl">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-bizzi-blue to-sky-400 shadow-md shadow-bizzi-blue/30">
                <CloudUpload className="h-5 w-5 text-white" />
              </span>
              Cloud import
            </h2>
            <p className="max-w-xl text-sm leading-relaxed text-neutral-600 dark:text-neutral-300">
              Bring Google Drive or Dropbox into your <strong className="text-bizzi-navy dark:text-white">Storage</strong>{" "}
              space. Connect once, choose files, pick a destination — we handle the rest.
            </p>
          </div>
        </div>

        <div className="relative mb-8 space-y-4 rounded-2xl border border-white/60 bg-white/85 p-5 shadow-sm backdrop-blur-sm dark:border-neutral-700/80 dark:bg-neutral-900/80">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-bizzi-blue dark:text-bizzi-cyan">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bizzi-sky/80 text-[11px] text-bizzi-navy dark:bg-bizzi-navy/50 dark:text-white">
              1
            </span>
            Connect
          </div>
          <p className="text-sm text-neutral-600 dark:text-neutral-400">Link the account you want to pull from.</p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={loading || !user}
              onClick={() => void connectGoogle()}
              className="rounded-xl border border-neutral-200/80 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 shadow-sm transition hover:border-bizzi-blue/40 hover:shadow-md disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
            >
              Google Drive
            </button>
            <button
              type="button"
              disabled={loading || !user}
              onClick={() => void connectDropbox()}
              className="rounded-xl border border-neutral-200/80 bg-white px-4 py-2.5 text-sm font-medium text-neutral-800 shadow-sm transition hover:border-bizzi-blue/40 hover:shadow-md disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
            >
              Dropbox
            </button>
          </div>
          {accounts && (
            <ul className="space-y-2 text-sm text-neutral-600 dark:text-neutral-400">
              {accounts.map((a) => (
                <li key={a.provider} className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-neutral-800 dark:text-neutral-200">
                    {a.provider === "google_drive" ? "Google Drive" : "Dropbox"}
                  </span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                      a.connected
                        ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200"
                        : "bg-neutral-100 text-neutral-600 dark:bg-neutral-800 dark:text-neutral-400"
                    }`}
                  >
                    {a.connected ? "Connected" : "Not connected"}
                  </span>
                  {a.connected && (
                    <button
                      type="button"
                      className="text-xs font-medium text-red-600 underline-offset-2 hover:underline dark:text-red-400"
                      onClick={() => void disconnectProvider(a.provider)}
                    >
                      Disconnect
                    </button>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="relative mb-8 space-y-4 rounded-2xl border border-white/60 bg-white/85 p-5 shadow-sm backdrop-blur-sm dark:border-neutral-700/80 dark:bg-neutral-900/80">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-bizzi-blue dark:text-bizzi-cyan">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bizzi-sky/80 text-[11px] text-bizzi-navy dark:bg-bizzi-navy/50 dark:text-white">
              2
            </span>
            Choose from cloud
          </div>
          <div className="flex flex-wrap gap-3 items-center">
            <label className="text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Source{" "}
              <select
                className="ml-1 rounded-lg border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-zinc-900 px-2 py-1.5 text-sm shadow-sm"
                value={provider}
                onChange={(e) => setProvider(e.target.value as Provider)}
                disabled={!user}
              >
                <option value="google_drive">Google Drive</option>
                <option value="dropbox">Dropbox</option>
              </select>
            </label>
            {!providerConnected ? (
              <span className="text-sm text-amber-800 dark:text-amber-200">Connect a provider in step 1 first.</span>
            ) : browseLoading ? (
              <Loader2 className="h-4 w-4 animate-spin text-bizzi-blue" />
            ) : (
              <button
                type="button"
                className="text-sm font-semibold text-bizzi-blue underline-offset-2 hover:underline dark:text-bizzi-cyan"
                onClick={() => void loadProviderFolder()}
              >
                Refresh list
              </button>
            )}
          </div>

        {providerConnected && (
          <>
            <nav className="flex flex-wrap items-center gap-1 rounded-lg bg-bizzi-sky/30 px-2 py-1.5 text-xs text-neutral-700 dark:bg-neutral-800/80 dark:text-neutral-300">
              {providerTrail.map((c, idx) => (
                <span key={`${c.id}-${idx}`} className="flex items-center gap-1">
                  {idx > 0 ? <ChevronRight className="h-3 w-3 opacity-60" /> : null}
                  <button
                    type="button"
                    className="font-medium hover:text-bizzi-blue dark:hover:text-bizzi-cyan"
                    onClick={() => goProviderCrumb(idx)}
                  >
                    {c.name}
                  </button>
                </span>
              ))}
            </nav>
            <div className="max-h-56 overflow-auto rounded-xl border border-bizzi-blue/15 bg-white/50 divide-y divide-neutral-100 dark:divide-neutral-800 dark:bg-neutral-950/40">
              {providerEntries.length === 0 && !browseLoading ? (
                <p className="p-3 text-sm text-neutral-500">This folder is empty.</p>
              ) : (
                providerEntries.map((e) => {
                  const picked = picks.some(
                    (p) => p.ref === (provider === "google_drive" ? e.id : e.path_lower ?? e.id) && p.kind === (e.isFolder ? "folder" : "file")
                  );
                  return (
                    <div
                      key={`${e.id}-${e.path_lower ?? ""}`}
                      className="flex items-center gap-2 px-2 py-1.5 text-sm hover:bg-neutral-50 dark:hover:bg-zinc-800/80"
                    >
                      <input
                        type="checkbox"
                        checked={picked}
                        onChange={() => togglePick(e)}
                        className="rounded border-neutral-300"
                        aria-label={`Select ${e.name}`}
                      />
                      {e.isFolder ? (
                        <button
                          type="button"
                          className="flex min-w-0 flex-1 items-center gap-2 text-left"
                          onClick={() => enterProviderFolder(e)}
                        >
                          <FolderOpen className="h-4 w-4 shrink-0 text-amber-600" />
                          <span className="truncate text-neutral-900 dark:text-white">{e.name}</span>
                          <span className="text-xs text-neutral-400">Open</span>
                        </button>
                      ) : (
                        <span className="flex min-w-0 flex-1 items-center gap-2">
                          <FileGlyph className="h-4 w-4 shrink-0 text-neutral-400" />
                          <span className="truncate text-neutral-800 dark:text-neutral-200">{e.name}</span>
                        </span>
                      )}
                    </div>
                  );
                })
              )}
            </div>
            {picks.length > 0 && (
              <p className="text-xs text-neutral-600 dark:text-neutral-400">
                Selected: {picks.length} item(s). Folders import everything inside them; files import one file each.
              </p>
            )}
          </>
        )}
      </div>

        <div className="relative mb-8 space-y-4 rounded-2xl border border-white/60 bg-white/85 p-5 shadow-sm backdrop-blur-sm dark:border-neutral-700/80 dark:bg-neutral-900/80">
          <div className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wider text-bizzi-blue dark:text-bizzi-cyan">
            <span className="flex h-6 w-6 items-center justify-center rounded-full bg-bizzi-sky/80 text-[11px] text-bizzi-navy dark:bg-bizzi-navy/50 dark:text-white">
              3
            </span>
            Destination in Bizzi Storage
          </div>
        {!storageDrive?.id ? (
          <p className="text-sm text-amber-800 dark:text-amber-200">
            No Storage drive loaded yet. Open the Files page for this workspace, then return here.
          </p>
        ) : (
          <>
            <nav className="flex flex-wrap items-center gap-1 rounded-lg bg-bizzi-sky/30 px-2 py-1.5 text-xs text-neutral-700 dark:bg-neutral-800/80 dark:text-neutral-300">
              {destTrail.map((c, idx) => (
                <span key={`${c.path}-${idx}`} className="flex items-center gap-1">
                  {idx > 0 ? <ChevronRight className="h-3 w-3" /> : null}
                  <button
                    type="button"
                    className="font-medium hover:text-bizzi-blue dark:hover:text-bizzi-cyan"
                    onClick={() => goDestCrumb(idx)}
                  >
                    {c.name}
                  </button>
                </span>
              ))}
            </nav>
            <div className="max-h-40 overflow-auto rounded-xl border border-bizzi-blue/15 bg-white/50 dark:bg-neutral-950/40">
              {destFolderChoices.length === 0 ? (
                <p className="p-3 text-sm text-neutral-500">No subfolders here — you can still add a new subfolder name below.</p>
              ) : (
                destFolderChoices.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm transition hover:bg-bizzi-sky/40 dark:hover:bg-neutral-800"
                    onClick={() => enterDestFolder(f.path, f.name)}
                  >
                    <Folder className="h-4 w-4 shrink-0 text-amber-600" />
                    <span className="truncate font-medium">{f.name}</span>
                  </button>
                ))
              )}
            </div>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              New subfolder (optional)
              <input
                type="text"
                className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm outline-none focus:border-bizzi-blue dark:border-neutral-600 dark:bg-zinc-900 dark:focus:border-bizzi-cyan"
                placeholder="Creates inside the folder shown above — e.g. From Google"
                value={newSubfolder}
                onChange={(e) => setNewSubfolder(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              If a file already exists
              <select
                className="mt-1.5 w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm shadow-sm dark:border-neutral-600 dark:bg-zinc-900"
                value={duplicate_mode}
                onChange={(e) => setDuplicateMode(e.target.value as "skip" | "rename")}
              >
                <option value="skip">Skip</option>
                <option value="rename">Rename</option>
              </select>
            </label>
          </>
        )}
        </div>

        <div className="relative mb-8">
          <button
            type="button"
            disabled={!canStartScan}
            onClick={() => void createJob()}
            title={
              !user
                ? "Sign in to continue"
                : !providerConnected
                  ? "Connect a cloud provider first"
                  : !storageDrive?.id
                    ? "Load Storage from Files first"
                    : picks.length === 0
                      ? "Select files or folders in step 2"
                      : "Start cloud scan"
            }
            className={`inline-flex w-full items-center justify-center gap-2 rounded-2xl px-5 py-3.5 text-base font-semibold shadow-lg transition focus:outline-none focus-visible:ring-2 focus-visible:ring-bizzi-blue focus-visible:ring-offset-2 dark:focus-visible:ring-offset-neutral-900 sm:w-auto sm:min-w-[240px] ${
              canStartScan
                ? "bg-gradient-to-r from-bizzi-blue via-sky-500 to-bizzi-cyan text-white shadow-bizzi-blue/35 hover:brightness-110 active:scale-[0.99]"
                : "cursor-not-allowed bg-neutral-200 text-neutral-500 shadow-none dark:bg-neutral-800 dark:text-neutral-500"
            }`}
          >
            <CloudUpload className="h-5 w-5 opacity-90" />
            Start cloud scan
          </button>
          <p className="mt-2 max-w-lg text-xs text-neutral-500 dark:text-neutral-400">
            After the scan finishes, use <strong className="text-neutral-700 dark:text-neutral-300">Start import</strong> on
            your job card to copy files into Storage.
          </p>
        </div>

        {message && (
          <p className="mb-6 rounded-xl border border-amber-200/80 bg-amber-50/90 px-4 py-3 text-sm text-amber-950 dark:border-amber-500/30 dark:bg-amber-950/40 dark:text-amber-100">
            {message}
          </p>
        )}

        <div className="relative rounded-2xl border border-bizzi-blue/20 bg-white/75 p-5 backdrop-blur-sm dark:border-bizzi-blue/25 dark:bg-neutral-900/75">
          <h3 className="mb-1 text-lg font-bold text-bizzi-navy dark:text-white">Your imports</h3>
          <p className="mb-5 text-xs text-neutral-500 dark:text-neutral-400">
            Progress updates live on this page — no need to watch raw database fields.
          </p>
          {jobs.length === 0 ? (
            <p className="py-8 text-center text-sm text-neutral-500 dark:text-neutral-400">
              No imports yet. Complete the steps above to start one.
            </p>
          ) : (
            <ul className="space-y-4">
              {jobs.map((j) => (
                <MigrationJobCard
                  key={String((j as { id?: string }).id ?? "")}
                  job={j as Record<string, unknown> & { id?: string }}
                  onStart={(id) => void startJob(id)}
                  onPause={(id) => void pauseJob(id)}
                  onResume={(id) => void resumeJob(id)}
                />
              ))}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
