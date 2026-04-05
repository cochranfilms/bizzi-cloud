/**
 * Workspace-targeted folder_shares: stable keys, recipient mode, access checks.
 */

import type { Firestore } from "firebase-admin/firestore";
import { getAdminAuth, getAdminFirestore } from "@/lib/firebase-admin";
import {
  PERSONAL_TEAM_SEATS_COLLECTION,
  PERSONAL_TEAM_SETTINGS_COLLECTION,
  personalTeamSeatDocId,
} from "@/lib/personal-team-constants";
import { userCanAccessWorkspace } from "@/lib/workspace-access";
import type { WorkspaceShareTargetKind } from "@/types/folder-share";
import type { WorkspaceType } from "@/types/workspace";

function scopeLabelForWorkspaceType(t: WorkspaceType): string {
  switch (t) {
    case "org_shared":
      return "Organization";
    case "team":
      return "Team";
    case "project":
      return "Project";
    case "gallery":
      return "Gallery";
    case "private":
      return "Private";
    default:
      return "Workspace";
  }
}

/** Names for workspace-targeted share emails / notifications. */
export async function workspaceDisplayContextForShare(
  db: Firestore,
  kind: WorkspaceShareTargetKind,
  targetId: string
): Promise<{ name: string; scopeLabel: string; organizationId: string | null }> {
  if (kind === "personal_team") {
    const settings = await db.collection(PERSONAL_TEAM_SETTINGS_COLLECTION).doc(targetId).get();
    const custom = (settings.data()?.team_name as string | undefined)?.trim();
    if (custom) return { name: custom, scopeLabel: "Team", organizationId: null };
    try {
      const authUser = await getAdminAuth().getUser(targetId);
      const label = (authUser.displayName?.trim() || authUser.email?.split("@")[0] || "Team").trim();
      return { name: `${label}'s team`, scopeLabel: "Team", organizationId: null };
    } catch {
      return { name: "Team workspace", scopeLabel: "Team", organizationId: null };
    }
  }
  const wsSnap = await db.collection("workspaces").doc(targetId).get();
  if (!wsSnap.exists) {
    return { name: "Workspace", scopeLabel: "Workspace", organizationId: null };
  }
  const ws = wsSnap.data()!;
  const orgId = ws.organization_id as string;
  const wsType = (ws.workspace_type as WorkspaceType) ?? "private";
  if (wsType === "org_shared" && orgId) {
    const orgSnap = await db.collection("organizations").doc(orgId).get();
    const orgName = (orgSnap.data()?.name as string | undefined)?.trim();
    if (orgName) {
      return { name: orgName, scopeLabel: "Org", organizationId: orgId };
    }
  }
  return {
    name: ((ws.name as string) ?? "Workspace").trim() || "Workspace",
    scopeLabel: scopeLabelForWorkspaceType(wsType),
    organizationId: orgId ?? null,
  };
}

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

export type WorkspaceShareDeliveryStatus = "pending" | "approved" | "rejected";

/** Default approved when unset (legacy shares). */
export function getWorkspaceShareDeliveryStatus(
  raw: Record<string, unknown>
): WorkspaceShareDeliveryStatus {
  const s = raw.workspace_delivery_status;
  if (s === "pending" || s === "rejected" || s === "approved") return s;
  return "approved";
}

/**
 * Team owner (personal_team) or org workspace admin seat (enterprise_workspace target id = workspace doc id).
 */
export async function userIsWorkspaceShareTargetAdmin(
  uid: string,
  kind: WorkspaceShareTargetKind,
  targetId: string
): Promise<boolean> {
  if (!uid || !targetId) return false;
  if (kind === "personal_team") {
    return uid === targetId;
  }
  const db = getAdminFirestore();
  const wsSnap = await db.collection("workspaces").doc(targetId).get();
  if (!wsSnap.exists) return false;
  const orgId = wsSnap.data()?.organization_id as string | undefined;
  if (!orgId) return false;
  const seatSnap = await db
    .collection("organization_seats")
    .where("organization_id", "==", orgId)
    .where("user_id", "==", uid)
    .where("status", "==", "active")
    .limit(8)
    .get();
  for (const d of seatSnap.docs) {
    if ((d.data().role as string) === "admin") return true;
  }
  return false;
}

/** Distinct admin emails for workspace-share moderation (all active org admins). */
export async function getEnterpriseOrgAdminEmails(organizationId: string): Promise<string[]> {
  const db = getAdminFirestore();
  const snap = await db
    .collection("organization_seats")
    .where("organization_id", "==", organizationId)
    .where("role", "==", "admin")
    .where("status", "==", "active")
    .limit(50)
    .get();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const d of snap.docs) {
    const em = (d.data().email as string | undefined)?.trim();
    if (em?.includes("@")) {
      const low = em.toLowerCase();
      if (!seen.has(low)) {
        seen.add(low);
        out.push(low);
      }
      continue;
    }
    const userId = d.data().user_id as string | undefined;
    if (!userId) continue;
    try {
      const rec = await getAdminAuth().getUser(userId);
      const e = rec.email?.trim().toLowerCase();
      if (e && !seen.has(e)) {
        seen.add(e);
        out.push(e);
      }
    } catch {
      /* skip */
    }
  }
  return out;
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
