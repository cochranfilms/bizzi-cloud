import type { Firestore } from "firebase-admin/firestore";
import { BACKUP_LIFECYCLE_ACTIVE } from "@/lib/backup-file-lifecycle";
import type { MigrationDuplicateMode } from "@/lib/migration-constants";

export type DuplicateResolveResult =
  | { action: "write"; relative_path: string }
  | { action: "skip" };

/**
 * Phase 1: skip or rename only (no overwrite).
 */
export async function resolveMigrationDuplicatePath(
  db: Firestore,
  driveId: string,
  desiredRelativePath: string,
  mode: MigrationDuplicateMode
): Promise<DuplicateResolveResult> {
  const normalized = desiredRelativePath.replace(/^\/+/, "").replace(/\.\./g, "");

  async function exists(path: string): Promise<boolean> {
    const snap = await db
      .collection("backup_files")
      .where("linked_drive_id", "==", driveId)
      .where("relative_path", "==", path)
      .where("lifecycle_state", "==", BACKUP_LIFECYCLE_ACTIVE)
      .limit(1)
      .get();
    return !snap.empty;
  }

  if (!(await exists(normalized))) {
    return { action: "write", relative_path: normalized };
  }

  if (mode === "skip") {
    return { action: "skip" };
  }

  const dot = normalized.lastIndexOf(".");
  const base = dot > 0 ? normalized.slice(0, dot) : normalized;
  const ext = dot > 0 ? normalized.slice(dot) : "";
  for (let i = 1; i < 10_000; i++) {
    const candidate = `${base} (${i})${ext}`;
    if (!(await exists(candidate))) {
      return { action: "write", relative_path: candidate };
    }
  }
  return { action: "skip" };
}
