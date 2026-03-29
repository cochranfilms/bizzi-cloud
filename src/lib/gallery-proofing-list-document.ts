import type {
  CreatedByRole,
  ProofingListBusinessStatus,
  ProofingListType,
  ProofingRootSegment,
  ShellContext,
  SubmissionSource,
} from "@/lib/gallery-proofing-types";
import { proofingRootSegmentFromGalleryType } from "@/lib/gallery-proofing-types";
import { assignProofingFolderSlug } from "@/lib/gallery-proofing-slug";
import type { MaterializationState } from "@/lib/gallery-proofing-types";

export type AssetSnapshotMinEntry = {
  asset_id: string;
  filename: string;
  media_type: string;
  object_key?: string;
};

/**
 * Build Firestore fields for a new proofing list (favorites_lists doc).
 * `materialized_relative_prefix` and `folder_slug` are immutable after create.
 */
export function buildNewProofingListFields(input: {
  galleryId: string;
  listDocId: string;
  assetIds: string[];
  assetSnapshotMin: AssetSnapshotMinEntry[];
  clientEmail: string | null;
  clientName: string | null;
  /** Derives proofing_root_segment when omitted. */
  galleryType: "photo" | "video" | undefined | null;
  listType: ProofingListType;
  title: string | null | undefined;
  shellContext: ShellContext;
  submissionSource: SubmissionSource;
  createdByRole: CreatedByRole;
  organizationId: string | null;
  personalTeamOwnerId: string | null;
  now: Date;
}): Record<string, unknown> {
  const proofing_root_segment: ProofingRootSegment = proofingRootSegmentFromGalleryType(
    input.galleryType
  );
  const folder_slug = assignProofingFolderSlug({
    title: input.title,
    listDocId: input.listDocId,
    clientName: input.clientName,
  });
  const materialized_relative_prefix = `${input.galleryId}/${proofing_root_segment}/${folder_slug}`;

  const status: ProofingListBusinessStatus = "submitted";
  const materialization_state: MaterializationState = "idle";

  return {
    gallery_id: input.galleryId,
    client_email: input.clientEmail,
    client_name: input.clientName,
    asset_ids: input.assetIds,
    asset_snapshot_min: input.assetSnapshotMin,
    submitted_asset_count: input.assetIds.length,
    title: input.title?.trim() || null,
    list_type: input.listType,
    proofing_root_segment,
    folder_slug,
    materialized_relative_prefix,
    status,
    materialization_state,
    target_asset_count: null,
    materialized_asset_count: 0,
    skipped_asset_count: 0,
    skipped_asset_ids_sample: [],
    materialization_version: 1,
    materialized_linked_drive_id: null,
    materialized_at: null,
    materialized_by_uid: null,
    last_materialization_attempt_at: null,
    last_materialization_error: null,
    workspace_id: null,
    visibility_scope: null,
    shell_context: input.shellContext,
    submission_source: input.submissionSource,
    created_by_role: input.createdByRole,
    organization_id: input.organizationId,
    personal_team_owner_id: input.personalTeamOwnerId ?? null,
    created_at: input.now,
    updated_at: input.now,
  };
}
