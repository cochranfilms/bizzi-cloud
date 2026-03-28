/**
 * Display-layer storage summaries: workspace vs billable vs reserved vs enforcement.
 * Enforcement / billing subject remains in enterprise-storage (checkUserCanUpload).
 */

import { getAdminFirestore } from "@/lib/firebase-admin";
import { FREE_TIER_STORAGE_BYTES } from "@/lib/plan-constants";
import {
  sumPersonalBackupBytesForQuota,
  sumSoloPersonalBackupBytes,
  sumTeamContainerBackupBytes,
} from "@/lib/enterprise-storage";
import { sumPendingReservationBytes, billingKeyForUser, billingKeyForOrg } from "@/lib/storage-quota-reservations";
import { sumActiveOrgBackupBytesDefault } from "@/lib/backup-file-storage-bytes";
import type { StorageDisplaySummary } from "@/types/storage-display";

function effectiveRemaining(quota: number | null, effective: number): number | null {
  if (quota === null) return null;
  return Math.max(0, quota - effective);
}

export async function getPersonalDashboardStorageDisplay(
  viewerUid: string
): Promise<StorageDisplaySummary> {
  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(viewerUid).get();
  const profileData = profileSnap.data();
  const profileBillingPastDue = profileData?.billing_status === "past_due";
  const profileQuota = profileData?.storage_quota_bytes;
  const quota_bytes = profileBillingPastDue
    ? FREE_TIER_STORAGE_BYTES
    : typeof profileQuota === "number"
      ? profileQuota
      : FREE_TIER_STORAGE_BYTES;

  const personal_solo_bytes = await sumSoloPersonalBackupBytes(viewerUid);
  const billable_used_bytes = await sumPersonalBackupBytesForQuota(viewerUid);
  const hosted_team_container_bytes = Math.max(0, billable_used_bytes - personal_solo_bytes);

  const billingKey = billingKeyForUser(viewerUid);
  const reserved_bytes = await sumPendingReservationBytes(billingKey);
  const effective_billable_bytes_for_enforcement = billable_used_bytes + reserved_bytes;

  return {
    workspace_used_bytes: personal_solo_bytes,
    billable_used_bytes,
    reserved_bytes,
    effective_billable_bytes_for_enforcement,
    quota_bytes,
    remaining_bytes: effectiveRemaining(quota_bytes, effective_billable_bytes_for_enforcement),
    quota_owner_type: "user",
    quota_owner_id: viewerUid,
    usage_scope: "personal_dashboard",
    breakdown: {
      personal_solo_bytes,
      hosted_team_container_bytes,
    },
    show_upgrade_cta: !profileBillingPastDue && quota_bytes !== null,
    show_admin_contact_cta: false,
  };
}

export async function getPersonalTeamWorkspaceStorageSummary(
  ownerUid: string,
  _viewerUid: string
): Promise<StorageDisplaySummary> {
  const db = getAdminFirestore();
  const profileSnap = await db.collection("profiles").doc(ownerUid).get();
  const profileData = profileSnap.data();
  const profileBillingPastDue = profileData?.billing_status === "past_due";
  const profileQuota = profileData?.storage_quota_bytes;
  const quota_bytes = profileBillingPastDue
    ? FREE_TIER_STORAGE_BYTES
    : typeof profileQuota === "number"
      ? profileQuota
      : FREE_TIER_STORAGE_BYTES;

  const team_workspace_bytes = await sumTeamContainerBackupBytes(ownerUid);
  const billable_used_bytes = await sumPersonalBackupBytesForQuota(ownerUid);
  const owner_solo_bytes = await sumSoloPersonalBackupBytes(ownerUid);

  const billingKey = billingKeyForUser(ownerUid);
  const reserved_bytes = await sumPendingReservationBytes(billingKey);
  const effective_billable_bytes_for_enforcement = billable_used_bytes + reserved_bytes;

  return {
    workspace_used_bytes: team_workspace_bytes,
    billable_used_bytes,
    reserved_bytes,
    effective_billable_bytes_for_enforcement,
    quota_bytes,
    remaining_bytes: effectiveRemaining(quota_bytes, effective_billable_bytes_for_enforcement),
    quota_owner_type: "team_owner",
    quota_owner_id: ownerUid,
    usage_scope: "personal_team_workspace",
    breakdown: {
      team_workspace_bytes,
      personal_solo_bytes: owner_solo_bytes,
      hosted_team_container_bytes: team_workspace_bytes,
    },
    show_upgrade_cta: false,
    show_admin_contact_cta: false,
  };
}

export async function getEnterpriseWorkspaceStorageSummary(
  orgId: string,
  _viewerUid: string
): Promise<StorageDisplaySummary> {
  const db = getAdminFirestore();
  const orgSnap = await db.collection("organizations").doc(orgId).get();
  const orgData = orgSnap.data();
  const orgBillingPastDue = orgData?.billing_status === "past_due";
  const quota_bytes = orgBillingPastDue
    ? FREE_TIER_STORAGE_BYTES
    : typeof orgData?.storage_quota_bytes === "number"
      ? orgData.storage_quota_bytes
      : null;

  const billable_used_bytes = await sumActiveOrgBackupBytesDefault(orgId);
  const billingKey = billingKeyForOrg(orgId);
  const reserved_bytes = await sumPendingReservationBytes(billingKey);
  const effective_billable_bytes_for_enforcement = billable_used_bytes + reserved_bytes;

  return {
    workspace_used_bytes: billable_used_bytes,
    billable_used_bytes,
    reserved_bytes,
    effective_billable_bytes_for_enforcement,
    quota_bytes,
    remaining_bytes: effectiveRemaining(quota_bytes, effective_billable_bytes_for_enforcement),
    quota_owner_type: "organization",
    quota_owner_id: orgId,
    usage_scope: "enterprise_workspace",
    breakdown: {},
    show_upgrade_cta: false,
    show_admin_contact_cta: true,
  };
}

/** Maps display summary to deprecated fields for one release. */
export function deprecatedStorageFieldsFromSummary(
  s: StorageDisplaySummary
): { storage_used_bytes: number; storage_used_total_for_quota: number } {
  if (s.usage_scope === "personal_dashboard") {
    return {
      storage_used_bytes: s.workspace_used_bytes,
      storage_used_total_for_quota: s.billable_used_bytes,
    };
  }
  return {
    storage_used_bytes: s.billable_used_bytes,
    storage_used_total_for_quota: s.billable_used_bytes,
  };
}
