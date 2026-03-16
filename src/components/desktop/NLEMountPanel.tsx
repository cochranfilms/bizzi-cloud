"use client";

import { useEffect, useState } from "react";
import { HardDrive, Cpu, FolderDown, Cloud, CheckCircle2, XCircle, ExternalLink, Film } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { BizziConformModal } from "./BizziConformModal";

declare global {
  interface Window {
    bizzi?: {
      getSettings: () => Promise<Record<string, unknown>>;
      setSettings: (key: string, value: unknown) => Promise<Record<string, unknown>>;
      getPath: (name: "userData" | "cacheBase") => Promise<string>;
      openInFinder?: (pathToOpen: string) => Promise<string>;
      openExternal?: (url: string) => Promise<string>;
      mount?: {
        isFuseAvailable: () => Promise<boolean>;
        getDependencies: () => Promise<{
          rclone: { available: boolean; source: "bundled" | "system" | null };
          macFuse: { installed: boolean; version?: string };
        }>;
        getStatus: () => Promise<{ isMounted: boolean; mountPoint: string | null }>;
        mount: (apiBaseUrl: string, token: string) => Promise<{ mountPoint: string }>;
        unmount: () => Promise<void>;
        refreshToken: (token: string) => Promise<void>;
        refreshFolder: (driveSlug: string) => Promise<void>;
      };
      nativeSync?: {
        isAvailable: () => Promise<boolean>;
        getStatus: () => Promise<{ isEnabled: boolean }>;
        enable: (apiBaseUrl: string, token: string) => Promise<{ syncPath: string }>;
        disable: () => Promise<void>;
        refreshToken: (token: string) => Promise<void>;
      };
    };
  }
}

const TOKEN_REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50 min (Firebase tokens ~1 hr)

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

export function NLEMountPanel() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [fuseAvailable, setFuseAvailable] = useState<boolean | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [mountPoint, setMountPoint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nativeSyncAvailable, setNativeSyncAvailable] = useState(false);
  const [nativeSyncEnabled, setNativeSyncEnabled] = useState(false);
  const [nativeSyncPath, setNativeSyncPath] = useState<string | null>(null);
  const [nativeSyncLoading, setNativeSyncLoading] = useState(false);
  const [nativeSyncError, setNativeSyncError] = useState<string | null>(null);
  const [conformModalOpen, setConformModalOpen] = useState(false);
  const [dependencies, setDependencies] = useState<{
    rclone: { available: boolean; source: "bundled" | "system" | null };
    macFuse: { installed: boolean; version?: string };
  } | null>(null);

  const isDesktop = typeof window !== "undefined" && !!window.bizzi?.mount;

  useEffect(() => {
    if (!isDesktop) return;
    window.bizzi?.getSettings().then(setSettings);
    window.bizzi?.mount?.isFuseAvailable().then(setFuseAvailable).catch(() => setFuseAvailable(false));
    window.bizzi?.nativeSync?.isAvailable().then(setNativeSyncAvailable).catch(() => setNativeSyncAvailable(false));
    window.bizzi?.mount?.getDependencies?.().then(setDependencies).catch(() => setDependencies(null));
  }, [isDesktop]);

  useEffect(() => {
    if (!isDesktop || !window.bizzi?.nativeSync) return;
    window.bizzi.nativeSync.getStatus().then((s) => {
      setNativeSyncEnabled(s.isEnabled);
    });
  }, [isDesktop, nativeSyncAvailable]);

  useEffect(() => {
    if (!isDesktop || !window.bizzi?.mount) return;
    const refresh = () =>
      window.bizzi?.mount?.getStatus().then((s) => {
        setIsMounted(s.isMounted);
        setMountPoint(s.mountPoint);
      });
    refresh();
  }, [isDesktop, fuseAvailable]);

  // Refresh auth token every 50 min when mounted so mount keeps working after Firebase token expires
  useEffect(() => {
    if (!isDesktop || !window.bizzi?.mount?.refreshToken || !isMounted || !user) return;
    const refresh = async () => {
      try {
        const token = await user.getIdToken(true);
        if (token) await window.bizzi?.mount?.refreshToken(token);
      } catch {
        // ignore; user may have signed out
      }
    };
    const id = setInterval(refresh, TOKEN_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isDesktop, isMounted, user]);

  const handleMountToggle = async () => {
    if (!window.bizzi?.mount || !user) return;
    setLoading(true);
    setError(null);
    try {
      if (isMounted) {
        await window.bizzi.mount.unmount();
        setIsMounted(false);
        setMountPoint(null);
      } else {
        const token = await user.getIdToken(true);
        if (!token) {
          setError("Not signed in. Sign in first.");
          return;
        }
        const apiBaseUrl = String(settings.apiBaseUrl ?? window.location.origin);
        const { mountPoint: point } = await window.bizzi.mount.mount(apiBaseUrl, token);
        setIsMounted(true);
        setMountPoint(point);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleNativeSyncToggle = async () => {
    if (!window.bizzi?.nativeSync || !user) return;
    setNativeSyncLoading(true);
    setNativeSyncError(null);
    try {
      if (nativeSyncEnabled) {
        await window.bizzi.nativeSync!.disable();
        setNativeSyncEnabled(false);
        setNativeSyncPath(null);
      } else {
        const token = await user.getIdToken(true);
        if (!token) {
          setNativeSyncError("Not signed in. Sign in first.");
          return;
        }
        const apiBaseUrl = String(settings.apiBaseUrl ?? window.location.origin);
        const { syncPath } = await window.bizzi.nativeSync!.enable(apiBaseUrl, token);
        setNativeSyncEnabled(true);
        setNativeSyncPath(syncPath);
      }
    } catch (err) {
      setNativeSyncError(err instanceof Error ? err.message : String(err));
    } finally {
      setNativeSyncLoading(false);
    }
  };

  const updateSetting = (key: string, value: unknown) => {
    window.bizzi?.setSettings(key, value).then(setSettings);
  };

  const apiBaseUrl = String(settings.apiBaseUrl ?? "https://www.bizzicloud.io");
  const maxBytes = Number(settings.streamCacheMaxBytes ?? 500 * 1024 ** 3);
  const cacheBaseDir = String(settings.cacheBaseDir ?? "");
  const mountReady = (dependencies?.rclone.available && dependencies?.macFuse.installed) ?? fuseAvailable === true;
  const canMount = mountReady && !!user && !loading;
  const streamCachePresets = [
    { label: "500 GB", value: 500 * 1024 ** 3 },
    { label: "250 GB", value: 250 * 1024 ** 3 },
    { label: "100 GB", value: 100 * 1024 ** 3 },
  ];

  if (!isDesktop) {
    return (
      <div className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
        <h2 className="flex items-center gap-2 font-medium mb-3 text-neutral-200">
          <HardDrive className="w-5 h-5 text-bizzi-blue" />
          NLE Editing
        </h2>
        <p className="text-sm text-neutral-400 mb-4">
          Download the Bizzi Cloud Mac app to mount your drive in Finder and edit with Premiere Pro, DaVinci Resolve, or Final Cut Pro. Changes sync when you save.
        </p>
        <a
          href="https://www.bizzicloud.io/desktop"
          target="_blank"
          rel="noopener noreferrer"
          className="text-sm text-bizzi-blue hover:underline"
        >
          Get the desktop app →
        </a>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {/* Mount dependencies status */}
      {dependencies && (
        <section className="px-4 py-2">
          <div className="rounded-lg border border-neutral-700/60 bg-neutral-900/30 p-3 space-y-3">
            <h3 className="text-xs font-medium text-neutral-400 uppercase tracking-wider">Requirements</h3>
            <div className="space-y-2 text-sm">
              <div className="flex items-center justify-between gap-2">
                <span className="text-neutral-300">rclone</span>
                {dependencies.rclone.available ? (
                  <span className="flex items-center gap-1.5 text-emerald-500">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    {dependencies.rclone.source === "bundled" ? "Bundled" : "Installed"}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-amber-500">
                    <XCircle className="w-4 h-4 shrink-0" />
                    Not found
                  </span>
                )}
              </div>
              <div className="flex items-center justify-between gap-2">
                <span className="text-neutral-300">macFUSE</span>
                {dependencies.macFuse.installed ? (
                  <span className="flex items-center gap-1.5 text-emerald-500">
                    <CheckCircle2 className="w-4 h-4 shrink-0" />
                    Installed{dependencies.macFuse.version ? ` (${dependencies.macFuse.version})` : ""}
                  </span>
                ) : (
                  <span className="flex items-center gap-1.5 text-amber-500">
                    <XCircle className="w-4 h-4 shrink-0" />
                    Required for Mount Drive
                  </span>
                )}
              </div>
            </div>
            {!dependencies.macFuse.installed && (
              <button
                type="button"
                onClick={() => window.bizzi?.openExternal?.("https://macfuse.github.io/")}
                className="flex items-center gap-2 w-full py-2.5 px-3 rounded-lg bg-amber-500/20 border border-amber-500/40 text-amber-400 hover:bg-amber-500/30 transition-colors text-sm font-medium"
              >
                <ExternalLink className="w-4 h-4 shrink-0" />
                Install macFUSE
              </button>
            )}
          </div>
        </section>
      )}

      {/* Mount section - primary NLE feature */}
      <section className="p-4">
        <h2 className="flex items-center gap-2 font-medium mb-3 text-neutral-800 dark:text-neutral-200">
          <HardDrive className="w-5 h-5 text-bizzi-blue" />
          Mount Drive
          <span className="text-[10px] font-medium uppercase tracking-wide text-bizzi-blue/80 bg-bizzi-blue/10 px-2 py-0.5 rounded">
            Best for editing
          </span>
        </h2>
        <p className="text-sm text-neutral-400 mb-4">
          Mount Bizzi Cloud as a local volume. Edit in your NLE—changes sync when you save.
        </p>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">API Base URL</label>
            <input
              type="url"
              value={apiBaseUrl}
              onChange={(e) => updateSetting("apiBaseUrl", e.target.value)}
              disabled={isMounted}
              className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-white disabled:opacity-60"
            />
          </div>
          <button
            disabled={!canMount || (isMounted && loading)}
            onClick={handleMountToggle}
            className={`w-full py-2 rounded text-sm font-medium transition-colors ${
              canMount
                ? "bg-bizzi-blue hover:bg-bizzi-cyan text-white"
                : "bg-neutral-700 text-neutral-400 cursor-not-allowed"
            }`}
          >
            {loading ? "Please wait…" : isMounted ? "Unmount" : "Mount Drive"}
          </button>
          {!user && (
            <p className="text-xs text-amber-500">Sign in above to mount your drive.</p>
          )}
          {!mountReady && user && dependencies && (
            <p className="text-xs text-neutral-400">
              {!dependencies.macFuse.installed ? (
                <>Install macFUSE above, then restart your Mac.</>
              ) : !dependencies.rclone.available ? (
                <>rclone is bundled with the app. If missing, reinstall Bizzi Cloud.</>
              ) : null}
            </p>
          )}
          {isMounted && mountPoint && (
            <div className="space-y-2">
              <button
                type="button"
                onClick={() => setConformModalOpen(true)}
                className="w-full py-2 rounded text-sm font-medium bg-emerald-600/20 border border-emerald-500/40 text-emerald-400 hover:bg-emerald-600/30 transition-colors flex items-center justify-center gap-2"
              >
                <Film className="w-4 h-4" />
                Bizzi Conform
              </button>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                Switch mounted clips from proxy to full resolution. Same path, different bytes.
              </p>
              <p className="text-sm text-emerald-600 dark:text-emerald-400 font-medium">
                {mountPoint.startsWith("/Volumes/")
                  ? "Mounted to your Mac"
                  : "Mounted"}
              </p>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {mountPoint.startsWith("/Volumes/")
                  ? "Find Bizzi Cloud in Finder under Locations, next to your other drives."
                  : "Open Finder to access your drive."}
              </p>
              <button
                type="button"
                onClick={() => window.bizzi?.openInFinder?.(mountPoint)}
                className="text-xs text-bizzi-blue dark:text-bizzi-cyan hover:underline font-medium"
              >
                Open in Finder →
              </button>
            </div>
          )}
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      </section>

      {/* Native Sync (File Provider) - macOS only */}
      {nativeSyncAvailable && (
        <section className="p-4">
          <h2 className="flex items-center gap-2 font-medium mb-3 text-neutral-200">
            <Cloud className="w-5 h-5 text-bizzi-blue" />
            Native Sync (Beta)
          </h2>
          <p className="text-sm text-neutral-400 mb-4">
            Apple File Provider—no rclone or macFUSE. On-demand files in Finder. Appears in Locations.
          </p>
          <div className="space-y-3">
            <button
              disabled={!user || nativeSyncLoading}
              onClick={handleNativeSyncToggle}
              className={`w-full py-2 rounded text-sm font-medium transition-colors ${
                user && !nativeSyncLoading
                  ? "bg-bizzi-blue hover:bg-bizzi-cyan text-white"
                  : "bg-neutral-700 text-neutral-400 cursor-not-allowed"
              }`}
            >
              {nativeSyncLoading
                ? "Please wait…"
                : nativeSyncEnabled
                  ? "Disable Native Sync"
                  : "Enable Native Sync"}
            </button>
            {nativeSyncEnabled && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 font-medium">
                Available in Finder under Locations.
              </p>
            )}
            {nativeSyncError && <p className="text-xs text-red-500">{nativeSyncError}</p>}
          </div>
        </section>
      )}

      {/* Stream cache */}
      <section className="p-4">
        <h2 className="flex items-center gap-2 font-medium mb-3 text-neutral-800 dark:text-neutral-200">
          <Cpu className="w-5 h-5 text-neutral-400" />
          Stream Cache
        </h2>
        <p className="text-sm text-neutral-400 mb-3">
          LRU cache for streamed chunks.
        </p>
        <div className="flex gap-2 flex-wrap">
          {streamCachePresets.map((p) => (
            <button
              key={p.label}
              onClick={() => updateSetting("streamCacheMaxBytes", p.value)}
              className={`px-3 py-1.5 rounded text-sm ${
                maxBytes === p.value
                  ? "bg-bizzi-blue text-white"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
              }`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-neutral-500 truncate mt-2" title={cacheBaseDir}>
          {cacheBaseDir || "—"}
        </p>
      </section>

      {isDesktop && user && (
        <BizziConformModal
          open={conformModalOpen}
          onClose={() => setConformModalOpen(false)}
        />
      )}

      {/* Local store info */}
      <section className="p-4">
        <h2 className="flex items-center gap-2 font-medium mb-2 text-neutral-800 dark:text-neutral-200">
          <FolderDown className="w-5 h-5 text-neutral-400" />
          Stored Locally
        </h2>
        <p className="text-xs text-neutral-400">
          Right-click files in Finder → &quot;Store Locally for Editing&quot; for offline NLE workflows.
        </p>
      </section>
    </div>
  );
}
