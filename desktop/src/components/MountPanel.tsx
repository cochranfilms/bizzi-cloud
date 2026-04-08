import { useEffect, useState } from "react";
import { Cloud } from "lucide-react";

const TOKEN_REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50 min (Firebase tokens ~1 hr)

interface MountPanelProps {
  settings: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => void;
  getToken: () => Promise<string | null>;
  isSignedIn: boolean;
  authLoading: boolean;
}

export function MountPanel({ settings, onUpdate, getToken, isSignedIn, authLoading }: MountPanelProps) {
  const apiBaseUrl = String(settings.apiBaseUrl ?? "https://www.bizzicloud.io");
  const [nativeSyncAvailable, setNativeSyncAvailable] = useState(false);
  const [nativeSyncEnabled, setNativeSyncEnabled] = useState(false);
  const [nativeSyncPath, setNativeSyncPath] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.bizzi?.nativeSync?.isAvailable().then(setNativeSyncAvailable).catch(() => setNativeSyncAvailable(false));
  }, []);

  const refreshStatus = () =>
    window.bizzi?.nativeSync?.getStatus().then((s) => {
      setNativeSyncEnabled(s.isEnabled);
    }).catch(() => {});

  useEffect(() => {
    if (!window.bizzi?.nativeSync) return;
    refreshStatus();
  }, [nativeSyncAvailable]);

  useEffect(() => {
    const ns = window.bizzi?.nativeSync;
    if (!ns || !("refreshToken" in ns) || !nativeSyncEnabled || !isSignedIn) return;
    const refresh = async () => {
      try {
        const token = await getToken();
        if (token && typeof ns.refreshToken === "function") {
          await ns.refreshToken(token);
        }
      } catch {
        // ignore
      }
    };
    const id = setInterval(refresh, TOKEN_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [nativeSyncEnabled, isSignedIn, getToken]);

  const handleToggle = async () => {
    if (!window.bizzi?.nativeSync) return;
    setLoading(true);
    setError(null);
    try {
      const latest = await window.bizzi.nativeSync.getStatus();
      setNativeSyncEnabled(latest.isEnabled);

      if (latest.isEnabled) {
        await window.bizzi.nativeSync.disable();
        setNativeSyncEnabled(false);
        setNativeSyncPath(null);
      } else {
        const token = await getToken();
        if (!token) {
          setError("Not signed in. Sign in first.");
          return;
        }
        const { syncPath } = await window.bizzi.nativeSync.enable(apiBaseUrl, token);
        setNativeSyncEnabled(true);
        setNativeSyncPath(syncPath);
      }
      refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      refreshStatus();
    } finally {
      setLoading(false);
    }
  };

  const canEnable = nativeSyncAvailable && isSignedIn && !loading && !authLoading;
  const buttonDisabled = !canEnable || (nativeSyncEnabled && loading);

  return (
    <section className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
      <h2 className="flex items-center gap-2 font-medium mb-3">
        <Cloud className="w-5 h-5 text-bizzi-blue" />
        Bizzi Cloud in Finder
      </h2>
      <p className="text-sm text-neutral-400 mb-4">
        Apple File Provider—your libraries appear under Locations. No macFUSE or rclone.
      </p>
      {!nativeSyncAvailable && (
        <p className="text-xs text-amber-500 mb-3">
          File Provider extension missing or not macOS. Build the app with the embedded extension (see desktop README).
        </p>
      )}
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">API Base URL</label>
          <input
            type="url"
            value={apiBaseUrl}
            onChange={(e) => onUpdate("apiBaseUrl", e.target.value)}
            disabled={nativeSyncEnabled}
            className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 disabled:opacity-60 focus:border-bizzi-blue focus:ring-1 focus:ring-bizzi-blue/30 outline-none transition-colors"
          />
        </div>
        <button
          disabled={buttonDisabled}
          onClick={handleToggle}
          className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
            canEnable
              ? "bg-bizzi-blue hover:bg-bizzi-cyan text-white cursor-pointer"
              : "bg-neutral-700 text-neutral-400 cursor-not-allowed"
          }`}
        >
          {loading ? "Please wait…" : nativeSyncEnabled ? "Disable" : "Enable Bizzi Cloud in Finder"}
        </button>
        {!isSignedIn && !authLoading && (
          <p className="text-xs text-amber-500">
            Sign in to Bizzi Cloud above to enable.
          </p>
        )}
        {nativeSyncEnabled && nativeSyncPath && (
          <p className="text-xs text-bizzi-cyan">
            Sync path: <code className="bg-neutral-800 px-1 rounded">{nativeSyncPath}</code>
          </p>
        )}
        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}
      </div>
    </section>
  );
}
