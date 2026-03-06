import { HardDrive } from "lucide-react";

interface MountPanelProps {
  settings: Record<string, unknown>;
  onUpdate: (key: string, value: unknown) => void;
}

export function MountPanel({ settings, onUpdate }: MountPanelProps) {
  const apiBaseUrl = String(settings.apiBaseUrl ?? "http://localhost:3000");
  const isMounted = false; // placeholder until FUSE is wired

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
            className="w-full px-3 py-2 rounded bg-zinc-800 border border-zinc-700 text-sm"
          />
        </div>
        <button
          disabled={true}
          className="w-full py-2 rounded bg-zinc-700 text-zinc-400 cursor-not-allowed text-sm"
        >
          {isMounted ? "Unmount" : "Mount (requires macFUSE / WinFsp)"}
        </button>
        <p className="text-xs text-zinc-500">
          Install macFUSE (macOS) or WinFsp (Windows) to enable mounting.
        </p>
      </div>
    </section>
  );
}
