"use client";

import { useState, useRef } from "react";
import { Loader2 } from "lucide-react";
import { MAX_LUTS_PER_SCOPE, LUT_HELPER_COPY } from "@/types/creative-lut";
import type { CreativeLUTConfig, CreativeLUTLibraryEntry } from "@/types/creative-lut";
import { getBuiltinLUTsForMedia } from "@/lib/creative-lut/builtin-registry";

interface LUTLibrarySectionProps {
  /** Gallery ID for gallery scope */
  galleryId?: string;
  /** Drive ID for Creator RAW scope */
  driveId?: string;
  /** photo_gallery | video_gallery | creator_raw_video */
  scope: "photo_gallery" | "video_gallery" | "creator_raw_video";
  config: CreativeLUTConfig | null;
  library: CreativeLUTLibraryEntry[];
  onRefetch: () => void | Promise<void>;
  getAuthToken: () => Promise<string | null>;
  /** Include builtin LUTs (e.g. Sony Rec 709 for video) */
  includeBuiltin?: boolean;
}

export default function LUTLibrarySection({
  galleryId,
  driveId,
  scope,
  config,
  library,
  onRefetch,
  getAuthToken,
  includeBuiltin = false,
}: LUTLibrarySectionProps) {
  const [enabled, setEnabled] = useState(config?.enabled ?? false);
  const [selectedId, setSelectedId] = useState<string | null>(config?.selected_lut_id ?? null);
  const [uploading, setUploading] = useState(false);
  const [removing, setRemoving] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const id = galleryId ?? driveId;
  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const apiBase = galleryId ? `/api/galleries/${galleryId}/lut` : `/api/drives/${driveId}/lut`;

  const customLibrary = library.filter((e) => e.mode === "custom");
  const customCount = customLibrary.length;
  const canAdd = customCount < MAX_LUTS_PER_SCOPE;
  const builtinOptions = includeBuiltin ? getBuiltinLUTsForMedia("video") : [];
  const allOptions = [
    ...builtinOptions.map((b) => ({ id: b.id, name: b.name, mode: "builtin" as const })),
    ...customLibrary.map((e) => ({ id: e.id, name: e.name, mode: "custom" as const })),
  ];

  const saveConfig = async (opts: { enabled?: boolean; selected_lut_id?: string | null }) => {
    if (!id) return;
    setSaving(true);
    setError(null);
    const nextEnabled = opts.enabled ?? enabled;
    const nextSelected = opts.selected_lut_id !== undefined ? opts.selected_lut_id : selectedId;
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(apiBase, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          enabled: nextEnabled,
          selected_lut_id: nextSelected,
          intensity: 1,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to save");
      }
      setEnabled(nextEnabled);
      setSelectedId(nextSelected);
      await onRefetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleEnabledChange = (v: boolean) => {
    saveConfig({ enabled: v });
  };

  const handleSelectChange = (id: string | null) => {
    saveConfig({ selected_lut_id: id });
  };

  const DIRECT_UPLOAD_THRESHOLD = 4 * 1024 * 1024; // 4 MB — Vercel body limit

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !id || !canAdd) return;
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "cube" && ext !== "3dl") {
      setError("Only .cube or .3dl LUT files are supported for upload.");
      return;
    }
    if (file.size > 20 * 1024 * 1024) {
      setError("LUT file must be under 20 MB.");
      return;
    }
    setUploading(true);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");

      if (file.size > DIRECT_UPLOAD_THRESHOLD) {
        // Direct upload to Firebase Storage (bypasses Vercel 4.5 MB limit)
        const name = file.name.replace(/\.(cube|3dl)$/i, "");
        const urlRes = await fetch(`${apiBase}/upload-url`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ name, extension: ext === "3dl" ? "3dl" : "cube" }),
        });
        if (!urlRes.ok) {
          const data = await urlRes.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to get upload URL");
        }
        const { upload_url, entry_id, storage_path } = (await urlRes.json()) as {
          upload_url: string;
          entry_id: string;
          storage_path: string;
        };
        const putRes = await fetch(upload_url, {
          method: "PUT",
          headers: { "Content-Type": "text/plain" },
          body: file,
        });
        if (!putRes.ok) throw new Error("Upload failed");
        const confirmRes = await fetch(apiBase, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ entry_id, storage_path, name }),
        });
        if (!confirmRes.ok) {
          const data = await confirmRes.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to add LUT");
        }
      } else {
        const formData = new FormData();
        formData.append("lut", file);
        formData.append("name", file.name.replace(/\.(cube|3dl)$/i, ""));
        const res = await fetch(apiBase, {
          method: "POST",
          headers: { Authorization: `Bearer ${token}` },
          body: formData,
        });
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error ?? "Failed to upload");
        }
      }
      await onRefetch();
      if (inputRef.current) inputRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload");
    } finally {
      setUploading(false);
    }
  };

  const handleRemove = async (entryId: string) => {
    if (!id) return;
    setRemoving(entryId);
    setError(null);
    try {
      const token = await getAuthToken();
      if (!token) throw new Error("Not authenticated");
      const res = await fetch(apiBase, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ entry_id: entryId }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to remove");
      }
      if (selectedId === entryId) {
        const remaining = [...builtinOptions.map((b) => b.id), ...customLibrary.filter((e) => e.id !== entryId).map((e) => e.id)];
        handleSelectChange(remaining[0] ?? null);
      }
      await onRefetch();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to remove");
    } finally {
      setRemoving(null);
    }
  };

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">
        Creative LUT
      </h2>
      <div className="space-y-4">
        <label className="flex items-center gap-3">
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => handleEnabledChange(e.target.checked)}
            className="rounded border-neutral-300 text-bizzi-blue focus:ring-bizzi-blue"
          />
          <span className="text-sm text-neutral-700 dark:text-neutral-300">
            Enable LUT preview
          </span>
        </label>
        <p className="text-xs text-neutral-500 dark:text-neutral-400">{LUT_HELPER_COPY}</p>

        {allOptions.length > 0 && (
          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Active LUT
            </label>
            <select
              value={selectedId ?? ""}
              onChange={(e) => handleSelectChange(e.target.value || null)}
              className="w-full max-w-xs rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
            >
              {allOptions.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.name}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="flex flex-wrap items-center gap-2">
          <input
            ref={inputRef}
            type="file"
            accept=".cube,.3dl"
            className="hidden"
            onChange={handleUpload}
            aria-label="Upload LUT"
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={!canAdd || uploading}
            className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            {uploading ? (
              <>
                <Loader2 className="inline h-4 w-4 animate-spin" /> Uploading…
              </>
            ) : (
              "Upload LUT"
            )}
          </button>
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            {customCount} of {MAX_LUTS_PER_SCOPE} installed
          </span>
        </div>

        {customLibrary.length > 0 && (
          <ul className="space-y-2">
            {customLibrary.map((entry) => (
              <li
                key={entry.id}
                className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 dark:border-neutral-700 dark:bg-neutral-800/50"
              >
                <span className="text-sm text-neutral-900 dark:text-white">{entry.name}</span>
                <button
                  type="button"
                  onClick={() => handleRemove(entry.id)}
                  disabled={removing === entry.id}
                  className="rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20"
                >
                  {removing === entry.id ? (
                    <Loader2 className="inline h-4 w-4 animate-spin" />
                  ) : (
                    "Remove"
                  )}
                </button>
              </li>
            ))}
          </ul>
        )}

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      </div>
    </section>
  );
}
