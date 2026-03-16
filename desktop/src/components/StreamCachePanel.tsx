import { Cpu } from "lucide-react";

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
}

interface StreamCachePanelProps {
  cacheBaseDir: string;
  maxBytes: number;
  onUpdate: (key: string, value: unknown) => void;
}

export function StreamCachePanel({
  cacheBaseDir,
  maxBytes,
  onUpdate,
}: StreamCachePanelProps) {
  const usedBytes = 0; // placeholder - would come from StreamCacheManager
  const percent = maxBytes > 0 ? Math.round((usedBytes / maxBytes) * 100) : 0;
  const presets = [
    { label: "500 GB", value: 500 * 1024 ** 3 },
    { label: "250 GB", value: 250 * 1024 ** 3 },
    { label: "100 GB", value: 100 * 1024 ** 3 },
  ];

  return (
    <section className="rounded-lg border border-neutral-700 bg-neutral-900/50 p-4">
      <h2 className="flex items-center gap-2 font-medium mb-3">
        <Cpu className="w-5 h-5 text-bizzi-blue" />
        Stream Cache
      </h2>
      <p className="text-sm text-neutral-400 mb-4">
        Temporary cache for streamed chunks. Uses LRU eviction when full.
      </p>
      <div className="space-y-3">
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-neutral-500">Usage</span>
            <span>{formatBytes(usedBytes)} / {formatBytes(maxBytes)}</span>
          </div>
          <div className="h-2 rounded-full bg-neutral-800 overflow-hidden">
            <div
              className="h-full bg-bizzi-blue transition-all"
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>
        <div>
          <label className="block text-xs text-neutral-500 mb-1">Max size</label>
          <div className="flex gap-2">
            {presets.map((p) => (
              <button
                key={p.label}
                onClick={() => onUpdate("streamCacheMaxBytes", p.value)}
                className={`px-3 py-1.5 rounded text-sm font-medium transition-colors ${
                  maxBytes === p.value
                    ? "bg-bizzi-blue text-white"
                    : "bg-neutral-800 text-neutral-400 hover:bg-neutral-700"
                }`}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
        <p className="text-xs text-neutral-500 truncate" title={cacheBaseDir}>
          Location: {cacheBaseDir || "—"}
        </p>
      </div>
    </section>
  );
}
