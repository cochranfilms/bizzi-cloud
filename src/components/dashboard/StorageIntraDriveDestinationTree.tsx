"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ChevronRight, Folder } from "lucide-react";
import {
  fetchStorageFolderList,
  type StorageFolderListFolder,
} from "@/hooks/useCloudFiles";
import { isFolderSelectableDestination } from "@/lib/storage-folders/folder-picker-destination";

type TreeNode = {
  id: string | null;
  name: string;
  depth: number;
  loaded: boolean;
  children: TreeNode[];
};

function emptyRoot(driveLabel: string): TreeNode {
  return {
    id: null,
    name: driveLabel,
    depth: 0,
    loaded: false,
    children: [],
  };
}

function findNodeByPath(root: TreeNode, nodePathFromRoot: string): TreeNode | null {
  if (!nodePathFromRoot) return root;
  let cur = root;
  for (const id of nodePathFromRoot.split("/").filter(Boolean)) {
    const next = cur.children.find((c) => c.id === id);
    if (!next) return null;
    cur = next;
  }
  return cur;
}

function cloneTree(node: TreeNode): TreeNode {
  return {
    ...node,
    children: node.children.map(cloneTree),
  };
}

export type StorageIntraDriveDestinationTreeProps = {
  linkedDriveId: string;
  driveLabel: string;
  /** `undefined` = none chosen; `null` = drive root (Main storage) */
  selectedParentId: string | null | undefined;
  onSelectParent: (id: string | null) => void;
  excludedFolderIds: string[];
  knownDescendantIds?: string[];
  /** When set, destination equal to this parent (including `null` for root) is not selectable */
  currentParentFolderId?: string | null;
  disabled?: boolean;
  /** Load root children on mount so folders appear without extra clicks */
  preloadRootChildren?: boolean;
  /** Optional: label for the drive root row (default: "Main storage") */
  rootLabel?: string;
  className?: string;
  /** Classes for the scrollable folder list (border, max-height, etc.) */
  listClassName?: string;
};

export default function StorageIntraDriveDestinationTree({
  linkedDriveId,
  driveLabel,
  selectedParentId,
  onSelectParent,
  excludedFolderIds,
  knownDescendantIds,
  currentParentFolderId,
  disabled = false,
  preloadRootChildren = true,
  rootLabel = "Main storage",
  className = "",
  listClassName,
}: StorageIntraDriveDestinationTreeProps) {
  const [root, setRoot] = useState<TreeNode>(() => emptyRoot(driveLabel));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["__root__"]));
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(() => new Set());
  const [listError, setListError] = useState<string | null>(null);

  const excludeSet = useMemo(() => new Set(excludedFolderIds), [excludedFolderIds]);
  const descSet = useMemo(
    () =>
      knownDescendantIds && knownDescendantIds.length > 0
        ? new Set(knownDescendantIds)
        : undefined,
    [knownDescendantIds]
  );

  const loadChildren = useCallback(
    async (parentFolderId: string | null, nodePathFromRoot: string) => {
      const loadKey = parentFolderId === null ? "__root__" : parentFolderId;
      setLoadingKeys((s) => new Set(s).add(loadKey));
      try {
        const { folders, listError: err } = await fetchStorageFolderList(
          linkedDriveId,
          parentFolderId,
          driveLabel
        );
        if (err) {
          setListError(err);
          return;
        }
        setListError(null);
        const depth = nodePathFromRoot.split("/").filter(Boolean).length + 1;
        const childNodes: TreeNode[] = folders.map((f: StorageFolderListFolder) => ({
          id: f.id,
          name: f.name,
          depth,
          loaded: false,
          children: [],
        }));
        setRoot((r) => {
          const next = cloneTree(r);
          const target = findNodeByPath(next, nodePathFromRoot);
          if (target) {
            target.children = childNodes;
            target.loaded = true;
          }
          return next;
        });
      } finally {
        setLoadingKeys((s) => {
          const n = new Set(s);
          n.delete(loadKey);
          return n;
        });
      }
    },
    [linkedDriveId, driveLabel]
  );

  useEffect(() => {
    setRoot({ ...emptyRoot(driveLabel), name: rootLabel });
    setExpanded(new Set(["__root__"]));
    setListError(null);
    setLoadingKeys(new Set());
  }, [linkedDriveId, driveLabel, rootLabel]);

  useEffect(() => {
    if (!preloadRootChildren || !linkedDriveId) return;
    void loadChildren(null, "");
  }, [preloadRootChildren, linkedDriveId, loadChildren]);

  const rowSelectable = useCallback(
    (candidateFolderId: string | null) => {
      if (disabled) return false;
      if (
        currentParentFolderId !== undefined &&
        candidateFolderId === currentParentFolderId
      ) {
        return false;
      }
      return isFolderSelectableDestination({
        candidateFolderId,
        excludedFolderIds: excludeSet,
        knownDescendantIds: descSet,
      });
    },
    [disabled, currentParentFolderId, excludeSet, descSet]
  );

  return (
    <div className={className}>
      {listError ? (
        <p className="mb-2 text-sm text-red-500 dark:text-red-400">{listError}</p>
      ) : null}
      <ul
        className={
          listClassName ??
          "max-h-[min(50vh,16rem)] space-y-0.5 overflow-y-auto rounded-lg border border-neutral-200 bg-neutral-50/80 p-2 text-sm dark:border-neutral-600 dark:bg-neutral-800/50"
        }
      >
        <TreeRows
          node={root}
          nodePathFromRoot=""
          displayRootName={rootLabel}
          expanded={expanded}
          loadingKeys={loadingKeys}
          rowSelectable={rowSelectable}
          selectedParentId={selectedParentId}
          onToggleExpand={async (node, nodePathFromRoot) => {
            const expKey = node.id === null ? "__root__" : node.id;
            if (!expanded.has(expKey)) {
              setExpanded((e) => new Set(e).add(expKey));
              if (!node.loaded) {
                await loadChildren(node.id, nodePathFromRoot);
              }
            } else {
              setExpanded((e) => {
                const n = new Set(e);
                n.delete(expKey);
                return n;
              });
            }
          }}
          onSelectParent={onSelectParent}
        />
      </ul>
    </div>
  );
}

function TreeRows({
  node,
  nodePathFromRoot,
  displayRootName,
  expanded,
  loadingKeys,
  rowSelectable,
  selectedParentId,
  onToggleExpand,
  onSelectParent,
}: {
  node: TreeNode;
  nodePathFromRoot: string;
  displayRootName: string;
  expanded: Set<string>;
  loadingKeys: Set<string>;
  rowSelectable: (candidateFolderId: string | null) => boolean;
  selectedParentId: string | null | undefined;
  onToggleExpand: (node: TreeNode, nodePathFromRoot: string) => void | Promise<void>;
  onSelectParent: (id: string | null) => void;
}) {
  const expKey = node.id === null ? "__root__" : node.id;
  const isExpanded = expanded.has(expKey);
  const loadKey = node.id === null ? "__root__" : node.id;
  const loading = loadingKeys.has(loadKey);
  const selectable = rowSelectable(node.id);
  const isSelected =
    selectable &&
    (node.id === null ? selectedParentId === null : selectedParentId === node.id);
  const rowLabel = node.id === null ? displayRootName : node.name;

  return (
    <li className="list-none">
      <div
        className={`flex items-center gap-1 rounded-md py-1 ${selectable ? "" : "opacity-50"}`}
        style={{ paddingLeft: node.depth * 12 }}
      >
        <button
          type="button"
          aria-label={isExpanded ? "Collapse" : "Expand"}
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
          onClick={() => void onToggleExpand(node, nodePathFromRoot)}
        >
          <ChevronRight
            className={`h-4 w-4 transition-transform ${isExpanded ? "rotate-90" : ""}`}
          />
        </button>
        <button
          type="button"
          disabled={!selectable}
          onClick={() => selectable && onSelectParent(node.id)}
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1.5 text-left ${
            isSelected
              ? "bg-bizzi-blue/15 text-bizzi-blue ring-1 ring-bizzi-blue/30 dark:bg-bizzi-blue/25 dark:text-bizzi-cyan dark:ring-bizzi-cyan/25"
              : "hover:bg-white dark:hover:bg-neutral-800"
          } ${!selectable ? "cursor-not-allowed" : ""}`}
        >
          <Folder className="h-5 w-5 shrink-0 text-amber-600 dark:text-amber-400" />
          <div className="min-w-0 flex-1">
            <div className="truncate font-medium text-neutral-900 dark:text-white">{rowLabel}</div>
            {node.id === null ? (
              <div className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                {driveLabelSuffix(displayRootName)}
              </div>
            ) : null}
          </div>
          {loading ? <span className="text-xs text-neutral-400">Loading…</span> : null}
        </button>
      </div>
      {isExpanded && node.children.length > 0 ? (
        <ul className="space-y-0.5">
          {node.children.map((ch) => {
            const childPath =
              nodePathFromRoot === "" ? ch.id! : `${nodePathFromRoot}/${ch.id}`;
            return (
              <TreeRows
                key={ch.id ?? "x"}
                node={ch}
                nodePathFromRoot={childPath}
                displayRootName={displayRootName}
                expanded={expanded}
                loadingKeys={loadingKeys}
                rowSelectable={rowSelectable}
                selectedParentId={selectedParentId}
                onToggleExpand={onToggleExpand}
                onSelectParent={onSelectParent}
              />
            );
          })}
        </ul>
      ) : null}
    </li>
  );
}

function driveLabelSuffix(rootLabel: string): string {
  if (rootLabel === "Main storage") return "Top level of this Storage drive";
  return rootLabel;
}
