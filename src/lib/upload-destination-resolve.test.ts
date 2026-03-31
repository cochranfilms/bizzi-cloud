import { describe, it, expect, vi } from "vitest";
import {
  resolveUploadDestination,
  getDropOverlayCopy,
  CREATOR_RAW_UPLOAD_INTENT,
  isCreatorMainRoute,
} from "@/lib/upload-destination-resolve";
import type { LinkedDrive } from "@/types/backup";

const rawDrive = (id: string): LinkedDrive => ({
  id,
  user_id: "u1",
  name: "RAW",
  mount_path: null,
  permission_handle_id: "p1",
  last_synced_at: null,
  created_at: new Date().toISOString(),
  is_creator_raw: true,
  creator_section: true,
});

const storageDrive = (id: string): LinkedDrive => ({
  id,
  user_id: "u1",
  name: "Storage",
  mount_path: null,
  permission_handle_id: "p2",
  last_synced_at: null,
  created_at: new Date().toISOString(),
});

describe("isCreatorMainRoute", () => {
  it("includes dashboard creator but not settings", () => {
    expect(isCreatorMainRoute("/dashboard/creator")).toBe(true);
    expect(isCreatorMainRoute("/dashboard/creator/settings")).toBe(false);
  });
});

describe("resolveUploadDestination", () => {
  it("locks to RAW when creator route and active RAW drive", async () => {
    const drives = [rawDrive("raw-1"), storageDrive("stor-1")];
    const r = await resolveUploadDestination({
      pathname: "/dashboard/creator",
      currentDriveId: "raw-1",
      currentDrivePath: "",
      linkedDrives: drives,
      sourceSurface: "creator_global_drop",
      isEnterpriseFilesNoDrive: false,
      isGalleryMediaDrive: false,
      getOrCreateStorageDrive: async () => ({ id: "stor-1", name: "Storage" }),
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.destinationMode).toBe("creator_raw");
    expect(r.isLocked).toBe(true);
    expect(r.driveId).toBe("raw-1");
    expect(r.uploadIntent).toBe(CREATOR_RAW_UPLOAD_INTENT);
    expect(r.resolvedBy).toBe("active_raw_drive");
  });

  it("uses Storage when creator route but folder list (not RAW)", async () => {
    const drives = [rawDrive("raw-1"), storageDrive("stor-1")];
    const r = await resolveUploadDestination({
      pathname: "/dashboard/creator",
      currentDriveId: null,
      currentDrivePath: "",
      linkedDrives: drives,
      sourceSurface: "topbar_file_upload",
      isEnterpriseFilesNoDrive: false,
      isGalleryMediaDrive: false,
      getOrCreateStorageDrive: vi.fn(async () => ({ id: "stor-1", name: "Storage" })),
    });
    expect(r.success).toBe(true);
    if (!r.success) return;
    expect(r.destinationMode).toBe("storage");
    expect(r.isLocked).toBe(false);
    expect(r.driveId).toBe("stor-1");
  });

  it("fails enterprise files when no drive selected", async () => {
    const r = await resolveUploadDestination({
      pathname: "/enterprise/files",
      searchParams: new URLSearchParams(),
      currentDriveId: null,
      currentDrivePath: "",
      linkedDrives: [],
      sourceSurface: "files_global_drop",
      isEnterpriseFilesNoDrive: true,
      isGalleryMediaDrive: false,
      getOrCreateStorageDrive: async () => ({ id: "x", name: "Storage" }),
    });
    expect(r.success).toBe(false);
    if (r.success) return;
    expect(r.resolvedBy).toBe("enterprise_blocked");
  });
});

describe("getDropOverlayCopy", () => {
  it("uses Creator RAW wording when locked", async () => {
    const r = await resolveUploadDestination({
      pathname: "/dashboard/creator",
      currentDriveId: "raw-1",
      currentDrivePath: "",
      linkedDrives: [rawDrive("raw-1"), storageDrive("s")],
      sourceSurface: "creator_global_drop",
      isEnterpriseFilesNoDrive: false,
      isGalleryMediaDrive: false,
      getOrCreateStorageDrive: async () => ({ id: "s", name: "Storage" }),
    });
    const copy = getDropOverlayCopy(r);
    expect(copy.title).toContain("Creator RAW");
  });
});
