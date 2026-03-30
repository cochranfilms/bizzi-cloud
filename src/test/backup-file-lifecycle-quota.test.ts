import { describe, expect, it } from "vitest";
import {
  BACKUP_LIFECYCLE_DELETE_FAILED,
  BACKUP_LIFECYCLE_PENDING_PERMANENT_DELETE,
  BACKUP_LIFECYCLE_PERMANENTLY_DELETED,
  BACKUP_LIFECYCLE_TRASHED,
  isBackupFileActiveForListing,
  isBackupFileCountedTowardStorageQuota,
  quotaCountedSizeBytesFromBackupFile,
} from "@/lib/backup-file-lifecycle";

describe("quotaCountedSizeBytesFromBackupFile", () => {
  it("counts active row with positive size", () => {
    expect(
      quotaCountedSizeBytesFromBackupFile({
        lifecycle_state: "active",
        size_bytes: 100,
      })
    ).toBe(100);
  });

  it("counts trashed and pending_permanent_delete", () => {
    expect(
      quotaCountedSizeBytesFromBackupFile({
        lifecycle_state: BACKUP_LIFECYCLE_TRASHED,
        size_bytes: 50,
      })
    ).toBe(50);
    expect(
      quotaCountedSizeBytesFromBackupFile({
        lifecycle_state: BACKUP_LIFECYCLE_PENDING_PERMANENT_DELETE,
        size_bytes: 50,
      })
    ).toBe(50);
    expect(
      quotaCountedSizeBytesFromBackupFile({
        lifecycle_state: BACKUP_LIFECYCLE_DELETE_FAILED,
        size_bytes: 50,
      })
    ).toBe(50);
  });

  it("excludes permanently_deleted", () => {
    expect(
      quotaCountedSizeBytesFromBackupFile({
        lifecycle_state: BACKUP_LIFECYCLE_PERMANENTLY_DELETED,
        size_bytes: 99,
      })
    ).toBe(0);
  });

  it("counts unknown lifecycle string with positive bytes (quota fail-safe)", () => {
    expect(
      quotaCountedSizeBytesFromBackupFile({
        lifecycle_state: "garbage",
        size_bytes: 10,
      })
    ).toBe(10);
  });

  it("returns 0 for non-positive or non-finite size_bytes", () => {
    expect(quotaCountedSizeBytesFromBackupFile({ lifecycle_state: "active", size_bytes: 0 })).toBe(0);
    expect(quotaCountedSizeBytesFromBackupFile({ lifecycle_state: "active", size_bytes: -1 })).toBe(0);
    expect(
      quotaCountedSizeBytesFromBackupFile({ lifecycle_state: "active", size_bytes: Number.NaN })
    ).toBe(0);
  });
});

describe("isBackupFileActiveForListing vs quota", () => {
  it("hides unknown lifecycle string from listing but still counts toward quota", () => {
    const row = { lifecycle_state: "oops", size_bytes: 42, deleted_at: null };
    expect(isBackupFileActiveForListing(row)).toBe(false);
    expect(isBackupFileCountedTowardStorageQuota(row)).toBe(true);
    expect(quotaCountedSizeBytesFromBackupFile(row)).toBe(42);
  });
});
