import { getAdminFirestore, getAdminAuth, verifyIdToken } from "@/lib/firebase-admin";
import { sendTransferEmailToClient } from "@/lib/emailjs";
import { createTransferNotification } from "@/lib/notification-service";
import { loadTransferFilesForApi } from "@/lib/transfer-resolve";
import { userCanManageTransfer } from "@/lib/transfer-team-access";
import { NextResponse } from "next/server";

/**
 * POST /api/transfers/{slug}/finalize — idempotent publish/finalize (draft/upload flows).
 * Instant transfers already finalize on create; this returns success without duplicate side effects.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ slug: string }> }
) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 });
  }

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const { slug } = await params;
  if (!slug || typeof slug !== "string") {
    return NextResponse.json({ error: "Invalid slug" }, { status: 400 });
  }

  const db = getAdminFirestore();
  const ref = db.collection("transfers").doc(slug);
  const body = await request.json().catch(() => ({}));
  const idempotencyKey =
    typeof body.idempotency_key === "string" && body.idempotency_key.trim()
      ? body.idempotency_key.trim()
      : null;

  const preSnap = await ref.get();
  if (!preSnap.exists) {
    return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
  }
  const preData = preSnap.data()!;
  if (!(await userCanManageTransfer(uid, preData))) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  try {
    const result = await db.runTransaction(async (tx) => {
      const snap = await tx.get(ref);
      if (!snap.exists) {
        return { type: "not_found" as const };
      }
      const data = snap.data()!;

      const lifecycleRaw = data.transfer_lifecycle as string | undefined;
      const notifiedAt = data.notified_at as string | null | undefined;
      const publishedAt = data.published_at as string | undefined;
      const status = (data.status as string) ?? "active";

      const isLegacyPublished =
        lifecycleRaw === undefined && status === "active";
      const isExplicitReady = lifecycleRaw === "ready";

      if (isLegacyPublished || isExplicitReady) {
        return {
          type: "ok" as const,
          idempotent: true,
          transfer_lifecycle: "ready",
          published_at: publishedAt ?? (data.created_at as string) ?? null,
          notified_at: notifiedAt ?? null,
        };
      }

      if (lifecycleRaw === "failed" || lifecycleRaw === "revoked") {
        return { type: "terminal" as const, lifecycle: lifecycleRaw };
      }

      const itemCount =
        typeof data.item_count === "number"
          ? data.item_count
          : ((data.files as unknown[])?.length ?? 0);
      if (
        (lifecycleRaw === "draft" ||
          lifecycleRaw === "uploading" ||
          lifecycleRaw === "finalizing") &&
        itemCount === 0
      ) {
        return { type: "empty" as const };
      }

      const now = new Date().toISOString();
      const prevFinalizeCount =
        typeof data.metrics_finalize_count === "number" ? data.metrics_finalize_count : 0;
      const updates: Record<string, unknown> = {
        transfer_lifecycle: "ready",
        status: "active",
        published_at: publishedAt ?? now,
        updated_at: now,
        metrics_finalize_count: prevFinalizeCount + 1,
      };
      if (idempotencyKey) {
        updates.last_finalize_idempotency_key = idempotencyKey;
      }

      tx.update(ref, updates);

      return {
        type: "finalized" as const,
        shouldNotify: !!(data.clientEmail as string)?.trim?.() && !notifiedAt,
        data,
      };
    });

    if (result.type === "not_found") {
      return NextResponse.json({ error: "Transfer not found" }, { status: 404 });
    }
    if (result.type === "terminal") {
      return NextResponse.json(
        { error: `Transfer is ${result.lifecycle}` },
        { status: 409 }
      );
    }
    if (result.type === "empty") {
      return NextResponse.json(
        { error: "Add at least one file before publishing this transfer" },
        { status: 400 }
      );
    }
    if (result.type === "ok") {
      return NextResponse.json({
        ok: true,
        idempotent: result.idempotent,
        transfer_lifecycle: result.transfer_lifecycle,
        published_at: result.published_at,
        notified_at: result.notified_at,
      });
    }

    const { shouldNotify, data } = result;
    if (shouldNotify && data) {
      const clientEmailRaw = String(data.clientEmail ?? "").trim();
      if (clientEmailRaw) {
        let actorDisplayName = "Someone";
        try {
          const profileSnap = await db.collection("profiles").doc(uid).get();
          actorDisplayName = (profileSnap.data()?.displayName as string)?.trim() || actorDisplayName;
          if (actorDisplayName === "Someone") {
            const authUser = await getAdminAuth().getUser(uid);
            actorDisplayName =
              (authUser.displayName as string)?.trim() ??
              authUser.email?.split("@")[0] ??
              "Someone";
          }
        } catch {
          // keep default
        }
        const fileRows = await loadTransferFilesForApi(db, slug, data as Record<string, unknown>);
        const fileNames = fileRows.map((f) => f.name);
        try {
          await Promise.all([
            sendTransferEmailToClient({
              clientEmail: clientEmailRaw,
              sharedByUserId: uid,
              actorDisplayName,
              transferName: (data.name as string) ?? "Transfer",
              transferSlug: slug,
              fileNames,
            }),
            createTransferNotification({
              clientEmail: clientEmailRaw,
              sharedByUserId: uid,
              actorDisplayName,
              transferSlug: slug,
              transferName: (data.name as string) ?? "Transfer",
              fileCount: fileNames.length,
            }),
          ]);
          await ref.update({
            notified_at: new Date().toISOString(),
          });
        } catch (err) {
          console.error("[transfers finalize] notify:", err);
        }
      }
    }

    return NextResponse.json({
      ok: true,
      idempotent: false,
      transfer_lifecycle: "ready",
    });
  } catch (err) {
    console.error("[transfers finalize]", err);
    return NextResponse.json({ error: "Finalize failed" }, { status: 500 });
  }
}
