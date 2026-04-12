/**
 * Bridges the dashboard "+ New" top bar and inline Storage (FileGrid) so right-click
 * and empty-state actions reuse the same handlers as the primary New menu.
 * TopBar registers upload + folder modals; FileGrid registers Storage v2 share/pin
 * and the workspace background context menu (empty-area right-click).
 */

import type { MouseEvent as ReactMouseEvent } from "react";

export type WorkspaceBackgroundContextMenuHandler = (e: ReactMouseEvent) => void;

export type WorkspaceQuickTopBarHandlers = {
  openNewFolder: () => void;
  openFileUpload: () => void | Promise<void>;
  openSharedFolder: () => void;
};

export type WorkspaceQuickFileGridV2Handlers = {
  shareCurrentPath: () => void;
  togglePinCurrentPath: () => void | Promise<void>;
  openRenameCurrentPath?: () => void;
  openMoveCurrentPath?: () => void;
};

const topBarRef: { current: Partial<WorkspaceQuickTopBarHandlers> } = { current: {} };
let fileGridV2: WorkspaceQuickFileGridV2Handlers | null = null;
let backgroundContextMenuHandler: WorkspaceBackgroundContextMenuHandler | null = null;

export const workspaceQuickActionsRegistry = {
  setTopBarHandlers(h: Partial<WorkspaceQuickTopBarHandlers>) {
    topBarRef.current = h;
  },
  clearTopBarHandlers() {
    topBarRef.current = {};
  },
  setFileGridV2Handlers(h: WorkspaceQuickFileGridV2Handlers | null) {
    fileGridV2 = h;
  },
  setWorkspaceBackgroundContextMenuHandler(h: WorkspaceBackgroundContextMenuHandler | null) {
    backgroundContextMenuHandler = h;
  },
  dispatchWorkspaceBackgroundContextMenu(e: ReactMouseEvent) {
    backgroundContextMenuHandler?.(e);
  },
  openNewFolder() {
    topBarRef.current.openNewFolder?.();
  },
  openFileUpload() {
    return topBarRef.current.openFileUpload?.();
  },
  openSharedFolder() {
    topBarRef.current.openSharedFolder?.();
  },
  shareCurrentStoragePath() {
    fileGridV2?.shareCurrentPath();
  },
  togglePinCurrentStoragePath() {
    return fileGridV2?.togglePinCurrentPath();
  },
  openRenameCurrentStoragePath() {
    fileGridV2?.openRenameCurrentPath?.();
  },
  openMoveCurrentStoragePath() {
    fileGridV2?.openMoveCurrentPath?.();
  },
};
