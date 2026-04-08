"use client";

import { useEffect, useState } from "react";
import { HardDrive, Cpu, FolderDown, Cloud, Film } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { BizziConformModal } from "./BizziConformModal";

/**
 * Must match `BIZZI_CLOUD_DESKTOP_UA_MARKER` in `desktop/electron/main.ts`
 * (session user agent suffix).
 */
const BIZZI_CLOUD_DESKTOP_UA_MARKER = "BizziCloudDesktop/1";

declare global {
  interface Window {
    bizzi?: {
      getSettings: () => Promise<Record<string, unknown>>;
      setSettings: (key: string, value: unknown) => Promise<Record<string, unknown>>;
      getPath: (name: "userData" | "cacheBase") => Promise<string>;
      openInFinder?: (pathToOpen: string) => Promise<string>;
      openExternal?: (url: string) => Promise<string>;
      nativeSync?: {
        isAvailable: () => Promise<boolean>;
        getStatus: () => Promise<{ isEnabled: boolean }>;
        enable: (apiBaseUrl: string, token: string) => Promise<{ syncPath: string }>;
        disable: () => Promise<void>;
        refreshToken: (token: string) => Promise<void>;
        refreshFolder: (driveSlug: string) => Promise<void>;
      };
    };
  }
}

const TOKEN_REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50 min (Firebase tokens ~1 hr)
const BRIDGE_POLL_MS = 75;
const BRIDGE_POLL_MAX_MS = 4000;

function isDesktopShellUserAgent(): boolean {
  return typeof navigator !== "undefined" && navigator.userAgent.includes(BIZZI_CLOUD_DESKTOP_UA_MARKER);
}

export function NLEMountPanel() {
  const { user } = useAuth();
  const [clientReady, setClientReady] = useState(false);
  const [hasDesktopBridge, setHasDesktopBridge] = useState(false);
  const [settings, setSettings] = useState<Record<string, unknown>>({});
  const [nativeSyncAvailable, setNativeSyncAvailable] = useState(false);
  const [nativeSyncEnabled, setNativeSyncEnabled] = useState(false);
  const [nativeSyncPath, setNativeSyncPath] = useState<string | null>(null);
  const [nativeSyncLoading, setNativeSyncLoading] = useState(false);
  const [nativeSyncError, setNativeSyncError] = useState<string | null>(null);
  const [conformModalOpen, setConformModalOpen] = useState(false);

  const isDesktopShell = clientReady && isDesktopShellUserAgent();

  useEffect(() => {
    setClientReady(true);
  }, []);

  /** Wait for Electron preload (`window.bizzi`) — never use `window.bizzi` during SSR / first paint. */
  useEffect(() => {
    if (!clientReady || !isDesktopShellUserAgent()) return;

    const update = () => setHasDesktopBridge(!!window.bizzi);
    update();
    if (window.bizzi) return;

    const started = Date.now();
    const id = window.setInterval(() => {
      update();
      if (window.bizzi || Date.now() - started > BRIDGE_POLL_MAX_MS) {
        window.clearInterval(id);
      }
    }, BRIDGE_POLL_MS);

    return () => window.clearInterval(id);
  }, [clientReady]);

  useEffect(() => {
    if (!isDesktopShell || !hasDesktopBridge) return;
    window.bizzi?.getSettings().then(setSettings);
    window.bizzi?.nativeSync?.isAvailable().then(setNativeSyncAvailable).catch(() => setNativeSyncAvailable(false));
  }, [isDesktopShell, hasDesktopBridge]);

  useEffect(() => {
    if (!isDesktopShell || !hasDesktopBridge || !window.bizzi?.nativeSync) return;
    window.bizzi.nativeSync.getStatus().then((s) => {
      setNativeSyncEnabled(s.isEnabled);
    });
  }, [isDesktopShell, hasDesktopBridge, nativeSyncAvailable]);

  useEffect(() => {
    if (!isDesktopShell || !hasDesktopBridge || !window.bizzi?.nativeSync?.refreshToken || !nativeSyncEnabled || !user)
      return;
    const refresh = async () => {
      try {
        const token = await user.getIdToken(true);
        if (token) await window.bizzi?.nativeSync?.refreshToken(token);
      } catch {
        // ignore; user may have signed out
      }
    };
    const timer = setInterval(refresh, TOKEN_REFRESH_INTERVAL_MS);
    return () => clearInterval(timer);
  }, [isDesktopShell, hasDesktopBridge, nativeSyncEnabled, user]);

  const handleNativeSyncToggle = async () => {
    if (!window.bizzi?.nativeSync || !user) return;
    setNativeSyncLoading(true);
    setNativeSyncError(null);
    try {
      if (nativeSyncEnabled) {
        await window.bizzi.nativeSync.disable();
        setNativeSyncEnabled(false);
        setNativeSyncPath(null);
      } else {
        const token = await user.getIdToken(true);
        if (!token) {
          setNativeSyncError("Not signed in. Sign in first.");
          return;
        }
        const apiBaseUrl = String(settings.apiBaseUrl ?? window.location.origin);
        const { syncPath } = await window.bizzi.nativeSync.enable(apiBaseUrl, token);
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
  const streamCachePresets = [
    { label: "500 GB", value: 500 * 1024 ** 3 },
    { label: "250 GB", value: 250 * 1024 ** 3 },
    { label: "100 GB", value: 100 * 1024 ** 3 },
  ];

  if (!clientReady) {
    return (
      <div className="rounded-lg border border-neutral-700 bg-neutral-900/30 p-4 animate-pulse">
        <div className="h-4 w-28 rounded bg-neutral-700 mb-3" />
        <div className="h-3 w-full rounded bg-neutral-800 mb-2" />
        <div className="h-3 w-[85%] rounded bg-neutral-800" />
      </div>
    );
  }

  if (!isDesktopShell) {
    return (
      <div className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
        <h2 className="flex items-center gap-2 font-medium mb-3 text-neutral-200">
          <HardDrive className="w-5 h-5 text-bizzi-blue" />
          NLE Editing
        </h2>
        <p className="text-sm text-neutral-400 mb-4">
          Download the Bizzi Cloud Mac app to open your drive in Finder with Apple File Provider and edit with Premiere Pro,
          DaVinci Resolve, or Final Cut Pro. Changes sync when you save.
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
      {/* Native Sync (File Provider) — primary */}
      <section className="p-4">
        <h2 className="flex items-center gap-2 font-medium mb-3 text-neutral-800 dark:text-neutral-200">
          <Cloud className="w-5 h-5 text-bizzi-blue" />
          Bizzi Cloud in Finder
          <span className="text-[10px] font-medium uppercase tracking-wide text-bizzi-blue/80 bg-bizzi-blue/10 px-2 py-0.5 rounded">
            Apple File Provider
          </span>
        </h2>
        <p className="text-sm text-neutral-400 mb-4">
          Native macOS integration—no macFUSE or rclone. Your libraries appear under <strong className="text-neutral-300">Locations</strong> in Finder;
          files load on demand.
        </p>
        {!hasDesktopBridge && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mb-3 rounded border border-amber-500/40 bg-amber-500/10 p-2">
            Connecting desktop integration… If this lasts more than a few seconds, quit and reopen the app, or check{" "}
            <code className="text-neutral-300">desktop.log</code> in your Bizzi cache folder.
          </p>
        )}
        {!nativeSyncAvailable && hasDesktopBridge && (
          <p className="text-xs text-amber-500 mb-3">
            Native Sync requires this Mac app build with the File Provider extension embedded. On other platforms this feature is not available.
          </p>
        )}
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">API Base URL</label>
            <input
              type="url"
              value={apiBaseUrl}
              onChange={(e) => updateSetting("apiBaseUrl", e.target.value)}
              disabled={nativeSyncEnabled || !hasDesktopBridge}
              className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-white disabled:opacity-60"
            />
          </div>
          <button
            disabled={!user || !nativeSyncAvailable || nativeSyncLoading || !hasDesktopBridge}
            onClick={handleNativeSyncToggle}
            className={`w-full py-2 rounded text-sm font-medium transition-colors ${
              user && nativeSyncAvailable && !nativeSyncLoading && hasDesktopBridge
                ? "bg-bizzi-blue hover:bg-bizzi-cyan text-white"
                : "bg-neutral-700 text-neutral-400 cursor-not-allowed"
            }`}
          >
            {nativeSyncLoading
              ? "Please wait…"
              : nativeSyncEnabled
                ? "Disable Bizzi Cloud in Finder"
                : "Enable Bizzi Cloud in Finder"}
          </button>
          {!user && <p className="text-xs text-amber-500">Sign in above to enable.</p>}
          {nativeSyncEnabled && (
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
                Available in Finder under Locations → Bizzi Cloud
              </p>
              {nativeSyncPath && (
                <button
                  type="button"
                  onClick={() => nativeSyncPath && window.bizzi?.openInFinder?.(nativeSyncPath)}
                  className="text-xs text-bizzi-blue dark:text-bizzi-cyan hover:underline font-medium"
                >
                  Open sync folder in Finder →
                </button>
              )}
            </div>
          )}
          {nativeSyncError && <p className="text-xs text-red-500">{nativeSyncError}</p>}
        </div>
      </section>

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
              type="button"
              disabled={!hasDesktopBridge}
              onClick={() => updateSetting("streamCacheMaxBytes", p.value)}
              className={`px-3 py-1.5 rounded text-sm ${
                maxBytes === p.value
                  ? "bg-bizzi-blue text-white"
                  : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700 disabled:opacity-40"
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

      {isDesktopShell && hasDesktopBridge && user && nativeSyncEnabled && (
        <BizziConformModal open={conformModalOpen} onClose={() => setConformModalOpen(false)} />
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
