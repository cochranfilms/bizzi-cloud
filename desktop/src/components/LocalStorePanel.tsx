import { FolderDown } from "lucide-react";

export function LocalStorePanel() {
  return (
    <section className="rounded-lg border border-zinc-800 bg-zinc-900/50 p-4">
      <h2 className="flex items-center gap-2 font-medium mb-3">
        <FolderDown className="w-5 h-5 text-zinc-400" />
        Stored Locally
      </h2>
      <p className="text-sm text-zinc-400 mb-4">
        Right-click files in Finder or Explorer and choose &quot;Store Locally for Editing&quot; to keep full copies for offline NLE workflows.
      </p>
      <div className="rounded border border-zinc-700/50 bg-zinc-900 p-4 text-center text-zinc-500 text-sm">
        No files stored locally yet
      </div>
    </section>
  );
}
