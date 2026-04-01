import type { Firestore } from "firebase-admin/firestore";
import {
  MIGRATION_JOBS_COLLECTION,
  migrationMaxConcurrentJobsPerUser,
  migrationMaxConcurrentJobsPerWorkspace,
  migrationMaxFoldersPerJob,
} from "@/lib/migration-constants";
import type { MigrationJobStatus } from "@/lib/migration-constants";

const ACTIVE: MigrationJobStatus[] = ["queued", "scanning", "ready", "running", "paused"];

export async function assertMigrationJobLimits(
  db: Firestore,
  userId: string,
  workspaceId: string | null,
  folderCount: number
): Promise<{ ok: true } | { ok: false; code: string; message: string; status: number }> {
  if (folderCount > migrationMaxFoldersPerJob()) {
    return {
      ok: false,
      code: "MIGRATION_TOO_MANY_FOLDERS",
      message: `At most ${migrationMaxFoldersPerJob()} source folders per job.`,
      status: 400,
    };
  }

  const userSnap = await db
    .collection(MIGRATION_JOBS_COLLECTION)
    .where("user_id", "==", userId)
    .where("status", "in", ACTIVE.slice(0, 10))
    .limit(25)
    .get();

  let userActive = 0;
  for (const d of userSnap.docs) {
    const st = d.data().status as string;
    if (ACTIVE.includes(st as MigrationJobStatus)) userActive++;
  }
  if (userActive >= migrationMaxConcurrentJobsPerUser()) {
    return {
      ok: false,
      code: "MIGRATION_USER_JOB_LIMIT",
      message: "Maximum concurrent import jobs for your account reached. Wait for one to finish.",
      status: 429,
    };
  }

  if (workspaceId) {
    const wsSnap = await db
      .collection(MIGRATION_JOBS_COLLECTION)
      .where("migration_workspace_id", "==", workspaceId)
      .where("status", "in", ACTIVE.slice(0, 10))
      .limit(25)
      .get();
    let wsActive = 0;
    for (const d of wsSnap.docs) {
      const st = d.data().status as string;
      if (ACTIVE.includes(st as MigrationJobStatus)) wsActive++;
    }
    if (wsActive >= migrationMaxConcurrentJobsPerWorkspace()) {
      return {
        ok: false,
        code: "MIGRATION_WORKSPACE_JOB_LIMIT",
        message: "Maximum concurrent import jobs for this workspace reached.",
        status: 429,
      };
    }
  }

  return { ok: true };
}
