import { describe, expect, it } from "vitest";
import { computeMovedSubtreeFolderStates } from "./subtree-sync";

describe("computeMovedSubtreeFolderStates", () => {
  it("recomputes child paths from updated parent state only", () => {
    const movedRootId = "F";
    const computed = computeMovedSubtreeFolderStates({
      movedRootId,
      movedRootName: "F",
      movedRootNewParentId: "T",
      movedRootNewPathIds: ["T"],
      movedRootNewPathNames: ["tname"],
      movedRootNewDepth: 1,
      descendantRows: [
        { id: "C1", parent_folder_id: "F", name: "C1" },
        { id: "C2", parent_folder_id: "C1", name: "C2" },
      ],
    });

    const root = computed.get("F")!;
    expect(root.path_ids).toEqual(["T"]);
    expect(root.path_names).toEqual(["tname"]);
    expect(root.depth).toBe(1);
    expect(root.parent_folder_id).toBe("T");

    const c1 = computed.get("C1")!;
    expect(c1.path_ids).toEqual(["T", "F"]);
    expect(c1.path_names).toEqual(["tname", "F"]);
    expect(c1.depth).toBe(2);

    const c2 = computed.get("C2")!;
    expect(c2.path_ids).toEqual(["T", "F", "C1"]);
    expect(c2.path_names).toEqual(["tname", "F", "C1"]);
    expect(c2.depth).toBe(3);
  });

  it("uses empty path at drive root", () => {
    const computed = computeMovedSubtreeFolderStates({
      movedRootId: "F",
      movedRootName: "F",
      movedRootNewParentId: null,
      movedRootNewPathIds: [],
      movedRootNewPathNames: [],
      movedRootNewDepth: 0,
      descendantRows: [{ id: "C", parent_folder_id: "F", name: "C" }],
    });
    expect(computed.get("F")!.path_ids).toEqual([]);
    expect(computed.get("C")!.path_ids).toEqual(["F"]);
  });
});
