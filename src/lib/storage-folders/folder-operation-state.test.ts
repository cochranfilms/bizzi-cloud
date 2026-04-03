import { describe, expect, it } from "vitest";
import { assertStorageFolderMutationReady, effectiveStorageFolderOperationState } from "./folder-operation-state";
import { StorageFolderAccessError } from "./linked-drive-access";

describe("effectiveStorageFolderOperationState", () => {
  it("treats ready and missing field as ready", () => {
    expect(effectiveStorageFolderOperationState({ operation_state: "ready" })).toBe("ready");
    expect(effectiveStorageFolderOperationState({})).toBe("ready");
  });

  it("blocks legacy pending_operation", () => {
    expect(
      effectiveStorageFolderOperationState({ pending_operation: "rename" }),
    ).toBe("blocked_legacy");
  });

  it("respects pending operation_state", () => {
    expect(effectiveStorageFolderOperationState({ operation_state: "pending_move" })).toBe(
      "pending_move",
    );
  });
});

describe("assertStorageFolderMutationReady", () => {
  it("throws when not ready", () => {
    expect(() =>
      assertStorageFolderMutationReady({ operation_state: "pending_rename" }),
    ).toThrow(StorageFolderAccessError);
  });

  it("passes when ready", () => {
    assertStorageFolderMutationReady({ operation_state: "ready" });
  });
});
