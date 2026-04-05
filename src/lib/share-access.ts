import { verifyIdToken } from "@/lib/firebase-admin";
import {
  getRecipientModeFromDoc,
  getWorkspaceShareDeliveryStatus,
  parseWorkspaceTargetKey,
  userCanAccessWorkspaceShareTarget,
  userIsWorkspaceShareTargetAdmin,
} from "@/lib/folder-share-workspace";

export type ShareAccessResult =
  | { allowed: true }
  | { allowed: false; code: "private_share_requires_auth"; message: string }
  | { allowed: false; code: "access_denied"; message: string };

export type ShareAccessDoc = {
  owner_id: string;
  access_level?: string;
  invited_emails?: string[];
  recipient_mode?: string;
  workspace_target_key?: string;
  workspace_delivery_status?: string;
};

export function shareFirestoreDataToAccessDoc(data: Record<string, unknown>): ShareAccessDoc {
  return {
    owner_id: data.owner_id as string,
    access_level: data.access_level as string | undefined,
    invited_emails: data.invited_emails as string[] | undefined,
    recipient_mode: data.recipient_mode as string | undefined,
    workspace_target_key: data.workspace_target_key as string | undefined,
    workspace_delivery_status: data.workspace_delivery_status as string | undefined,
  };
}

/**
 * Verify that the visitor has access to a share.
 * - Public shares: anyone can access.
 * - Private shares: owner, invited_emails, or workspace target membership (requires auth).
 */
export async function verifyShareAccess(
  share: ShareAccessDoc,
  authHeader: string | null
): Promise<ShareAccessResult> {
  const accessLevel = share.access_level ?? "public";

  if (accessLevel === "public") {
    return { allowed: true };
  }

  // Private: require auth
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return {
      allowed: false,
      code: "private_share_requires_auth",
      message: "This folder is private. Sign in to access if you have been invited.",
    };
  }

  const token = authHeader.slice(7).trim();
  let uid: string;
  let email: string | undefined;

  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
    email = decoded.email;
  } catch {
    return {
      allowed: false,
      code: "private_share_requires_auth",
      message: "Invalid or expired session. Please sign in again.",
    };
  }

  if (uid === share.owner_id) {
    return { allowed: true };
  }

  const mode = getRecipientModeFromDoc(share as Record<string, unknown>);
  if (mode === "workspace" && share.workspace_target_key) {
    const parsed = parseWorkspaceTargetKey(share.workspace_target_key);
    if (!parsed) {
      return {
        allowed: false,
        code: "access_denied",
        message: "You don't have access to this folder.",
      };
    }
    const delivery = getWorkspaceShareDeliveryStatus(share as Record<string, unknown>);
    if (delivery === "rejected") {
      return {
        allowed: false,
        code: "access_denied",
        message: "This share was not approved for this workspace.",
      };
    }
    if (delivery === "pending") {
      if (await userIsWorkspaceShareTargetAdmin(uid, parsed.kind, parsed.id)) {
        return { allowed: true };
      }
      return {
        allowed: false,
        code: "access_denied",
        message: "This share is pending approval by a workspace admin.",
      };
    }
    if (await userCanAccessWorkspaceShareTarget(uid, parsed.kind, parsed.id)) {
      return { allowed: true };
    }
  }

  const invited = share.invited_emails ?? [];
  const emailLower = email?.toLowerCase();
  if (emailLower && invited.some((e: string) => e.toLowerCase() === emailLower)) {
    return { allowed: true };
  }

  return {
    allowed: false,
    code: "access_denied",
    message: "You don't have access to this folder.",
  };
}
