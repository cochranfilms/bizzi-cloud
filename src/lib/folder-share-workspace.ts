/**
 * Workspace-targeted folder_shares: stable keys, recipient mode, access checks.
 */

import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import {
  PERSONAL_TEAM_SEATS_COLLECTION,
  PERSONAL_TEAM_SETTINGS_COLLECTION,
  personalTeamSeatDocId,
} from "@/lib/personal-team-constants";
import { userCanAccessWorkspace } from "@/lib/workspace-access";
import type { WorkspaceShareTargetKind } from "@/types/folder-share";

export type ShareRecipientMode = "email" | "workspace";

export function workspaceTargetKey(kind: WorkspaceShareTargetKind, id: string): string {
  const trimmed = (id ?? "").trim();
  return `${kind}:${trimmed}`;
}

export function parseWorkspaceTargetKey(
  key: string | undefined | null
): { kind: WorkspaceShareTargetKind; id: string } | null {
  if (!key || typeof key !== "string") return null;
  const idx = key.indexOf(":");
  if (idx <= 0) return null;
  const kind = key.slice(0, idx) as WorkspaceShareTargetKind;
  const id = key.slice(idx + 1).trim();
  if (!id) return null;
  if (kind !== "enterprise_workspace" && kind !== "personal_team") return null;
  return { kind, id };
}

/** Legacy docs have no recipient_mode → treat as email. */
export function getRecipientModeFromDoc(data: Record<string, unknown> | undefined): ShareRecipientMode {
  if (data?.recipient_mode === "workspace") return "workspace";
  return "email";
}

export function personalTeamSeatAllowsShareAccess(status: string | undefined): boolean {
  return status === "active" || status === "cold_storage";
}

export async function userCanAccessPersonalTeamTarget(
  uid: string,
  teamOwnerUid: string
): Promise<boolean> {
  if (!teamOwnerUid || !uid) return false;
  if (uid === teamOwnerUid) return true;
  const db = getAdminFirestore();
  const seatSnap = await db
    .collection(PERSONAL_TEAM_SEATS_COLLECTION)
    .doc(personalTeamSeatDocId(teamOwnerUid, uid))
    .get();
  const st = seatSnap.data()?.status as string | undefined;
  return seatSnap.exists && personalTeamSeatAllowsShareAccess(st);
}

export async function userCanAccessWorkspaceShareTarget(
  uid: string,
  kind: WorkspaceShareTargetKind,
  targetId: string
): Promise<boolean> {
  if (kind === "personal_team") {
    return userCanAccessPersonalTeamTarget(uid, targetId);
  }
  return userCanAccessWorkspace(uid, targetId);
}

/**
 * Whether a workspace / personal team exists so a share can be addressed to it.
 * Sharer does not need to be a member (discovery + delivery to that workspace’s inbox).
 */
export async function workspaceShareTargetIsDeliverable(
  kind: WorkspaceShareTargetKind,
  targetId: string
): Promise<boolean> {
  const tid = (targetId ?? "").trim();
  if (!tid) return false;
  const db = getAdminFirestore();
  if (kind === "personal_team") {
    const settings = await db.collection(PERSONAL_TEAM_SETTINGS_COLLECTION).doc(tid).get();
    if (settings.exists) return true;
    try {
      await getAdminAuth().getUser(tid);
      return true;
    } catch {
      return false;
    }
  }
  const ws = await db.collection("workspaces").doc(tid).get();
  if (!ws.exists) return false;
  const deleted = ws.data()?.deleted_at;
  return deleted == null;
}

/** First active org admin email (seat email or Auth email), for workspace-share EmailJS. */
export async function getEnterpriseOrgPrimaryAdminEmail(
  organizationId: string
): Promise<string | null> {
  const db = getAdminFirestore();
  const snap = await db
    .collection("organization_seats")
    .where("organization_id", "==", organizationId)
    .where("role", "==", "admin")
    .where("status", "==", "active")
    .limit(10)
    .get();
  for (const d of snap.docs) {
    const em = (d.data().email as string | undefined)?.trim();
    if (em?.includes("@")) return em.toLowerCase();
  }
  for (const d of snap.docs) {
    const userId = d.data().user_id as string | undefined;
    if (!userId) continue;
    try {
      const rec = await getAdminAuth().getUser(userId);
      if (rec.email?.trim()) return rec.email.trim().toLowerCase();
    } catch {
      /* skip */
    }
  }
  return null;
}
