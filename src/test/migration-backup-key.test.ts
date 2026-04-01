import { describe, it, expect } from "vitest";
import { buildBackupObjectKey, sanitizeBackupRelativePath } from "@/lib/backup-object-key";

describe("backup-object-key (migration / uploads)", () => {
  it("sanitizeBackupRelativePath strips leading slashes and removes .. segments", () => {
    expect(sanitizeBackupRelativePath("/folder/file.txt")).toBe("folder/file.txt");
    expect(sanitizeBackupRelativePath("../secret/../a/./b")).toBe("/secret//a/./b");
  });

  it("buildBackupObjectKey matches canonical backups layout", () => {
    expect(
      buildBackupObjectKey({
        pathSubjectUid: "user1",
        driveId: "drive9",
        relativePath: "Projects/file.mov",
      })
    ).toBe("backups/user1/drive9/Projects/file.mov");
  });

  it("buildBackupObjectKey uses content addressing when hash provided", () => {
    const h = "a".repeat(64);
    expect(
      buildBackupObjectKey({
        pathSubjectUid: "u",
        driveId: "d",
        relativePath: "ignored",
        contentHash: h,
      })
    ).toBe(`content/${h}`);
  });
});
