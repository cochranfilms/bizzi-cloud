"use client";

import { useCallback } from "react";
import { getAuthToken } from "@/lib/auth-token";

/**
 * Returns a function to fetch the video stream URL for backup/storage files.
 * Use with VideoScrubThumbnail for hover scrubbing.
 */
export function useBackupVideoStreamUrl() {
  return useCallback(async (objectKey: string): Promise<string | null> => {
    const token = await getAuthToken(false);
    if (!token) return null;
    const res = await fetch("/api/backup/video-stream-url", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ object_key: objectKey }),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { streamUrl?: string };
    const url = data?.streamUrl;
    if (!url) return null;
    return url.startsWith("/") ? `${window.location.origin}${url}` : url;
  }, []);
}
