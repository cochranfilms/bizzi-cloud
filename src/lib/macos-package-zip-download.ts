"use client";

import { getFirebaseAuth } from "@/lib/firebase/client";

/** Stream full package restore ZIP (e.g. .fcpbundle) to disk via StreamSaver. */
export async function downloadMacosPackageZipStreaming(packageId: string): Promise<void> {
  if (!packageId.startsWith("pkg_")) {
    throw new Error("Invalid package");
  }
  const token = (await getFirebaseAuth().currentUser?.getIdToken(true)) ?? null;
  if (!token) throw new Error("Not authenticated");
  const res = await fetch(`/api/packages/${encodeURIComponent(packageId)}/download-zip`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  if (!res.ok) {
    const data = (await res.json().catch(() => ({}))) as { error?: string };
    throw new Error(data?.error ?? "Package download failed");
  }
  const disposition = res.headers.get("Content-Disposition");
  let filename = "package-restore.zip";
  const m = disposition?.match(/filename="([^"]+)"/);
  if (m) filename = m[1];
  const body = res.body;
  if (!body) throw new Error("No response body");
  const streamSaver = (await import("streamsaver")).default;
  const fileStream = streamSaver.createWriteStream(filename);
  await body.pipeTo(fileStream);
}
