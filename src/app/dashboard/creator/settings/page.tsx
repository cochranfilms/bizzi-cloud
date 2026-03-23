"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { ChevronLeft, Loader2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useBackup } from "@/context/BackupContext";
import TopBar from "@/components/dashboard/TopBar";
import LUTLibrarySection from "@/components/creative-lut/LUTLibrarySection";
import type { CreativeLUTConfig, CreativeLUTLibraryEntry } from "@/types/creative-lut";

export default function CreatorSettingsPage() {
  const { user } = useAuth();
  const { getOrCreateCreatorRawDrive } = useBackup();
  const [driveId, setDriveId] = useState<string | null>(null);
  const [config, setConfig] = useState<CreativeLUTConfig | null>(null);
  const [library, setLibrary] = useState<CreativeLUTLibraryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLUT = useCallback(
    async (driveId: string) => {
      if (!user) return;
      try {
        const token = await user.getIdToken();
        const lutRes = await fetch(`/api/drives/${driveId}/lut`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!lutRes.ok) throw new Error("Failed to load LUT settings");
        const lutData = await lutRes.json();
        setConfig(lutData.creative_lut_config ?? null);
        setLibrary(lutData.creative_lut_library ?? []);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load");
      } finally {
        setLoading(false);
      }
    },
    [user]
  );

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    getOrCreateCreatorRawDrive()
      .then((drive) => {
        if (!cancelled && drive) {
          setDriveId(drive.id);
          fetchLUT(drive.id);
        } else if (!cancelled) {
          setLoading(false);
        }
      })
      .catch(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user, getOrCreateCreatorRawDrive, fetchLUT]);

  if (loading) {
    return (
      <>
        <TopBar title="Creator settings" />
        <main className="flex flex-1 items-center justify-center p-6">
          <Loader2 className="h-10 w-10 animate-spin text-neutral-400" />
        </main>
      </>
    );
  }

  if (error || !driveId) {
    return (
      <>
        <TopBar title="Creator settings" />
        <main className="flex flex-1 p-6">
          <div className="mx-auto max-w-2xl space-y-6">
            <Link
              href="/dashboard/creator"
              className="inline-flex items-center gap-1 text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
            >
              <ChevronLeft className="h-4 w-4" />
              Back to Creator
            </Link>
            <p className="text-sm text-red-600 dark:text-red-400">{error ?? "Creator RAW drive not found. Visit the Creator tab first to create it."}</p>
          </div>
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="Creator settings" />
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <Link
            href="/dashboard/creator"
            className="inline-flex items-center gap-1 text-sm font-medium text-neutral-600 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
          >
            <ChevronLeft className="h-4 w-4" />
            Back to Creator
          </Link>
          <LUTLibrarySection
            driveId={driveId}
            scope="creator_raw_video"
            config={config}
            library={library}
            onRefetch={() => fetchLUT(driveId)}
            getAuthToken={() => user?.getIdToken() ?? Promise.resolve(null)}
            includeBuiltin
          />
        </div>
      </main>
    </>
  );
}
