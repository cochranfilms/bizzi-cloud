"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import { useBackup } from "@/context/BackupContext";
import SettingsSectionScope from "@/components/settings/SettingsSectionScope";
import { productSettingsCopy } from "@/lib/product-settings-copy";
import { ChevronRight, CloudUpload, Folder, FolderOpen, File, Loader2 } from "lucide-react";
import { getFirebaseFirestore, isFirebaseConfigured } from "@/lib/firebase/client";
import { MIGRATION_JOBS_COLLECTION, migrationMaxFoldersPerJob } from "@/lib/migration-constants";
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
      setMessage(`Import started — job ${d.job_id}. It will scan, then you can start transfer when ready.`);
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

  return (
    <section
      id="migration"
      className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900"
    >
      <SettingsSectionScope label={scopeLabel} />
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
        <CloudUpload className="h-5 w-5 text-bizzi-blue" />
        Cloud import
      </h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
        Copy files from Google Drive or Dropbox into your <strong>Storage</strong> workspace (not RAW or Gallery).
        Connect your account, tick what you want, choose where it lands in Bizzi, then start the import.
      </p>

      <div className="space-y-4 mb-8">
        <h3 className="font-semibold text-neutral-900 dark:text-white">Step 1 — Connect</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading || !user}
            onClick={() => void connectGoogle()}
            className="rounded-lg border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm"
          >
            Google Drive
          </button>
          <button
            type="button"
            disabled={loading || !user}
            onClick={() => void connectDropbox()}
            className="rounded-lg border border-neutral-200 dark:border-neutral-600 bg-white dark:bg-zinc-800 px-3 py-2 text-sm"
          >
            Dropbox
          </button>
        </div>
        {accounts && (
          <ul className="text-sm text-neutral-600 dark:text-neutral-400 space-y-1">
            {accounts.map((a) => (
              <li key={a.provider} className="flex flex-wrap items-center gap-2">
                <span>
                  {a.provider === "google_drive" ? "Google Drive" : "Dropbox"}:{" "}
                  {a.connected ? "connected" : "not connected"}
                </span>
                {a.connected && (
                  <button
                    type="button"
                    className="text-xs underline text-red-600 dark:text-red-400"
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

      <div className="space-y-4 mb-8 border-t border-neutral-200 dark:border-neutral-700 pt-6">
        <h3 className="font-semibold text-neutral-900 dark:text-white">Step 2 — Pick from cloud</h3>
        <div className="flex flex-wrap gap-3 items-center">
          <label className="text-sm text-neutral-700 dark:text-neutral-300">
            From{" "}
            <select
              className="ml-1 border border-neutral-200 dark:border-neutral-600 rounded-md px-2 py-1 bg-white dark:bg-zinc-900"
              value={provider}
              onChange={(e) => setProvider(e.target.value as Provider)}
              disabled={!user}
            >
              <option value="google_drive">Google Drive</option>
              <option value="dropbox">Dropbox</option>
            </select>
          </label>
          {!providerConnected ? (
            <span className="text-sm text-amber-700 dark:text-amber-300">Connect this provider above first.</span>
          ) : browseLoading ? (
            <Loader2 className="h-4 w-4 animate-spin text-neutral-500" />
          ) : (
            <button
              type="button"
              className="text-sm text-bizzi-blue hover:underline"
              onClick={() => void loadProviderFolder()}
            >
              Refresh list
            </button>
          )}
        </div>

        {providerConnected && (
          <>
            <nav className="flex flex-wrap items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400">
              {providerTrail.map((c, idx) => (
                <span key={`${c.id}-${idx}`} className="flex items-center gap-1">
                  {idx > 0 ? <ChevronRight className="h-3 w-3" /> : null}
                  <button
                    type="button"
                    className="hover:underline"
                    onClick={() => goProviderCrumb(idx)}
                  >
                    {c.name}
                  </button>
                </span>
              ))}
            </nav>
            <div className="max-h-56 overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-600 divide-y divide-neutral-100 dark:divide-neutral-800">
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
                          <File className="h-4 w-4 shrink-0 text-neutral-400" />
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

      <div className="space-y-4 mb-8 border-t border-neutral-200 dark:border-neutral-700 pt-6">
        <h3 className="font-semibold text-neutral-900 dark:text-white">Step 3 — Where in Bizzi Storage</h3>
        {!storageDrive?.id ? (
          <p className="text-sm text-amber-700 dark:text-amber-300">
            No Storage drive loaded yet. Open the Files page for this workspace, then return here.
          </p>
        ) : (
          <>
            <nav className="flex flex-wrap items-center gap-1 text-xs text-neutral-600 dark:text-neutral-400">
              {destTrail.map((c, idx) => (
                <span key={`${c.path}-${idx}`} className="flex items-center gap-1">
                  {idx > 0 ? <ChevronRight className="h-3 w-3" /> : null}
                  <button type="button" className="hover:underline" onClick={() => goDestCrumb(idx)}>
                    {c.name}
                  </button>
                </span>
              ))}
            </nav>
            <div className="max-h-40 overflow-auto rounded-lg border border-neutral-200 dark:border-neutral-600">
              {destFolderChoices.length === 0 ? (
                <p className="p-3 text-sm text-neutral-500">No subfolders here — you can still add a new subfolder name below.</p>
              ) : (
                destFolderChoices.map((f) => (
                  <button
                    key={f.path}
                    type="button"
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm hover:bg-neutral-50 dark:hover:bg-zinc-800"
                    onClick={() => enterDestFolder(f.path, f.name)}
                  >
                    <Folder className="h-4 w-4 text-amber-600 shrink-0" />
                    <span className="truncate">{f.name}</span>
                  </button>
                ))
              )}
            </div>
            <label className="block text-sm text-neutral-700 dark:text-neutral-300">
              New subfolder (optional)
              <input
                type="text"
                className="mt-1 w-full border border-neutral-200 dark:border-neutral-600 rounded-md px-2 py-1 bg-white dark:bg-zinc-900 text-sm"
                placeholder="e.g. From Google — creates this folder inside the location above"
                value={newSubfolder}
                onChange={(e) => setNewSubfolder(e.target.value)}
                autoComplete="off"
              />
            </label>
            <label className="block text-sm text-neutral-700 dark:text-neutral-300">
              If a file already exists
              <select
                className="mt-1 w-full border border-neutral-200 dark:border-neutral-600 rounded-md px-2 py-1 bg-white dark:bg-zinc-900"
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

      <button
        type="button"
        disabled={loading || !user || !providerConnected || !storageDrive?.id || picks.length === 0}
        onClick={() => void createJob()}
        className="rounded-lg bg-bizzi-blue text-white px-4 py-2 text-sm font-medium hover:bg-bizzi-cyan disabled:opacity-60 mb-6"
      >
        Start import (scan)
      </button>

      {message && <p className="text-sm mb-4 text-amber-700 dark:text-amber-300">{message}</p>}

      <div>
        <h3 className="font-semibold mb-2 text-neutral-900 dark:text-white">Your import jobs</h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
          Status updates live while this page is open. Use <strong>Start transfer</strong> when a job is ready.
        </p>
        <ul className="space-y-2 text-sm">
          {jobs.map((j) => {
            const id = (j as { id?: string }).id ?? "";
            const st = String(j.status ?? "");
            const prov = String((j as { provider?: string }).provider ?? "");
            const scanned =
              typeof (j as { files_total_scanned?: unknown }).files_total_scanned === "number"
                ? (j as { files_total_scanned: number }).files_total_scanned
                : null;
            const supported =
              typeof (j as { files_supported_count?: unknown }).files_supported_count === "number"
                ? (j as { files_supported_count: number }).files_supported_count
                : null;
            return (
              <li
                key={id}
                className="border border-neutral-200 dark:border-neutral-600 rounded-md p-2 flex flex-wrap items-center justify-between gap-2"
              >
                <div className="min-w-0 text-neutral-800 dark:text-neutral-200">
                  <div>
                    <code className="text-xs">{id}</code>
                    {prov ? (
                      <span className="text-xs text-neutral-500 ml-1">· {prov.replace("_", " ")}</span>
                    ) : null}{" "}
                    — {st}
                  </div>
                  {scanned != null && st === "scanning" ? (
                    <div className="text-xs text-neutral-500 mt-0.5">Discovered files (approx.): {scanned}</div>
                  ) : null}
                  {supported != null && (st === "ready" || st === "running" || st === "paused") ? (
                    <div className="text-xs text-neutral-500 mt-0.5">Queued files: {supported}</div>
                  ) : null}
                </div>
                <span className="flex flex-wrap gap-2">
                  {st === "ready" && (
                    <button
                      type="button"
                      className="text-bizzi-blue dark:text-bizzi-cyan underline text-xs"
                      onClick={() => void startJob(id)}
                    >
                      Start transfer
                    </button>
                  )}
                  {(st === "scanning" || st === "running") && (
                    <button
                      type="button"
                      className="text-amber-700 dark:text-amber-300 underline text-xs"
                      onClick={() => void pauseJob(id)}
                    >
                      Pause
                    </button>
                  )}
                  {st === "paused" && (
                    <button
                      type="button"
                      className="text-green-700 dark:text-green-400 underline text-xs"
                      onClick={() => void resumeJob(id)}
                    >
                      Resume
                    </button>
                  )}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
