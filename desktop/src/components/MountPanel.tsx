import { useEffect, useState } from "react";
import { HardDrive } from "lucide-react";

interface MountPanelProps {
  settings: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => void;
}

export function MountPanel({ settings, onUpdate }: MountPanelProps) {
  const apiBaseUrl = String(settings.apiBaseUrl ?? "http://localhost:3000");
  const [fuseAvailable, setFuseAvailable] = useState<boolean | null>(null);
  const [isMounted, setIsMounted] = useState(false);
  const [mountPoint, setMountPoint] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    window.bizzi?.mount?.isFuseAvailable().then(setFuseAvailable).catch(() => setFuseAvailable(false));
  }, []);

  useEffect(() => {
    if (!window.bizzi?.mount) return;
    const refresh = () =>
      window.bizzi?.mount?.getStatus().then((s) => {
        setIsMounted(s.isMounted);
        setMountPoint(s.mountPoint);
      });
    refresh();
  }, [fuseAvailable]);

  const handleMountToggle = async () => {
    if (!window.bizzi?.mount) return;
    setLoading(true);
    setError(null);
    try {
      if (isMounted) {
        await window.bizzi.mount.unmount();
        setIsMounted(false);
        setMountPoint(null);
      } else {
        const { mountPoint: point } = await window.bizzi.mount.mount(apiBaseUrl);
        setIsMounted(true);
        setMountPoint(point);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const canMount = fuseAvailable === true && !loading;
  const buttonDisabled = !canMount || (isMounted && loading);

  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <h2 className="flex items-center gap-2 font-medium mb-3">
        <HardDrive className="w-5 h-5 text-zinc-400" />
        Mount Drive
      </h2>
      <p className="text-sm text-zinc-400 mb-4">
        Mount Bizzi Cloud as a local volume for use in Premiere Pro, DaVinci Resolve, or Final Cut Pro.
      </p>
      <div className="space-y-3">
        <div>
          <label className="block text-xs text-zinc-500 mb-1">API Base URL</label>
          <input
            type="url"
            value={apiBaseUrl}
            onChange={(e) => onUpdate("apiBaseUrl", e.target.value)}
            disabled={isMounted}
            className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-sm disabled:opacity-60"
          />
        </div>
        <button
          disabled={buttonDisabled}
          onClick={handleMountToggle}
          className={`w-full py-2 rounded text-sm transition-colors ${
            canMount
              ? "bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
              : "bg-zinc-700 text-zinc-400 cursor-not-allowed"
          }`}
        >
          {loading ? "Please wait…" : isMounted ? "Unmount" : "Mount"}
        </button>
        {fuseAvailable === false && (
          <p className="text-xs text-amber-500">
            Install macFUSE (macOS) or WinFsp (Windows) to enable mounting.
          </p>
        )}
        {fuseAvailable === true && !isMounted && (
          <p className="text-xs text-zinc-500">
            macFUSE / WinFsp detected. Click Mount to create a local volume.
          </p>
        )}
        {isMounted && mountPoint && (
          <p className="text-xs text-emerald-500">
            Mounted at <code className="bg-zinc-800 px-1 rounded">{mountPoint}</code>
          </p>
        )}
        {error && (
          <p className="text-xs text-red-500">{error}</p>
        )}
      </div>
    </section>
  );
}
