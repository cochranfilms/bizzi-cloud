import { describe, it, expect, vi, beforeEach } from "vitest";
import { applySoftTrashToBackupFilePatches, moveBackupFilesToTrashForGalleryDeletion } from "@/lib/backup-files-trash-domain";
import { backupFileInGalleryTrashScope } from "@/lib/gallery-delete-trash-scope";
import { expandTrashInputIdsWithMacosPackages } from "@/lib/macos-package-trash-expand";
import { BACKUP_LIFECYCLE_ACTIVE, BACKUP_LIFECYCLE_TRASHED } from "@/lib/backup-file-lifecycle";

vi.mock("@/lib/backup-files-trash-audit", () => ({
  logBackupFilesTrashAudit: vi.fn().mockResolvedValue(undefined),
}));

vi.mock("@/lib/macos-package-container-admin", () => ({
  applyMacosPackageDelta: vi.fn().mockResolvedValue(undefined),
  mergeMacosPackageTrashDeltasInto: vi.fn(),
}));

vi.mock("@/lib/macos-package-trash-expand", () => ({
  expandTrashInputIdsWithMacosPackages: vi.fn(),
}));

function createTrashDbMock(files: Record<string, { exists: boolean; data?: Record<string, unknown> }>) {
  const updated = new Set<string>();
  return {
    updated,
    db: {
      batch: () => {
        const ops: { id: string }[] = [];
        return {
          update: (ref: { id: string }) => {
            ops.push({ id: ref.id });
          },
          commit: vi.fn(async () => {
            for (const { id } of ops) updated.add(id);
          }),
        };
      },
      collection: (_n: string) => ({
        doc: (id: string) => {
          const row = files[id];
          return {
            id,
            get: vi.fn(async () =>
              row?.exists
                ? { exists: true, data: () => ({ ...row.data }) }
                : { exists: false }
            ),
          };
        },
      }),
    },
  };
}

describe("applySoftTrashToBackupFilePatches", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    const { mergeMacosPackageTrashDeltasInto } = await import("@/lib/macos-package-container-admin");
    vi.mocked(mergeMacosPackageTrashDeltasInto).mockImplementation(() => {});
  });

  it("patches only active files; skips already trashed (idempotent)", async () => {
    const { db, updated } = createTrashDbMock({
      active: {
        exists: true,
        data: {
          userId: "u1",
          lifecycle_state: BACKUP_LIFECYCLE_ACTIVE,
          deleted_at: null,
        },
      },
      trashed: {
        exists: true,
        data: {
          userId: "u1",
          lifecycle_state: BACKUP_LIFECYCLE_TRASHED,
          deleted_at: new Date(),
        },
      },
    });

    const { patchedCount } = await applySoftTrashToBackupFilePatches(
      db as never,
      "u1",
      ["active", "trashed"],
      "gallery"
    );

    expect(patchedCount).toBe(1);
    expect(updated.has("active")).toBe(true);
    expect(updated.has("trashed")).toBe(false);
  });
});

describe("moveBackupFilesToTrashForGalleryDeletion", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    vi.mocked(expandTrashInputIdsWithMacosPackages).mockImplementation(async (_db, inputIds: string[]) => ({
      ok: true,
      expanded: inputIds,
    }));
    const { mergeMacosPackageTrashDeltasInto } = await import("@/lib/macos-package-container-admin");
    vi.mocked(mergeMacosPackageTrashDeltasInto).mockImplementation(() => {});
  });

  it("mixed active + already trashed: skips trashed, trashes active", async () => {
    const { db, updated } = createTrashDbMock({
      a: {
        exists: true,
        data: { userId: "u1", lifecycle_state: BACKUP_LIFECYCLE_ACTIVE, deleted_at: null },
      },
      b: {
        exists: true,
        data: { userId: "u1", lifecycle_state: BACKUP_LIFECYCLE_TRASHED, deleted_at: new Date() },
      },
    });

    const result = await moveBackupFilesToTrashForGalleryDeletion(
      db as never,
      "u1",
      { photographer_id: "u1" },
      ["a", "b"],
      { maxExpandedIds: 12_000 }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary.skipped.already_trashed).toBe(1);
      expect(result.summary.trashed_count).toBe(1);
      expect(result.summary.skipped_sample.some((s) => s.reason === "already_trashed")).toBe(true);
    }
    expect(updated.has("a")).toBe(true);
    expect(updated.has("b")).toBe(false);
  });

  it("org linked file out of scope: invalid_scope skip, no trash patch, file stays active (API still removes gallery after this step)", async () => {
    const { db, updated } = createTrashDbMock({
      crossOrgFile: {
        exists: true,
        data: {
          userId: "uploader_other",
          organization_id: "org_other",
          lifecycle_state: BACKUP_LIFECYCLE_ACTIVE,
          deleted_at: null,
        },
      },
    });

    const result = await moveBackupFilesToTrashForGalleryDeletion(
      db as never,
      "photo_gallery_owner",
      { photographer_id: "photo_gallery_owner", organization_id: "org_gallery" },
      ["crossOrgFile"],
      { maxExpandedIds: 12_000 }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary.skipped.invalid_scope).toBe(1);
      expect(result.summary.trashed_count).toBe(0);
      expect(result.summary.skipped.missing_doc).toBe(0);
      expect(result.summary.skipped.already_trashed).toBe(0);
      expect(result.summary.skipped_sample).toEqual([
        { id: "crossOrgFile", reason: "invalid_scope" },
      ]);
    }
    expect(updated.size).toBe(0);
  });

  it("personal-team gallery: file scoped to another team is invalid_scope, no patch", async () => {
    const { db, updated } = createTrashDbMock({
      otherTeamFile: {
        exists: true,
        data: {
          userId: "u1",
          personal_team_owner_id: "team_a",
          lifecycle_state: BACKUP_LIFECYCLE_ACTIVE,
          deleted_at: null,
        },
      },
    });

    const result = await moveBackupFilesToTrashForGalleryDeletion(
      db as never,
      "owner_b",
      { photographer_id: "owner_b", personal_team_owner_id: "team_b" },
      ["otherTeamFile"],
      { maxExpandedIds: 12_000 }
    );

    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.summary.skipped.invalid_scope).toBe(1);
      expect(result.summary.trashed_count).toBe(0);
      expect(result.summary.skipped_sample[0]).toEqual({
        id: "otherTeamFile",
        reason: "invalid_scope",
      });
    }
    expect(updated.size).toBe(0);
  });
});

describe("backupFileInGalleryTrashScope solo gallery", () => {
  it("allows file owned by gallery photographer", async () => {
    const ok = await backupFileInGalleryTrashScope("u1", { userId: "u1" } as never, {
      photographer_id: "u1",
    });
    expect(ok).toBe(true);
  });

  it("rejects file owned by different user", async () => {
    const ok = await backupFileInGalleryTrashScope("u1", { userId: "other" } as never, {
      photographer_id: "u1",
    });
    expect(ok).toBe(false);
  });
});
