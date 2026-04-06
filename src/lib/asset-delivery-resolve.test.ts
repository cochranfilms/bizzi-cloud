import { describe, it, expect } from "vitest";
import { backupFileProxyReadyInDoc, getCanonicalProxyKey } from "@/lib/asset-delivery-resolve";
import { getProxyObjectKey } from "@/lib/b2";

describe("backupFileProxyReadyInDoc", () => {
  const sourceKey = "content/user/drive/file.mov";
  const expectedProxy = getProxyObjectKey(sourceKey);

  it("returns false when proxy_status is not ready", () => {
    expect(backupFileProxyReadyInDoc({ proxy_status: "processing" }, sourceKey)).toBe(false);
  });

  it("returns false when proxy_size_bytes below minimum", () => {
    expect(
      backupFileProxyReadyInDoc(
        { proxy_status: "ready", proxy_size_bytes: 1000 },
        sourceKey
      )
    ).toBe(false);
  });

  it("returns false when proxy_object_key mismatches canonical", () => {
    expect(
      backupFileProxyReadyInDoc(
        {
          proxy_status: "ready",
          proxy_size_bytes: 200_000,
          proxy_object_key: "proxies/wrong.mp4",
        },
        sourceKey
      )
    ).toBe(false);
  });

  it("returns true when ready with size and matching or empty proxy_object_key", () => {
    expect(
      backupFileProxyReadyInDoc(
        {
          proxy_status: "ready",
          proxy_size_bytes: 200_000,
          proxy_object_key: expectedProxy,
        },
        sourceKey
      )
    ).toBe(true);
    expect(
      backupFileProxyReadyInDoc({ proxy_status: "ready", proxy_size_bytes: 200_000 }, sourceKey)
    ).toBe(true);
  });
});

describe("getCanonicalProxyKey", () => {
  it("matches getProxyObjectKey", () => {
    const k = "content/a/b/c.mp4";
    expect(getCanonicalProxyKey(k)).toBe(getProxyObjectKey(k));
  });
});
