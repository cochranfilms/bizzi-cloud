import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { buildNewProofingListFields } from "@/lib/gallery-proofing-list-document";
import { buildAssetSnapshotMin } from "@/lib/gallery-proofing-build-snapshot";
import type { CreatedByRole, ProofingListType, ShellContext, SubmissionSource } from "@/lib/gallery-proofing-types";
import { resolveMediaFolderSegmentForPath } from "@/lib/gallery-media-path";
import { allocateClientFolderSegment } from "@/lib/gallery-media-folder-admin";

function normOrgId(raw: unknown): string | null {
  if (raw == null || raw === "") return null;
  const s = String(raw).trim();
  return s || null;
}

function normPto(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const s = raw.trim();
  return s || null;
}

export async function submitProofingList(params: {
  db: Firestore;
  galleryId: string;
  galleryRow: Record<string, unknown>;
  uniqueIds: string[];
  clientEmail: string | null;
  clientName: string | null;
  title?: string | null;
  listType: ProofingListType;
  shellContext: ShellContext;
  submissionSource: SubmissionSource;
  createdByRole: CreatedByRole;
}): Promise<{ id: string; asset_ids: string[]; created_at: string }> {
  const {
    db,
    galleryId,
    galleryRow,
    uniqueIds,
    clientEmail,
    clientName,
    title,
    listType,
    shellContext,
    submissionSource,
    createdByRole,
  } = params;

  const docRef = db.collection("favorites_lists").doc();
  const mediaFolderSegment = resolveMediaFolderSegmentForPath(
    { ...galleryRow, id: galleryId },
    galleryId
  );
  const clientFolderSegment = await allocateClientFolderSegment(
    db,
    galleryId,
    docRef.id,
    listType,
    clientName
  );

  const assetSnapshotMin = await buildAssetSnapshotMin(db, galleryId, uniqueIds);
  const galleryType = galleryRow.gallery_type === "video" ? "video" : "photo";
  const now = new Date();
  const organizationId = normOrgId(galleryRow.organization_id);
  const personalTeamOwnerId = normPto(galleryRow.personal_team_owner_id);

  const fields = buildNewProofingListFields({
    galleryId,
    listDocId: docRef.id,
    assetIds: uniqueIds,
    assetSnapshotMin,
    clientEmail,
    clientName,
    mediaFolderSegment,
    clientFolderSegment,
    galleryType,
    listType,
    title: title ?? null,
    shellContext,
    submissionSource,
    createdByRole,
    organizationId,
    personalTeamOwnerId,
    now,
  });

  await docRef.set(fields);

  const incPhoto = listType === "photo_favorites";
  const updates: Record<string, unknown> = { updated_at: now };
  if (incPhoto) {
    updates.favorite_submission_count = FieldValue.increment(1);
    updates.favorite_asset_total_submitted = FieldValue.increment(uniqueIds.length);
    updates.favorite_count = FieldValue.increment(uniqueIds.length);
  } else {
    updates.select_submission_count = FieldValue.increment(1);
    updates.select_asset_total_submitted = FieldValue.increment(uniqueIds.length);
  }
  await db.collection("galleries").doc(galleryId).update(updates);

  return {
    id: docRef.id,
    asset_ids: uniqueIds,
    created_at: now.toISOString(),
  };
}
