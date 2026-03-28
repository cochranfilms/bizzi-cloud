import { describe, expect, it } from "vitest";
import { deprecatedStorageFieldsFromSummary } from "./storage-display";
import type { StorageDisplaySummary } from "@/types/storage-display";

const base: Omit<StorageDisplaySummary, "usage_scope" | "breakdown"> = {
  workspace_used_bytes: 0,
  billable_used_bytes: 0,
  reserved_bytes: 0,
  effective_billable_bytes_for_enforcement: 0,
  quota_bytes: 10,
  remaining_bytes: 10,
  quota_owner_type: "user",
  quota_owner_id: "u1",
  show_upgrade_cta: false,
  show_admin_contact_cta: false,
};

describe("deprecatedStorageFieldsFromSummary", () => {
  it("maps personal_dashboard to solo + billable split", () => {
    const s: StorageDisplaySummary = {
      ...base,
      workspace_used_bytes: 100,
      billable_used_bytes: 500,
      usage_scope: "personal_dashboard",
      breakdown: { personal_solo_bytes: 100, hosted_team_container_bytes: 400 },
    };
    expect(deprecatedStorageFieldsFromSummary(s)).toEqual({
      storage_used_bytes: 100,
      storage_used_total_for_quota: 500,
    });
  });

  it("maps enterprise_workspace to billable for both deprecated fields", () => {
    const s: StorageDisplaySummary = {
      ...base,
      workspace_used_bytes: 999,
      billable_used_bytes: 999,
      quota_owner_type: "organization",
      usage_scope: "enterprise_workspace",
      breakdown: {},
    };
    expect(deprecatedStorageFieldsFromSummary(s)).toEqual({
      storage_used_bytes: 999,
      storage_used_total_for_quota: 999,
    });
  });
});
