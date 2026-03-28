import type { DocumentData } from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { hashSecret } from "@/lib/gallery-access";
import { slugify, ensureUniqueSlug } from "@/lib/gallery-slug";
import { sendGalleryInviteEmailsToInvitees } from "@/lib/emailjs";
import { createGalleryInviteNotifications } from "@/lib/notification-service";
import {
  DEFAULT_BRANDING,
  DEFAULT_DOWNLOAD_SETTINGS,
  DEFAULT_WATERMARK,
  DEFAULT_VIDEO_GALLERY_SETTINGS,
} from "@/lib/gallery-defaults";
import type { CreateGalleryInput, GalleryAccessMode } from "@/types/gallery";
import {
  legacySourceFormatFromMediaMode,
  normalizeGalleryMediaMode,
  resolveMediaModeFromCreateBody,
} from "@/lib/gallery-media-mode";
import { NextResponse } from "next/server";
import { resolveEnterpriseAccess } from "@/lib/enterprise-access";
import { normalizeVideoDownloadPolicyForStorage } from "@/lib/gallery-video-download-policy";

function isNonOrgGalleryOid(oid: unknown): boolean {
  return oid === null || oid === undefined || oid === "";
}

function galleryDocIsPersonalConsumer(data: DocumentData): boolean {
  if (!isNonOrgGalleryOid(data.organization_id)) return false;
  const pto = data.personal_team_owner_id;
  return !(typeof pto === "string" && pto.trim() !== "");
}

function requireAuth(request: Request): Promise<{ uid: string } | NextResponse> {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return Promise.resolve(
      NextResponse.json({ error: "Missing or invalid Authorization" }, { status: 401 })
    );
  }
  return verifyIdToken(token)
    .then((decoded) => ({ uid: decoded.uid }))
    .catch(() =>
      NextResponse.json({ error: "Invalid or expired token" }, { status: 401 })
    );
}

/** GET /api/galleries – list photographer's galleries
 * Query param ?context=enterprise&organization_id=X – only return org-scoped galleries
 * When context=personal or omitted – only return personal galleries (organization_id null)
 */
export async function GET(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;

  const url = new URL(request.url);
  const context = url.searchParams.get("context") ?? "personal";
  const organizationId = url.searchParams.get("organization_id")?.trim() || null;
  const teamOwnerUserId = url.searchParams.get("team_owner_user_id")?.trim() || null;

  const db = getAdminFirestore();

  let snap;
  if (context === "enterprise" && organizationId) {
    const access = await resolveEnterpriseAccess(uid, organizationId, db);
    if (!access.canAccessEnterprise) {
      return NextResponse.json({ error: "Unauthorized to list this organization's galleries" }, { status: 403 });
    }
    snap = await db
      .collection("galleries")
      .where("photographer_id", "==", uid)
      .where("organization_id", "==", organizationId)
      .orderBy("created_at", "desc")
      .get();
  } else if (context === "personal_team" && teamOwnerUserId) {
    if (uid !== teamOwnerUserId) {
      const seatSnap = await db
        .collection("personal_team_seats")
        .doc(`${teamOwnerUserId}_${uid}`)
        .get();
      const st = seatSnap.data()?.status as string | undefined;
      if (!seatSnap.exists || (st !== "active" && st !== "cold_storage")) {
        return NextResponse.json({ error: "Forbidden" }, { status: 403 });
      }
    }
    const teamSnap = await db
      .collection("galleries")
      .where("personal_team_owner_id", "==", teamOwnerUserId)
      .orderBy("created_at", "desc")
      .get();
    snap = {
      docs: teamSnap.docs.filter((d) => isNonOrgGalleryOid(d.data().organization_id)),
    };
  } else {
    const allSnap = await db
      .collection("galleries")
      .where("photographer_id", "==", uid)
      .orderBy("created_at", "desc")
      .get();
    snap = {
      docs: allSnap.docs.filter((d) => galleryDocIsPersonalConsumer(d.data())),
    };
  }

  const galleryIds = snap.docs.map((d) => d.id);
  let coverMap: Record<string, { object_key: string; name: string }> = {};
  if (galleryIds.length > 0) {
    const byGallery: Record<string, Array<{ id: string; object_key: string; name: string }>> = {};
    for (let i = 0; i < galleryIds.length; i += 10) {
      const batch = galleryIds.slice(i, i + 10);
      const assetsSnap = await db
        .collection("gallery_assets")
        .where("gallery_id", "in", batch)
        .where("is_visible", "==", true)
        .orderBy("sort_order", "asc")
        .get();
      for (const doc of assetsSnap.docs) {
        const d = doc.data();
        const gid = d.gallery_id;
        if (!byGallery[gid]) byGallery[gid] = [];
        byGallery[gid].push({
          id: doc.id,
          object_key: d.object_key,
          name: d.name ?? "",
        });
      }
    }
    for (const d of snap.docs) {
      const data = d.data();
      const coverId = data.cover_asset_id ?? null;
      const assets = byGallery[d.id] ?? [];
      const first = assets[0];
      const coverAsset = coverId ? assets.find((a) => a.id === coverId) : first;
      if (coverAsset?.object_key) coverMap[d.id] = { object_key: coverAsset.object_key, name: coverAsset.name };
    }
  }

  const galleries = snap.docs.map((d) => {
    const data = d.data();
    const cover = coverMap[d.id] ?? null;
    const galleryType = data.gallery_type === "video" ? "video" : "photo";
    const mediaMode = normalizeGalleryMediaMode({
      media_mode: data.media_mode as string | null | undefined,
      source_format: data.source_format as string | null | undefined,
    });
    return {
      id: d.id,
      gallery_type: galleryType,
      media_mode: mediaMode,
      title: data.title,
      slug: data.slug,
      photographer_id: data.photographer_id,
      cover_asset_id: data.cover_asset_id ?? null,
      cover_object_key: cover?.object_key ?? null,
      cover_name: cover?.name ?? null,
      description: data.description ?? null,
      event_date: data.event_date ?? null,
      expiration_date: data.expiration_date ?? null,
      access_mode: data.access_mode ?? "public",
      layout: data.layout ?? "masonry",
      view_count: data.view_count ?? 0,
      unique_visitor_count: data.unique_visitor_count ?? 0,
      favorite_count: data.favorite_count ?? 0,
      download_count: data.download_count ?? 0,
      created_at: data.created_at?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
      updated_at: data.updated_at?.toDate?.()?.toISOString?.() ?? new Date().toISOString(),
    };
  });

  return NextResponse.json({ galleries });
}

/** POST /api/galleries – create gallery */
export async function POST(request: Request) {
  const auth = await requireAuth(request);
  if (auth instanceof NextResponse) return auth;
  const { uid } = auth;

  const body = (await request.json().catch(() => ({}))) as CreateGalleryInput & {
    organization_id?: string | null;
  };
  const {
    organization_id: bodyOrgId,
    personal_team_owner_id: rawPersonalTeamOwnerId,
    gallery_type: rawGalleryType,
    title,
    description,
    event_date,
    expiration_date,
    access_mode = "public",
    password,
    invited_emails,
    layout = "masonry",
    source_format = "jpg",
    media_mode: mediaModeBody,
    branding,
    download_settings,
    watermark,
    // Video gallery specific
    delivery_mode,
    download_policy,
    allow_comments,
    allow_favorites,
    allow_timestamp_comments,
    allow_original_downloads,
    allow_proxy_downloads,
    invoice_mode,
    invoice_url,
    invoice_label,
    invoice_status,
    invoice_required_for_download,
    featured_video_asset_id,
    client_review_instructions,
    workflow_status,
  } = body;

  const galleryType = rawGalleryType === "video" ? "video" : "photo";

  const resolvedMediaMode = resolveMediaModeFromCreateBody({
    media_mode: mediaModeBody ?? null,
    source_format: source_format as string | null,
  });
  const legacySource = legacySourceFormatFromMediaMode(resolvedMediaMode);

  if (!title || typeof title !== "string" || title.trim().length === 0) {
    return NextResponse.json(
      { error: "title is required" },
      { status: 400 }
    );
  }

  const db = getAdminFirestore();
  const organizationId =
    typeof bodyOrgId === "string" && bodyOrgId.trim()
      ? bodyOrgId.trim()
      : null;
  if (organizationId) {
    const access = await resolveEnterpriseAccess(uid, organizationId, db);
    if (!access.canAccessEnterprise) {
      return NextResponse.json({ error: "Unauthorized to create gallery for this organization" }, { status: 403 });
    }
  }

  let personalTeamOwnerId: string | null = null;
  if (rawPersonalTeamOwnerId != null && typeof rawPersonalTeamOwnerId === "string") {
    const pto = rawPersonalTeamOwnerId.trim();
    if (pto) {
      if (organizationId) {
        return NextResponse.json(
          { error: "Team-scoped galleries cannot use an organization" },
          { status: 400 }
        );
      }
      personalTeamOwnerId = pto;
      if (uid !== pto) {
        const seatSnap = await db.collection("personal_team_seats").doc(`${pto}_${uid}`).get();
        const st = seatSnap.data()?.status as string | undefined;
        if (!seatSnap.exists || (st !== "active" && st !== "cold_storage")) {
          return NextResponse.json({ error: "Forbidden" }, { status: 403 });
        }
      }
    }
  }

  const baseSlug = slugify(title.trim());
  const slug = await ensureUniqueSlug(db, uid, baseSlug);

  let passwordHash: string | null = null;

  if (access_mode === "password" && password && typeof password === "string") {
    passwordHash = await hashSecret(password);
  }

  const now = new Date();
  const baseGalleryData = {
    ...(organizationId ? { organization_id: organizationId } : { organization_id: null }),
    personal_team_owner_id: personalTeamOwnerId,
    gallery_type: galleryType,
    title: title.trim(),
    slug,
    photographer_id: uid,
    cover_asset_id: null,
    description: description?.trim() ?? null,
    event_date: event_date ?? null,
    expiration_date: expiration_date ?? null,
    password_hash: passwordHash,
    pin_hash: null,
    access_mode: access_mode as GalleryAccessMode,
    invited_emails: Array.isArray(invited_emails)
      ? invited_emails
          .filter((e): e is string => typeof e === "string")
          .map((e) => e.trim().toLowerCase())
          .filter(Boolean)
      : [],
    branding: { ...DEFAULT_BRANDING, ...branding },
    layout,
    media_mode: resolvedMediaMode,
    source_format: legacySource,
    download_settings: { ...DEFAULT_DOWNLOAD_SETTINGS, ...download_settings },
    watermark: { ...DEFAULT_WATERMARK, ...watermark },
    view_count: 0,
    unique_visitor_count: 0,
    favorite_count: 0,
    download_count: 0,
    created_at: now,
    updated_at: now,
  };

  const normalizedVideoDownloadPolicy = normalizeVideoDownloadPolicyForStorage(
    typeof download_policy === "string" ? download_policy : undefined
  );

  const videoSettings =
    galleryType === "video"
      ? {
          ...DEFAULT_VIDEO_GALLERY_SETTINGS,
          delivery_mode: delivery_mode ?? DEFAULT_VIDEO_GALLERY_SETTINGS.delivery_mode,
          download_policy: normalizedVideoDownloadPolicy,
          allow_comments: allow_comments ?? DEFAULT_VIDEO_GALLERY_SETTINGS.allow_comments,
          allow_favorites: allow_favorites ?? DEFAULT_VIDEO_GALLERY_SETTINGS.allow_favorites,
          allow_timestamp_comments: allow_timestamp_comments ?? DEFAULT_VIDEO_GALLERY_SETTINGS.allow_timestamp_comments,
          allow_original_downloads: allow_original_downloads ?? DEFAULT_VIDEO_GALLERY_SETTINGS.allow_original_downloads,
          allow_proxy_downloads: allow_proxy_downloads ?? DEFAULT_VIDEO_GALLERY_SETTINGS.allow_proxy_downloads,
          invoice_mode: invoice_mode ?? DEFAULT_VIDEO_GALLERY_SETTINGS.invoice_mode,
          invoice_url: invoice_url ?? DEFAULT_VIDEO_GALLERY_SETTINGS.invoice_url,
          invoice_label: invoice_label ?? DEFAULT_VIDEO_GALLERY_SETTINGS.invoice_label,
          invoice_status: invoice_status ?? DEFAULT_VIDEO_GALLERY_SETTINGS.invoice_status,
          invoice_required_for_download: invoice_required_for_download ?? DEFAULT_VIDEO_GALLERY_SETTINGS.invoice_required_for_download,
          featured_video_asset_id: featured_video_asset_id ?? null,
          client_review_instructions: client_review_instructions ?? null,
          workflow_status: workflow_status ?? DEFAULT_VIDEO_GALLERY_SETTINGS.workflow_status,
        }
      : {};

  const photoInvoiceSettings =
    galleryType === "photo"
      ? {
          invoice_mode: invoice_mode ?? null,
          invoice_url: invoice_url ?? null,
          invoice_label: invoice_label ?? null,
          invoice_status: invoice_status ?? "none",
          invoice_required_for_download: invoice_required_for_download === true,
        }
      : {};

  const galleryData = { ...baseGalleryData, ...videoSettings, ...photoInvoiceSettings };

  const ref = await db.collection("galleries").add(galleryData);

  // Send invite emails when access is invite_only and there are invited emails
  const invitedList = Array.isArray(invited_emails)
    ? invited_emails
        .filter((e): e is string => typeof e === "string")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean)
    : [];
  if (
    access_mode === "invite_only" &&
    invitedList.length > 0
  ) {
    let photographerDisplayName = "A photographer";
    try {
      const authUser = await getAdminAuth().getUser(uid);
      photographerDisplayName =
        authUser.displayName || authUser.email || photographerDisplayName;
    } catch {
      // keep fallback
    }
    sendGalleryInviteEmailsToInvitees({
      invitedEmails: invitedList,
      photographerUserId: uid,
      photographerDisplayName,
      galleryTitle: title.trim(),
      galleryId: ref.id,
      eventDate: event_date ?? null,
    }).catch((err) => {
      console.error("[galleries] Gallery invite email error:", err);
    });
    createGalleryInviteNotifications({
      photographerUserId: uid,
      photographerDisplayName,
      galleryId: ref.id,
      galleryTitle: title.trim(),
      invitedEmails: invitedList,
    }).catch((err) => {
      console.error("[galleries] Gallery invite notification error:", err);
    });
  }

  return NextResponse.json({
    id: ref.id,
    gallery_url: `/g/${ref.id}`,
    ...galleryData,
    created_at: now.toISOString(),
    updated_at: now.toISOString(),
  });
}
