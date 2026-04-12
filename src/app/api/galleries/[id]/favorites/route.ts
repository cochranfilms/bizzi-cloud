/**
 * Photo proofing lists (user-facing: Favorites). Firestore: favorites_lists with list_type photo_favorites.
 * POST: Create list (client). GET: Lists for gallery.
 *
 * Business status (submitted | archived) is separate from materialization_state — see gallery-proofing-types.
 */
import type { QueryDocumentSnapshot } from "firebase-admin/firestore";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { requesterManagesGallery } from "@/lib/gallery-route-manager";
import { getClientEmailFromCookie } from "@/lib/client-session";
import { verifyGalleryViewAccess } from "@/lib/gallery-access";
import { NextResponse } from "next/server";
import { galleryNotificationRecipientUserId } from "@/lib/gallery-owner-access";
import { createNotification } from "@/lib/notification-service";
import { submitProofingList } from "@/lib/gallery-proofing-submit";
import {
  parseShellContextHeader,
  parseSubmissionSourceHeader,
} from "@/lib/gallery-proofing-types";

/** POST – Create a favorites list (photo gallery only; clients + public access) */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: galleryId } = await params;
  if (!galleryId) return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });

  const body = await request.json().catch(() => ({}));
  const {
    client_email: bodyClientEmail,
    client_name: clientName,
    asset_ids: assetIds,
    title,
  } = body;

  const sessionEmail = getClientEmailFromCookie(request.headers.get("Cookie"));
  const clientEmail = sessionEmail ?? bodyClientEmail;

  if (!Array.isArray(assetIds) || assetIds.length === 0) {
    return NextResponse.json(
      { error: "asset_ids array with at least one ID is required" },
      { status: 400 }
    );
  }

  const authHeader = request.headers.get("Authorization");
  const url = new URL(request.url);
  const password = url.searchParams.get("password") ?? undefined;

  const db = getAdminFirestore();
  const gallerySnap = await db.collection("galleries").doc(galleryId).get();
  if (!gallerySnap.exists) return NextResponse.json({ error: "Gallery not found" }, { status: 404 });

  const g = gallerySnap.data()!;
  if (g.gallery_type === "video") {
    return NextResponse.json(
      {
        error: "use_selects_endpoint",
        message: "This is a video-only gallery — submit selects via POST /api/galleries/{id}/selects",
      },
      { status: 400 }
    );
  }

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

  if (g.allow_favorites === false) {
    return NextResponse.json(
      { error: "favorites_disabled", message: "Favorites are not enabled for this gallery." },
      { status: 403 }
    );
  }

  const validIds = assetIds.filter(
    (id: unknown): id is string => typeof id === "string" && id.length > 0
  );
  const uniqueIds = [...new Set(validIds)];

  const isManager = await requesterManagesGallery(request, g);
  const shellHeader = request.headers.get("X-Bizzi-Shell");
  const srcHeader = request.headers.get("X-Bizzi-Submission-Source");
  const shellContext = parseShellContextHeader(shellHeader);
  const submissionSource =
    parseSubmissionSourceHeader(srcHeader) ??
    (isManager ? "dashboard_proofing" : "public_gallery");
  const createdByRole = isManager ? "photographer" : "client";

  const result = await submitProofingList({
    db,
    galleryId,
    galleryRow: g,
    uniqueIds,
    clientEmail: typeof clientEmail === "string" ? clientEmail.trim() || null : null,
    clientName: typeof clientName === "string" ? clientName.trim() || null : null,
    title: typeof title === "string" ? title : null,
    listType: "photo_favorites",
    shellContext,
    submissionSource,
    createdByRole,
  });

  const notifyUid = galleryNotificationRecipientUserId(g);
  const galleryTitle = (g.title as string) ?? "Gallery";
  const cName = typeof clientName === "string" ? clientName.trim() : "";
  const cEmail = typeof clientEmail === "string" ? clientEmail.trim() : "";
  const label = cName || cEmail || "A client";
  await createNotification({
    recipientUserId: notifyUid,
    actorUserId: notifyUid,
    type: "gallery_favorites_submitted",
    allowSelfActor: true,
    metadata: {
      actorDisplayName: label,
      galleryId,
      galleryTitle,
      clientName: cName || undefined,
      clientEmail: cEmail || undefined,
    },
  }).catch((err) => console.error("[galleries/favorites POST] notification:", err));

  return NextResponse.json({
    id: result.id,
    asset_ids: result.asset_ids,
    created_at: result.created_at,
  });
}

/** GET – List proofing lists. Photographer: active lists (non-archived) unless ?include_archived=1. Client: filter by email. */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: galleryId } = await params;
  if (!galleryId) return NextResponse.json({ error: "Gallery ID required" }, { status: 400 });

  const url = new URL(request.url);
  const clientEmailParam = url.searchParams.get("client_email") ?? undefined;
  const includeArchived = url.searchParams.get("include_archived") === "1";
  const authHeader = request.headers.get("Authorization");
  const password = url.searchParams.get("password") ?? undefined;
  const sessionEmail = getClientEmailFromCookie(request.headers.get("Cookie"));

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
    { authHeader, password, clientEmail: sessionEmail }
  );

  if (!access.allowed) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const isManager = await requesterManagesGallery(request, g);
  if (g.allow_favorites === false && !isManager) {
    return NextResponse.json({ lists: [] });
  }

  const clientEmail = clientEmailParam ?? sessionEmail;
  let snap;
  if (clientEmail) {
    const email = clientEmail.toLowerCase().trim();
    snap = await db
      .collection("favorites_lists")
      .where("gallery_id", "==", galleryId)
      .where("client_email", "==", email)
      .orderBy("created_at", "desc")
      .limit(50)
      .get();
  } else {
    snap = await db
      .collection("favorites_lists")
      .where("gallery_id", "==", galleryId)
      .orderBy("created_at", "desc")
      .limit(50)
      .get();
  }

  const mapDoc = (d: QueryDocumentSnapshot) => {
    const data = d.data();
    return {
      id: d.id,
      gallery_id: data.gallery_id,
      client_email: data.client_email ?? null,
      client_name: data.client_name ?? null,
      asset_ids: data.asset_ids ?? [],
      created_at: data.created_at?.toDate?.()?.toISOString?.() ?? null,
      list_type: data.list_type ?? null,
      title: data.title ?? null,
      status: data.status ?? "submitted",
      materialization_state: data.materialization_state ?? "idle",
      proofing_root_segment: data.proofing_root_segment ?? null,
      folder_slug: data.folder_slug ?? null,
      client_folder_segment: data.client_folder_segment ?? null,
      materialized_relative_prefix: data.materialized_relative_prefix ?? null,
      materialized_linked_drive_id: data.materialized_linked_drive_id ?? null,
      workspace_id: data.workspace_id ?? null,
      visibility_scope: data.visibility_scope ?? null,
      submitted_asset_count: data.submitted_asset_count ?? (data.asset_ids as string[])?.length ?? 0,
      target_asset_count: data.target_asset_count ?? null,
      materialized_asset_count: data.materialized_asset_count ?? 0,
      skipped_asset_count: data.skipped_asset_count ?? 0,
      last_materialization_error: data.last_materialization_error ?? null,
    };
  };

  let lists = snap.docs.map(mapDoc);

  if (g.gallery_type === "photo" || g.gallery_type === "mixed") {
    lists = lists.filter((l) => l.list_type !== "video_selects");
  }

  if (isManager && !includeArchived) {
    lists = lists.filter((l) => l.status !== "archived");
  }

  return NextResponse.json({ lists });
}
