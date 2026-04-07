/**
 * Resolve whether backup_files may be packaged into a transfer (reference-first checks).
 */
import type { Firestore } from "firebase-admin/firestore";
import { getAdminAuth } from "@/lib/firebase-admin";
import { resolveEnterpriseAccess } from "@/lib/enterprise-access";
import { logEnterpriseSecurityEvent } from "@/lib/enterprise-security-log";
import { canAccessBackupFileById } from "@/lib/file-access";
import { isBackupFileActiveForListing } from "@/lib/backup-file-lifecycle";

export type PreflightFileState =
  | "ready_existing"
  | "missing"
  | "invalid"
  | "forbidden"
  | "wrong_workspace";

export type PreflightFileResult = {
  backup_file_id: string;
  state: PreflightFileState;
};

export async function preflightTransferBackupFiles(params: {
  db: Firestore;
  uid: string;
  organizationId: string | null;
  backupFileIds: string[];
}): Promise<PreflightFileResult[]> {
  const { db, uid, organizationId, backupFileIds } = params;
  const unique = [...new Set(backupFileIds.map((id) => id.trim()).filter(Boolean))];

  let userEmail: string | undefined;
  try {
    userEmail = (await getAdminAuth().getUser(uid)).email ?? undefined;
  } catch {
    userEmail = undefined;
  }

  const results: PreflightFileResult[] = [];

  for (const bid of unique) {
    const fileSnap = await db.collection("backup_files").doc(bid).get();
    if (!fileSnap.exists) {
      results.push({ backup_file_id: bid, state: "missing" });
      continue;
    }
    const fd = fileSnap.data() as Record<string, unknown>;

    if (!isBackupFileActiveForListing(fd)) {
      results.push({ backup_file_id: bid, state: "invalid" });
      continue;
    }

    if (organizationId) {
      const access = await resolveEnterpriseAccess(uid, organizationId);
      if (!access.canAccessEnterprise) {
        results.push({ backup_file_id: bid, state: "forbidden" });
        continue;
      }
      if ((fd.organization_id as string | undefined) !== organizationId) {
        logEnterpriseSecurityEvent("transfer_org_validation_failed", {
          uid,
          orgId: organizationId,
          fileId: bid,
          reason: "preflight_file_org_mismatch",
        });
        results.push({ backup_file_id: bid, state: "wrong_workspace" });
        continue;
      }
      const allowed = await canAccessBackupFileById(uid, bid, userEmail);
      if (!allowed) {
        logEnterpriseSecurityEvent("transfer_org_validation_failed", {
          uid,
          orgId: organizationId,
          fileId: bid,
          reason: "preflight_no_file_access",
        });
        results.push({ backup_file_id: bid, state: "forbidden" });
        continue;
      }
    } else {
      const allowed = await canAccessBackupFileById(uid, bid, userEmail);
      if (!allowed) {
        results.push({ backup_file_id: bid, state: "forbidden" });
        continue;
      }
    }

    const ingest = fd.ingest_state as string | undefined;
    if (ingest === "registering" || ingest === "failed") {
      results.push({ backup_file_id: bid, state: "invalid" });
      continue;
    }

    results.push({ backup_file_id: bid, state: "ready_existing" });
  }

  return results;
}
