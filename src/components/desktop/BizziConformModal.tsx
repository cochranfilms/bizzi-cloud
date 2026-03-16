"use client";

/**
 * Bizzi Conform Modal - V3 Smart Rendition Switching
 *
 * Same logical mounted path resolves to original bytes after conform.
 * No relink. No path change. The mount layer serves full resolution.
 */
import { useCallback, useEffect, useState } from "react";
import { Film, CheckCircle2, XCircle, AlertTriangle, Loader2 } from "lucide-react";
import { Modal } from "@/components/ui/Modal";
import { Button } from "@/components/ui/Button";
import { useAuth } from "@/context/AuthContext";

interface DriveOption {
  id: string;
  name: string;
}

interface PreviewResult {
  totalClips: number;
  readyClips: number;
  missingClips: number;
  invalidClips: number;
}

interface ConformResult {
  sessionId: string;
  status: "completed" | "partial" | "failed";
  totalAssets: number;
  switchedAssets: number;
  failedAssets: number;
  skippedAssets: number;
  report: {
    entries: Array<{
      displayName: string;
      status: string;
      reason: string | null;
    }>;
    summary: { total: number; switched: number; failed: number; skipped: number };
  };
}

interface BizziConformModalProps {
  open: boolean;
  onClose: () => void;
}

export function BizziConformModal({ open, onClose }: BizziConformModalProps) {
  const { user } = useAuth();
  const [drives, setDrives] = useState<DriveOption[]>([]);
  const [selectedDriveId, setSelectedDriveId] = useState<string>("");
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [pinOriginals, setPinOriginals] = useState(false);
  const [keepProxiesCached, setKeepProxiesCached] = useState(true);
  const [conformLoading, setConformLoading] = useState(false);
  const [result, setResult] = useState<ConformResult | null>(null);
  const [revertLoading, setRevertLoading] = useState(false);

  const fetchDrives = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken(true);
    const res = await fetch("/api/conform/drives", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!res.ok) return;
    const data = await res.json();
    setDrives(data.drives ?? []);
    if (data.drives?.length) {
      setSelectedDriveId((prev) => prev || data.drives[0].id);
    }
  }, [user]);

  const fetchPreview = useCallback(async () => {
    if (!user || !selectedDriveId) return;
    setPreviewLoading(true);
    try {
      const token = await user.getIdToken(true);
      const res = await fetch("/api/conform/preview", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ projectId: selectedDriveId }),
      });
      if (!res.ok) throw new Error("Preview failed");
      const data = await res.json();
      setPreview(data);
    } catch {
      setPreview(null);
    } finally {
      setPreviewLoading(false);
    }
  }, [user, selectedDriveId]);

  useEffect(() => {
    if (open && user) fetchDrives();
  }, [open, user, fetchDrives]);

  useEffect(() => {
    if (open && selectedDriveId) fetchPreview();
  }, [open, selectedDriveId, fetchPreview]);

  const handleConform = async () => {
    if (!user || !selectedDriveId) return;
    setConformLoading(true);
    setResult(null);
    try {
      const token = await user.getIdToken(true);
      const res = await fetch("/api/conform/start", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          projectId: selectedDriveId,
          pinOriginals,
          keepProxiesCached,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error ?? "Conform failed");
      setResult(data);
      fetchPreview(); // Refresh counts
    } catch (err) {
      setResult({
        sessionId: "",
        status: "failed",
        totalAssets: 0,
        switchedAssets: 0,
        failedAssets: 0,
        skippedAssets: 0,
        report: {
          entries: [],
          summary: { total: 0, switched: 0, failed: 0, skipped: 0 },
        },
      });
    } finally {
      setConformLoading(false);
    }
  };

  const handleRevert = async () => {
    if (!user || !selectedDriveId) return;
    setRevertLoading(true);
    try {
      const token = await user.getIdToken(true);
      const res = await fetch("/api/conform/revert", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ projectId: selectedDriveId }),
      });
      if (!res.ok) throw new Error("Revert failed");
      setResult(null);
      fetchPreview();
    } catch {
      // Show error
    } finally {
      setRevertLoading(false);
    }
  };

  const reset = () => {
    setResult(null);
  };

  return (
    <Modal
      open={open}
      onClose={() => { reset(); onClose(); }}
      title="Bizzi Conform"
      maxWidth="lg"
      footer={
        result ? (
          <div className="flex justify-between w-full">
            <Button
              variant="secondary"
              onClick={handleRevert}
              disabled={revertLoading}
            >
              {revertLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Revert to Proxies
            </Button>
            <Button onClick={() => { reset(); onClose(); }}>Close</Button>
          </div>
        ) : (
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Cancel
            </Button>
            <Button
              onClick={handleConform}
              disabled={
                conformLoading ||
                !preview ||
                preview.readyClips === 0 ||
                !selectedDriveId
              }
            >
              {conformLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              {conformLoading ? "Conforming…" : "Bizzi Conform"}
            </Button>
          </div>
        )
      }
    >
      <div className="space-y-4">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          V3 rendition switching: the same mounted clip path will resolve to full resolution originals. No relink required.
        </p>

        {/* Drive selector */}
        <div>
          <label className="block text-xs font-medium text-neutral-500 mb-2">
            Project / Drive
          </label>
          <select
            value={selectedDriveId}
            onChange={(e) => setSelectedDriveId(e.target.value)}
            className="w-full px-3 py-2 rounded bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-neutral-700 text-sm"
          >
            {drives.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>

        {/* Preview */}
        {previewLoading ? (
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Validating clips…
          </div>
        ) : preview ? (
          <div className="rounded-lg border border-neutral-200 dark:border-neutral-700 p-4 space-y-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <Film className="w-4 h-4" />
              {preview.totalClips} clips detected
            </div>
            <div className="grid grid-cols-3 gap-2 text-sm">
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400">
                <CheckCircle2 className="w-4 h-4" />
                {preview.readyClips} ready
              </div>
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400">
                <AlertTriangle className="w-4 h-4" />
                {preview.missingClips} missing
              </div>
              <div className="flex items-center gap-2 text-red-500">
                <XCircle className="w-4 h-4" />
                {preview.invalidClips} invalid
              </div>
            </div>
          </div>
        ) : null}

        {/* Options */}
        {!result && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={pinOriginals}
                onChange={(e) => setPinOriginals(e.target.checked)}
              />
              <span className="text-sm">Pin originals before conform</span>
            </label>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={keepProxiesCached}
                onChange={(e) => setKeepProxiesCached(e.target.checked)}
              />
              <span className="text-sm">Keep proxies cached after conform</span>
            </label>
          </div>
        )}

        {/* Result */}
        {result && (
          <div className="rounded-lg border p-4 space-y-3">
            {result.status === "completed" && (
              <div className="flex items-center gap-2 text-emerald-600 dark:text-emerald-400 font-medium">
                <CheckCircle2 className="w-5 h-5" />
                Conform complete
              </div>
            )}
            {result.status === "partial" && (
              <div className="flex items-center gap-2 text-amber-600 dark:text-amber-400 font-medium">
                <AlertTriangle className="w-5 h-5" />
                Partial conform
              </div>
            )}
            {result.status === "failed" && (
              <div className="flex items-center gap-2 text-red-500 font-medium">
                <XCircle className="w-5 h-5" />
                Conform failed
              </div>
            )}
            <div className="text-sm text-neutral-600 dark:text-neutral-400">
              {result.switchedAssets} switched · {result.failedAssets} failed ·{" "}
              {result.skippedAssets} skipped
            </div>
            {result.report.entries.filter((e) => e.status !== "switched").length > 0 && (
              <details className="text-sm">
                <summary className="cursor-pointer">View report</summary>
                <ul className="mt-2 space-y-1 max-h-32 overflow-y-auto">
                  {result.report.entries
                    .filter((e) => e.status !== "switched")
                    .map((e, i) => (
                      <li key={i} className="text-neutral-600 dark:text-neutral-400">
                        {e.displayName}: {e.reason ?? e.status}
                      </li>
                    ))}
                </ul>
              </details>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
