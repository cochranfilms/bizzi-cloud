import { useEffect, useState } from "react";
import { HardDrive } from "lucide-react";

const TOKEN_REFRESH_INTERVAL_MS = 50 * 60 * 1000; // 50 min (Firebase tokens ~1 hr)
const STATUS_REFRESH_INTERVAL_MS = 3000;

interface MountPanelProps {
  settings: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => void;
  getToken: () => Promise<string | null>;
  isSignedIn: boolean;
  authLoading: boolean;
}

export function MountPanel({ settings, onUpdate, getToken, isSignedIn, authLoading }: MountPanelProps) {
  const apiBaseUrl = String(settings.apiBaseUrl ?? "https://www.bizzicloud.io");
  const [fuseAvailable, setFuseAvailable] = useState<boolean | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [mountPoint, setMountPoint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.bizzi?.mount?.isFuseAvailable().then(setFuseAvailable).catch(() => setFuseAvailable(false));
  }, []);

  const refreshStatus = () =>
    window.bizzi?.mount?.getStatus().then((s) => {
      setIsMounted(s.isMounted);
      setMountPoint(s.mountPoint);
    }).catch(() => {});

  useEffect(() => {
    if (!window.bizzi?.mount) return;
    refreshStatus();
    const interval = window.setInterval(refreshStatus, STATUS_REFRESH_INTERVAL_MS);
    const handleVisibility = () => {
      if (!document.hidden) refreshStatus();
    };
    window.addEventListener("focus", refreshStatus);
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener("focus", refreshStatus);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [fuseAvailable]);

  // Refresh auth token every 50 min when mounted so mount keeps working after Firebase token expires
  useEffect(() => {
    const mount = window.bizzi?.mount;
    if (!mount || !("refreshToken" in mount) || !isMounted || !isSignedIn) return;
    const refresh = async () => {
      try {
        const token = await getToken();
        if (token && typeof mount.refreshToken === "function") {
          await mount.refreshToken(token);
        }
      } catch {
        // ignore; user may have signed out
      }
    };
    const id = setInterval(refresh, TOKEN_REFRESH_INTERVAL_MS);
    return () => clearInterval(id);
  }, [isMounted, isSignedIn, getToken]);

  const handleMountToggle = async () => {
    if (!window.bizzi?.mount) return;
    setLoading(true);
    setError(null);
    try {
      const latestStatus = await window.bizzi.mount.getStatus();
      setIsMounted(latestStatus.isMounted);
      setMountPoint(latestStatus.mountPoint);

      if (latestStatus.isMounted) {
        await window.bizzi.mount.unmount();
      } else {
        const token = await getToken();
        if (!token) {
          setError("Not signed in. Sign in first.");
          return;
        }
        const { mountPoint: point } = await window.bizzi.mount.mount(apiBaseUrl, token);
        setIsMounted(true);
        setMountPoint(point);
      }
      refreshStatus();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      // Sync UI with main process (e.g. if "Already mounted" from stale state, show Unmount)
      refreshStatus();
    } finally {
      setLoading(false);
    }
  };

  const canMount = fuseAvailable === true && isSignedIn && !loading && !authLoading;
  const buttonDisabled = !canMount || (isMounted && loading);

  return (
    <section className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
      <h2 className="flex items-center gap-2 font-medium mb-3">
        <HardDrive className="w-5 h-5 text-bizzi-blue" />
        Mount Drive
      </h2>
      <p className="text-sm text-neutral-400 mb-4">
        Mount Bizzi Cloud as a local volume for use in Premiere Pro, DaVinci Resolve, or Final Cut Pro.
      </p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-neutral-500 mb-1">API Base URL</label>
          <input
            type="url"
            value={apiBaseUrl}
            onChange={(e) => onUpdate("apiBaseUrl", e.target.value)}
            disabled={isMounted}
            className="w-full px-3 py-2 rounded bg-neutral-800 border border-neutral-700 text-sm text-neutral-100 disabled:opacity-60 focus:border-bizzi-blue focus:ring-1 focus:ring-bizzi-blue/30 outline-none transition-colors"
          />
        </div>
        <button
          disabled={buttonDisabled}
          onClick={handleMountToggle}
          className={`w-full py-2 rounded-lg text-sm font-medium transition-colors ${
            canMount
              ? "bg-bizzi-blue hover:bg-bizzi-cyan text-white cursor-pointer"
              : "bg-neutral-700 text-neutral-400 cursor-not-allowed"
          }`}
        >
          {loading ? "Please wait…" : isMounted ? "Unmount" : "Mount"}
        </button>
        {!isSignedIn && !authLoading && (
          <p className="text-xs text-amber-500">
            Sign in to Bizzi Cloud above to mount your drive.
          </p>
        )}
        {fuseAvailable === false && isSignedIn && (
          <p className="text-xs text-amber-500">
            rclone not found. Install from <a href="https://rclone.org/downloads/" target="_blank" rel="noopener noreferrer" className="underline">rclone.org/downloads</a> to use the mount feature.
          </p>
        )}
        {fuseAvailable === true && isSignedIn && !isMounted && (
          <p className="text-xs text-neutral-500">
            Click Mount to create a local volume. Requires rclone.
          </p>
        )}
        {isMounted && mountPoint && (
          <p className="text-xs text-bizzi-cyan">
            Mounted at <code className="bg-neutral-800 px-1 rounded">{mountPoint}</code>
            {mountPoint.startsWith("/Volumes/") ? (
              <span className="block mt-1 text-neutral-400">
                Visible in NLEs under Local Drives. Drag the Bizzi Cloud volume to the Finder sidebar under Locations to keep it visible.
              </span>
            ) : (
              <span className="block mt-1 text-amber-500">
                Add Bizzi Cloud to Full Disk Access (System Settings → Privacy & Security → Full Disk Access) for NLE visibility. Then restart and remount.
              </span>
            )}
          </p>
        )}
        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}
      </div>
    </section>
  );
}
