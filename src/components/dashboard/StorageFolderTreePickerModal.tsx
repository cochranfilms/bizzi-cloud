"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronRight, Folder, X } from "lucide-react";
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

export interface StorageFolderTreePickerModalProps {
  open: boolean;
  onClose: () => void;
  linkedDriveId: string;
  driveLabel: string;
  title: string;
  confirmLabel?: string;
  excludedFolderIds: string[];
  knownDescendantIds?: string[];
  onConfirm: (targetParentFolderId: string | null) => Promise<void>;
}

export default function StorageFolderTreePickerModal({
  open,
  onClose,
  linkedDriveId,
  driveLabel,
  title,
  confirmLabel = "Move here",
  excludedFolderIds,
  knownDescendantIds,
  onConfirm,
}: StorageFolderTreePickerModalProps) {
  const [root, setRoot] = useState<TreeNode>(() => emptyRoot(driveLabel));
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set(["__root__"]));
  const [loadingKeys, setLoadingKeys] = useState<Set<string>>(() => new Set());
  /** `undefined` = none chosen; `null` = drive root */
  const [selectedParentId, setSelectedParentId] = useState<string | null | undefined>(undefined);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const excludeSet = new Set(excludedFolderIds);
  const descSet =
    knownDescendantIds && knownDescendantIds.length > 0
      ? new Set(knownDescendantIds)
      : undefined;

  useEffect(() => {
    if (open) {
      setRoot(emptyRoot(driveLabel));
      setExpanded(new Set(["__root__"]));
      setSelectedParentId(undefined);
      setError(null);
      setLoadingKeys(new Set());
    }
  }, [open, driveLabel]);

  const loadChildren = useCallback(
    async (parentFolderId: string | null, nodePathFromRoot: string) => {
      const loadKey = parentFolderId === null ? "__root__" : parentFolderId;
      setLoadingKeys((s) => new Set(s).add(loadKey));
      try {
        const { folders, listError } = await fetchStorageFolderList(
          linkedDriveId,
          parentFolderId,
          driveLabel
        );
        if (listError) {
          setError(listError);
          return;
        }
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

  const handleConfirm = useCallback(async () => {
    if (selectedParentId === undefined) return;
    setSubmitting(true);
    setError(null);
    try {
      await onConfirm(selectedParentId);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Something went wrong");
    } finally {
      setSubmitting(false);
    }
  }, [selectedParentId, onConfirm, onClose]);

  if (!open) return null;

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center p-4"
      onClick={(e) => e.target === e.currentTarget && !submitting && onClose()}
      role="dialog"
      aria-modal="true"
      aria-labelledby="storage-tree-picker-title"
    >
      <div className="absolute inset-0 bg-black/50" aria-hidden />
      <div
        className="relative z-10 flex max-h-[min(85vh,32rem)] w-full max-w-md flex-col overflow-hidden rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <h3
            id="storage-tree-picker-title"
            className="text-lg font-semibold text-neutral-900 dark:text-white"
          >
            {title}
          </h3>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="rounded-lg p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto p-3">
          {error ? (
            <p className="mb-2 text-sm text-red-500 dark:text-red-400">{error}</p>
          ) : null}
          <ul className="space-y-0.5 text-sm">
            <TreeRows
              node={root}
              nodePathFromRoot=""
              expanded={expanded}
              loadingKeys={loadingKeys}
              excludeSet={excludeSet}
              knownDescendantIds={descSet}
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
              onSelectParent={setSelectedParentId}
            />
          </ul>
        </div>
        <div className="flex justify-end gap-2 border-t border-neutral-200 px-4 py-3 dark:border-neutral-700">
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-400 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={submitting || selectedParentId === undefined}
            onClick={() => void handleConfirm()}
            className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
          >
            {submitting ? "…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );

  return typeof document !== "undefined" ? createPortal(modal, document.body) : null;
}

function TreeRows({
  node,
  nodePathFromRoot,
  expanded,
  loadingKeys,
  excludeSet,
  knownDescendantIds,
  selectedParentId,
  onToggleExpand,
  onSelectParent,
}: {
  node: TreeNode;
  nodePathFromRoot: string;
  expanded: Set<string>;
  loadingKeys: Set<string>;
  excludeSet: Set<string>;
  knownDescendantIds?: Set<string>;
  selectedParentId: string | null | undefined;
  onToggleExpand: (node: TreeNode, nodePathFromRoot: string) => void | Promise<void>;
  onSelectParent: (id: string | null) => void;
}) {
  const expKey = node.id === null ? "__root__" : node.id;
  const isExpanded = expanded.has(expKey);
  const loadKey = node.id === null ? "__root__" : node.id;
  const loading = loadingKeys.has(loadKey);
  const selectable = isFolderSelectableDestination({
    candidateFolderId: node.id,
    excludedFolderIds: excludeSet,
    knownDescendantIds,
  });
  const isSelected =
    selectable &&
    (node.id === null ? selectedParentId === null : selectedParentId === node.id);

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
          className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-1 text-left ${
            isSelected
              ? "bg-bizzi-blue/15 text-bizzi-blue dark:bg-bizzi-blue/25 dark:text-bizzi-cyan"
              : "hover:bg-neutral-100 dark:hover:bg-neutral-800"
          } ${!selectable ? "cursor-not-allowed" : ""}`}
        >
          <Folder className="h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
          <span className="truncate text-neutral-900 dark:text-white">{node.name}</span>
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
                expanded={expanded}
                loadingKeys={loadingKeys}
                excludeSet={excludeSet}
                knownDescendantIds={knownDescendantIds}
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
