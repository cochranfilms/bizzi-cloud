/**
 * Comments API for gallery proofing
 * POST: Add a comment (client)
 * GET: List comments for gallery, optionally by asset_id
 */
import { getAdminFirestore } from "@/lib/firebase-admin";
import { getClientEmailFromCookie } from "@/lib/client-session";
import { verifyGalleryViewAccess } from "@/lib/gallery-access";
import { NextResponse } from "next/server";
import { galleryNotificationRecipientUserId } from "@/lib/gallery-owner-access";
import { createNotification } from "@/lib/notification-service";
import { requesterManagesGallery } from "@/lib/gallery-route-manager";

/** POST – Add comment on an asset */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: galleryId } = await params;
  if (!galleryId) return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const { asset_id: assetId, body: commentBody, client_email: bodyClientEmail, client_name: clientName } = body;

  const sessionEmail = getClientEmailFromCookie(request.headers.get("Cookie"));
  const clientEmail = sessionEmail ?? bodyClientEmail;

  if (!assetId || typeof assetId !== "string") {
    return NextResponse.json({ error: "asset_id is required" }, { status: 400 });
  }
  if (!commentBody || typeof commentBody !== "string" || commentBody.trim().length === 0) {
    return NextResponse.json({ error: "body is required" }, { status: 400 });
  }

  const authHeader = request.headers.get("Authorization");
  const url = new URL(request.url);
  const password = url.searchParams.get("password") ?? undefined;

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
  if (!gallerySnap.exists) return NextResponse.json({ error: "Gallery not found" }, { status: 404 });

  const g = gallerySnap.data()!;
  const access = await verifyGalleryViewAccess(
    {
      photographer_id: g.photographer_id,
      access_mode: g.access_mode ?? "public",
      password_hash: g.password_hash,
      pin_hash: g.pin_hash,
      invited_emails: g.invited_emails ?? [],
      expiration_date: g.expiration_date,
    },
    { authHeader, password, clientEmail }
  );

  if (!access.allowed) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const commentsOff = g.allow_comments === false;
  if (commentsOff) {
    return NextResponse.json(
      { error: "comments_disabled", message: "Comments are not enabled for this gallery." },
      { status: 403 }
    );
  }

  const assetSnap = await db
    .collection("gallery_assets")
    .doc(assetId)
    .get();
  if (!assetSnap.exists || assetSnap.data()?.gallery_id !== galleryId) {
    return NextResponse.json({ error: "Asset not found" }, { status: 404 });
  }

  const now = new Date();
  const ref = await db.collection("asset_comments").add({
    gallery_id: galleryId,
    asset_id: assetId,
    client_email: typeof clientEmail === "string" ? clientEmail.trim() || null : null,
    client_name: typeof clientName === "string" ? clientName.trim() || null : null,
    body: commentBody.trim().slice(0, 2000),
    created_at: now,
  });

  const notifyUid = galleryNotificationRecipientUserId(g);
  const galleryTitle = (g.title as string) ?? "Gallery";
  const cName = typeof clientName === "string" ? clientName.trim() : "";
  const cEmail = typeof clientEmail === "string" ? clientEmail.trim() : "";
  const label = cName || cEmail || "A client";
  await createNotification({
    recipientUserId: notifyUid,
    actorUserId: notifyUid,
    type: "gallery_proofing_comment",
    allowSelfActor: true,
    metadata: {
      actorDisplayName: label,
      galleryId,
      galleryTitle,
      clientName: cName || undefined,
      clientEmail: cEmail || undefined,
    },
  }).catch((err) => console.error("[galleries/comments POST] notification:", err));

  return NextResponse.json({
    id: ref.id,
    asset_id: assetId,
    body: commentBody.trim().slice(0, 2000),
    created_at: now.toISOString(),
  });
}

/** GET – List comments for gallery. Optional ?asset_id= for a single asset. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: galleryId } = await params;
  if (!galleryId) return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });

  const url = new URL(request.url);
  const assetId = url.searchParams.get("asset_id") ?? undefined;
  const authHeader = request.headers.get("Authorization");
  const password = url.searchParams.get("password") ?? undefined;
  const clientEmail = getClientEmailFromCookie(request.headers.get("Cookie"));

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
  if (!gallerySnap.exists) return NextResponse.json({ error: "Gallery not found" }, { status: 404 });

  const g = gallerySnap.data()!;
  const access = await verifyGalleryViewAccess(
    {
      photographer_id: g.photographer_id,
      access_mode: g.access_mode ?? "public",
      password_hash: g.password_hash,
      pin_hash: g.pin_hash,
      invited_emails: g.invited_emails ?? [],
      expiration_date: g.expiration_date,
    },
    { authHeader, password, clientEmail }
  );

  if (!access.allowed) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const isManager = await requesterManagesGallery(request, g);
  if (g.allow_comments === false && !isManager) {
    return NextResponse.json({ comments: [] });
  }

  let snap;
  if (assetId) {
    snap = await db
      .collection("asset_comments")
      .where("gallery_id", "==", galleryId)
      .where("asset_id", "==", assetId)
      .orderBy("created_at", "desc")
      .limit(50)
      .get();
  } else {
    snap = await db
      .collection("asset_comments")
      .where("gallery_id", "==", galleryId)
      .orderBy("created_at", "desc")
      .limit(200)
      .get();
  }

  const comments = snap.docs.map((d) => {
    const data = d.data();
    return {
      id: d.id,
      asset_id: data.asset_id,
      client_email: data.client_email ?? null,
      client_name: data.client_name ?? null,
      body: data.body ?? "",
      created_at: data.created_at?.toDate?.()?.toISOString?.() ?? null,
    };
  });

  return NextResponse.json({ comments });
}
