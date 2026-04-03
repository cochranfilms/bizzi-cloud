/**
 * Client call for POST /api/linked-drives/[id]/consolidate-into-storage
 */
export async function consolidateLegacyDriveIntoStorage(
  getIdToken: () => Promise<string>,
  sourceDriveId: string,
  folderName: string,
): Promise<void> {
  const token = await getIdToken();
  const base = typeof window !== "undefined" ? window.location.origin : "";
  const res = await fetch(
    `${base}/api/linked-drives/${encodeURIComponent(sourceDriveId)}/consolidate-into-storage`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ folder_name: folderName.trim() }),
    },
  );
  const data = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) {
    throw new Error(data.error ?? "Consolidation failed");
  }
}
