import { describe, expect, it } from "vitest";
import { StorageQuotaDeniedError } from "./storage-quota-denied-error";
import { storageQuotaErrorJson } from "./storage-quota-http";

const denial = {
  requesting_user_id: "u1",
  billing_subject_user_id: "u1",
  organization_id: null,
  usage_scope: "personal" as const,
  file_used_bytes: 100,
  reserved_bytes: 0,
  effective_billable_bytes_for_enforcement: 900,
  quota_bytes: 800,
  additional_bytes: 100,
};

describe("storageQuotaErrorJson", () => {
  it("returns 403 body for StorageQuotaDeniedError", () => {
    const err = new StorageQuotaDeniedError("Quota exceeded", denial);
    const q = storageQuotaErrorJson(err);
    expect(q).not.toBeNull();
    expect(q!.status).toBe(403);
    expect(q!.body.error).toBe("Quota exceeded");
    expect(q!.body.storage_denial).toEqual(denial);
  });

  it("returns null for other errors", () => {
    expect(storageQuotaErrorJson(new Error("nope"))).toBeNull();
  });
});
