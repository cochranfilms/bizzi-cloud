/**
 * Mux Video API — create assets from B2 URLs for instant playback.
 * Mux pulls the file from our B2, transcodes, and delivers via HLS.
 */

import {
  FieldValue,
  Timestamp,
  type DocumentData,
  type DocumentSnapshot,
} from "firebase-admin/firestore";

/** Read at call time so env can load after module init (tests, serverless). */
function muxBasicAuthHeader(): string | null {
  const id = process.env.MUX_TOKEN_ID;
  const secret = process.env.MUX_TOKEN_SECRET;
  if (!id || !secret) return null;
  return Buffer.from(`${id}:${secret}`).toString("base64");
}

export function isMuxConfigured(): boolean {
  return muxBasicAuthHeader() !== null;
}

export type MuxDeleteResult =
  | { outcome: "deleted"; httpStatus: 204 }
  | { outcome: "already_missing"; httpStatus: 404 }
  | { outcome: "skipped_not_configured" }
  | {
      outcome: "failed";
      httpStatus?: number;
      message: string;
      retryable: boolean;
      /** For logs only — truncated server snippet when useful */
      logHint?: string;
    };

function muxDeleteRetryableForStatus(status: number): boolean {
  if (status === 429) return true;
  if (status >= 500) return true;
  if (status === 401 || status === 403) return false;
  if (status >= 400 && status !== 404) return false;
  return false;
}

/** Structured Mux DELETE; use from purge pipeline. */
export async function deleteMuxAssetWithResult(assetId: string): Promise<MuxDeleteResult> {
  const basicAuth = muxBasicAuthHeader();
  if (!basicAuth) {
    return { outcome: "skipped_not_configured" };
  }
  try {
    const res = await fetch(`https://api.mux.com/video/v1/assets/${assetId}`, {
      method: "DELETE",
      headers: { Authorization: `Basic ${basicAuth}` },
    });
    if (res.status === 204) return { outcome: "deleted", httpStatus: 204 };
    if (res.status === 404) return { outcome: "already_missing", httpStatus: 404 };

    let logHint: string | undefined;
    try {
      const text = await res.text();
      if (text) logHint = text.length > 500 ? `${text.slice(0, 500)}…` : text;
    } catch {
      /* ignore */
    }
    const message = `Mux DELETE ${res.status}${logHint ? `: ${logHint}` : ""}`;
    return {
      outcome: "failed",
      httpStatus: res.status,
      message,
      retryable: muxDeleteRetryableForStatus(res.status),
      logHint,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return {
      outcome: "failed",
      message: `Mux DELETE network error: ${message}`,
      retryable: true,
    };
  }
}

/** Delete a Mux asset. Stops storage/delivery billing. Originals remain in B2. */
export async function deleteMuxAsset(assetId: string): Promise<boolean> {
  const r = await deleteMuxAssetWithResult(assetId);
  return r.outcome === "deleted" || r.outcome === "already_missing";
}

/** Check if a Mux asset is ready for playback. Returns "ready" | "preparing" | "errored" | null (on error). */
export async function getMuxAssetStatus(assetId: string): Promise<string | null> {
  const basicAuth = muxBasicAuthHeader();
  if (!basicAuth) return null;
  try {
    const res = await fetch(`https://api.mux.com/video/v1/assets/${assetId}`, {
      headers: { Authorization: `Basic ${basicAuth}` },
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { data: { status: string } };
    return data.data?.status ?? null;
  } catch {
    return null;
  }
}

/** Create a Mux asset from an existing file in B2. Requires a presigned download URL. */
export async function createMuxAssetFromUrl(
  sourceUrl: string,
  options?: { passthrough?: string; playbackPolicy?: "public" | "signed" }
): Promise<{
  assetId: string;
  playbackId: string;
  status: string;
}> {
  const basicAuth = muxBasicAuthHeader();
  if (!basicAuth) {
    throw new Error("Mux is not configured (MUX_TOKEN_ID, MUX_TOKEN_SECRET)");
  }

  const body: Record<string, unknown> = {
    input: [{ url: sourceUrl }],
    playback_policy: options?.playbackPolicy ?? "public",
  };
  if (options?.passthrough) {
    body.passthrough = options.passthrough;
  }

  const res = await fetch("https://api.mux.com/video/v1/assets", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Basic ${basicAuth}`,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const errData = (await res.json().catch(() => ({}))) as {
      error?: { message?: string; messages?: string[]; type?: string };
    };
    const err = errData?.error;
    const msg =
      err?.message ??
      (Array.isArray(err?.messages) ? err.messages.join("; ") : null) ??
      `Mux API error: ${res.status}`;
    console.error("[mux create-asset] Mux API error response:", JSON.stringify(errData));
    throw new Error(msg);
  }

  const data = (await res.json()) as {
    data: {
      id: string;
      status: string;
      playback_ids?: Array<{ id: string }>;
    };
  };

  const playbackId =
    data.data.playback_ids?.[0]?.id ??
    (await waitForPlaybackId(data.data.id, basicAuth));

  return {
    assetId: data.data.id,
    playbackId,
    status: data.data.status,
  };
}

async function waitForPlaybackId(
  assetId: string,
  basicAuth: string,
  maxAttempts = 30
): Promise<string> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 1000));
    const res = await fetch(`https://api.mux.com/video/v1/assets/${assetId}`, {
      headers: { Authorization: `Basic ${basicAuth}` },
    });
    if (!res.ok) continue;
    const data = (await res.json()) as {
      data: { playback_ids?: Array<{ id: string }> };
    };
    const id = data.data.playback_ids?.[0]?.id;
    if (id) return id;
  }
  throw new Error("Mux playback ID not ready in time");
}

/** How long a concurrent create-asset request waits for another instance to finish (race from dual extract-metadata). */
const MUX_CLAIM_TTL_MS = 5 * 60 * 1000;
const MUX_FOLLOWER_POLL_MS = 400;
const MUX_FOLLOWER_MAX_WAIT_MS = 120 * 1000;

function snapshotMuxIds(data: DocumentData | undefined): {
  assetId: string;
  playbackId: string;
} | null {
  if (!data) return null;
  const assetId = data.mux_asset_id;
  if (typeof assetId !== "string" || assetId.length === 0) return null;
  const playbackId = data.mux_playback_id;
  return { assetId, playbackId: typeof playbackId === "string" ? playbackId : "" };
}

async function waitForMuxDoc(
  getDoc: () => Promise<DocumentSnapshot>
): Promise<{ assetId: string; playbackId: string } | null> {
  const deadline = Date.now() + MUX_FOLLOWER_MAX_WAIT_MS;
  while (Date.now() < deadline) {
    const snap = await getDoc();
    const ids = snapshotMuxIds(snap.data());
    if (ids) return ids;
    await new Promise((r) => setTimeout(r, MUX_FOLLOWER_POLL_MS));
  }
  return null;
}

/**
 * Create Mux asset from a backup file. Generates presigned B2 URL and submits to Mux.
 * Call this after upload complete for video files.
 *
 * Uses a Firestore claim so concurrent callers (e.g. server extract-metadata + client extract-metadata)
 * cannot each create a separate Mux asset for the same backup_file_id.
 */
export async function createMuxAssetFromBackup(
  objectKey: string,
  fileName: string,
  backupFileId: string
): Promise<{ assetId: string; playbackId: string } | null> {
  if (!isMuxConfigured()) return null;

  const { createPresignedDownloadUrl } = await import("@/lib/b2");
  const { getAdminFirestore } = await import("@/lib/firebase-admin");

  const db = getAdminFirestore();
  const ref = db.collection("backup_files").doc(backupFileId);

  const initial = await ref.get();
  if (!initial.exists) return null;
  const fast = snapshotMuxIds(initial.data());
  if (fast) return fast;

  type TxOutcome =
    | { kind: "missing" }
    | { kind: "done"; assetId: string; playbackId: string }
    | { kind: "leader" }
    | { kind: "follower" };

  const outcome = await db.runTransaction(async (t) => {
    const snap = await t.get(ref);
    if (!snap.exists) return { kind: "missing" } as TxOutcome;
    const d = snap.data()!;
    const done = snapshotMuxIds(d);
    if (done) return { kind: "done", ...done } as TxOutcome;

    const claimAt = d.mux_create_claim_at as Timestamp | undefined;
    const now = Date.now();
    if (claimAt) {
      const age = now - claimAt.toMillis();
      if (age < MUX_CLAIM_TTL_MS) {
        return { kind: "follower" } as TxOutcome;
      }
    }

    t.update(ref, { mux_create_claim_at: FieldValue.serverTimestamp() });
    return { kind: "leader" } as TxOutcome;
  });

  if (outcome.kind === "missing") return null;
  if (outcome.kind === "done") {
    return { assetId: outcome.assetId, playbackId: outcome.playbackId };
  }

  if (outcome.kind === "follower") {
    const waited = await waitForMuxDoc(() => ref.get());
    if (waited) return waited;
    throw new Error("Mux asset creation did not complete in time (concurrent request may have failed)");
  }

  const presignedUrl = await createPresignedDownloadUrl(objectKey, 7200);
  const passthrough = `bf=${backupFileId}`.slice(0, 255);

  try {
    const result = await createMuxAssetFromUrl(presignedUrl, {
      passthrough,
      playbackPolicy: "public",
    });

    const nowIso = new Date().toISOString();
    await ref.update({
      mux_asset_id: result.assetId,
      mux_playback_id: result.playbackId,
      mux_status: result.status,
      mux_created_at: nowIso,
      updated_at: nowIso,
      mux_create_claim_at: FieldValue.delete(),
    });

    return { assetId: result.assetId, playbackId: result.playbackId };
  } catch (err) {
    await ref
      .update({ mux_create_claim_at: FieldValue.delete() })
      .catch(() => {});
    throw err;
  }
}
