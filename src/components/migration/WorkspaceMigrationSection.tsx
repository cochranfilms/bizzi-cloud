"use client";

import { useCallback, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { collection, limit, onSnapshot, orderBy, query, where } from "firebase/firestore";
import { useAuth } from "@/context/AuthContext";
import SettingsSectionScope from "@/components/settings/SettingsSectionScope";
import { productSettingsCopy } from "@/lib/product-settings-copy";
import { CloudUpload } from "lucide-react";
import { getFirebaseFirestore, isFirebaseConfigured } from "@/lib/firebase/client";
import { MIGRATION_JOBS_COLLECTION } from "@/lib/migration-constants";

type Provider = "google_drive" | "dropbox";

export type WorkspaceMigrationSectionProps = {
  /** Path + optional hash, e.g. `/dashboard/settings#migration` */
  oauthReturnPath: string;
  /** Prefills org workspace id when importing into organization Storage */
  defaultWorkspaceId?: string | null;
  scopeLabel?: string;
};

export default function WorkspaceMigrationSection({
  oauthReturnPath,
  defaultWorkspaceId = null,
  scopeLabel = productSettingsCopy.scopes.personalAccountOnly,
}: WorkspaceMigrationSectionProps) {
  const { user } = useAuth();
  const searchParams = useSearchParams();
  const [accounts, setAccounts] = useState<{ provider: Provider; connected: boolean }[] | null>(null);
  const [jobs, setJobs] = useState<Record<string, unknown>[]>([]);
  const [loading, setLoading] = useState(false);
  const [form, setForm] = useState({
    provider: "google_drive" as Provider,
    drive_id: "",
    workspace_id: "",
    destination_path_prefix: "",
    sources: [{ ref: "", label: "imported" }],
    duplicate_mode: "skip" as "skip" | "rename",
  });
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (defaultWorkspaceId) {
      setForm((f) => ({ ...f, workspace_id: defaultWorkspaceId }));
    }
  }, [defaultWorkspaceId]);

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
      setMessage(`Connected: ${connected}`);
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
      const d = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) throw new Error(d.error ?? "start_failed");
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
      const d = (await res.json()) as { url?: string; error?: string };
      if (!res.ok) throw new Error(d.error ?? "start_failed");
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
      const h = await authHeader();
      if (!h) throw new Error("Sign in first");
      const res = await fetch("/api/migrations/jobs", {
        method: "POST",
        headers: { ...h, "Content-Type": "application/json" },
        body: JSON.stringify({
          provider: form.provider,
          duplicate_mode: form.duplicate_mode,
          drive_id: form.drive_id.trim(),
          workspace_id: form.workspace_id.trim() || null,
          destination_path_prefix: form.destination_path_prefix.trim(),
          sources: form.sources.filter((s) => s.ref.trim()),
        }),
      });
      const d = (await res.json()) as { job_id?: string; error?: string; code?: string };
      if (!res.ok) throw new Error(d.error ?? "create_failed");
      setMessage(`Job created: ${d.job_id}`);
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

  async function disconnectProvider(provider: Provider) {
    const h = await authHeader();
    if (!h) return;
    await fetch(`/api/migrations/accounts?provider=${provider}`, { method: "DELETE", headers: h });
    await refreshAccounts();
  }

  return (
    <section
      id="migration"
      className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900"
    >
      <SettingsSectionScope label={scopeLabel} />
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
        <CloudUpload className="h-5 w-5 text-bizzi-blue" />
        Migration
      </h2>
      <p className="text-sm text-neutral-600 dark:text-neutral-400 mb-6">
        One-time copy from Google Drive or Dropbox into your <strong>Storage</strong> area only (not RAW or
        Gallery Media). File data moves server-side; refresh this page to update job status. In production,
        configure <code className="text-xs">MIGRATION_TOKEN_ENCRYPTION_KEY</code>, OAuth client IDs, and{" "}
        <code className="text-xs">MIGRATION_PUBLIC_APP_URL</code>.
      </p>

      <div className="space-y-4 mb-8">
        <h3 className="font-semibold text-neutral-900 dark:text-white">1. Connect provider</h3>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={loading || !user}
            onClick={() => void connectGoogle()}
            className="rounded-lg bg-white dark:bg-zinc-800 border border-neutral-200 dark:border-neutral-600 px-3 py-2 text-sm"
          >
            Google Drive
          </button>
          <button
            type="button"
            disabled={loading || !user}
            onClick={() => void connectDropbox()}
            className="rounded-lg bg-white dark:bg-zinc-800 border border-neutral-200 dark:border-neutral-600 px-3 py-2 text-sm"
          >
            Dropbox
          </button>
        </div>
        {accounts && (
          <ul className="text-sm text-neutral-600 dark:text-neutral-400 space-y-1">
            {accounts.map((a) => (
              <li key={a.provider} className="flex flex-wrap items-center gap-2">
                <span>
                  {a.provider}: {a.connected ? "connected" : "not connected"}
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

      <div className="space-y-3 mb-8">
        <h3 className="font-semibold text-neutral-900 dark:text-white">2. New import job</h3>
        <label className="block text-sm text-neutral-800 dark:text-neutral-200">
          Provider
          <select
            className="mt-1 w-full border border-neutral-200 dark:border-neutral-600 rounded-md px-2 py-1 bg-white dark:bg-zinc-900 text-neutral-900 dark:text-white"
            value={form.provider}
            onChange={(e) => setForm((f) => ({ ...f, provider: e.target.value as Provider }))}
          >
            <option value="google_drive">Google Drive</option>
            <option value="dropbox">Dropbox</option>
          </select>
        </label>
        <label className="block text-sm text-neutral-800 dark:text-neutral-200">
          Destination Storage <code className="text-xs">drive_id</code>
          <input
            className="mt-1 w-full border border-neutral-200 dark:border-neutral-600 rounded-md px-2 py-1 bg-white dark:bg-zinc-900 text-neutral-900 dark:text-white"
            value={form.drive_id}
            onChange={(e) => setForm((f) => ({ ...f, drive_id: e.target.value }))}
            placeholder="linked_drives document id"
          />
        </label>
        <label className="block text-sm text-neutral-800 dark:text-neutral-200">
          Organization workspace id (optional; required for org Storage)
          <input
            className="mt-1 w-full border border-neutral-200 dark:border-neutral-600 rounded-md px-2 py-1 bg-white dark:bg-zinc-900 text-neutral-900 dark:text-white"
            value={form.workspace_id}
            onChange={(e) => setForm((f) => ({ ...f, workspace_id: e.target.value }))}
          />
        </label>
        <label className="block text-sm text-neutral-800 dark:text-neutral-200">
          Destination folder path under Storage (optional prefix)
          <input
            className="mt-1 w-full border border-neutral-200 dark:border-neutral-600 rounded-md px-2 py-1 bg-white dark:bg-zinc-900 text-neutral-900 dark:text-white"
            value={form.destination_path_prefix}
            onChange={(e) => setForm((f) => ({ ...f, destination_path_prefix: e.target.value }))}
          />
        </label>
        <label className="block text-sm text-neutral-800 dark:text-neutral-200">
          Duplicate handling
          <select
            className="mt-1 w-full border border-neutral-200 dark:border-neutral-600 rounded-md px-2 py-1 bg-white dark:bg-zinc-900 text-neutral-900 dark:text-white"
            value={form.duplicate_mode}
            onChange={(e) =>
              setForm((f) => ({ ...f, duplicate_mode: e.target.value as "skip" | "rename" }))
            }
          >
            <option value="skip">Skip if exists</option>
            <option value="rename">Rename if exists</option>
          </select>
        </label>
        <label className="block text-sm text-neutral-800 dark:text-neutral-200">
          Source folder{" "}
          {form.provider === "google_drive" ? "(Google folder id, e.g. from URL)" : "(Dropbox path_lower)"}
          <input
            className="mt-1 w-full border border-neutral-200 dark:border-neutral-600 rounded-md px-2 py-1 bg-white dark:bg-zinc-900 text-neutral-900 dark:text-white"
            value={form.sources[0]?.ref ?? ""}
            onChange={(e) =>
              setForm((f) => ({
                ...f,
                sources: [{ ref: e.target.value, label: f.sources[0]?.label ?? "imported" }],
              }))
            }
          />
        </label>
        <button
          type="button"
          disabled={loading || !user}
          onClick={() => void createJob()}
          className="rounded-lg bg-bizzi-blue text-white px-4 py-2 text-sm font-medium hover:bg-bizzi-cyan disabled:opacity-60"
        >
          Create job (starts scan)
        </button>
      </div>

      {message && <p className="text-sm mb-4 text-amber-700 dark:text-amber-300">{message}</p>}

      <div>
        <h3 className="font-semibold mb-2 text-neutral-900 dark:text-white">Recent jobs</h3>
        <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-2">
          Jobs update in real time while this page stays open. The migration worker cron drives scan and
          transfer on the server.
        </p>
        <ul className="space-y-2 text-sm">
          {jobs.map((j) => {
            const id = (j as { id?: string }).id ?? "";
            const st = String(j.status ?? "");
            const provider = String((j as { provider?: string }).provider ?? "");
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
                    {provider ? (
                      <span className="text-xs text-neutral-500 dark:text-neutral-400 ml-1">
                        · {provider.replace("_", " ")}
                      </span>
                    ) : null}{" "}
                    — {st}
                  </div>
                  {scanned != null && st === "scanning" ? (
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                      Discovered files (approx.): {scanned}
                    </div>
                  ) : null}
                  {supported != null && (st === "ready" || st === "running" || st === "paused") ? (
                    <div className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                      Supported files queued: {supported}
                    </div>
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
