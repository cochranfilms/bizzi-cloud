"use client";

import type { ComponentPropsWithoutRef } from "react";
import { workspaceQuickActionsRegistry } from "@/lib/workspace-quick-actions-registry";

type MainProps = ComponentPropsWithoutRef<"main">;

/**
 * Dashboard home `<main>`: forwards right-clicks on empty workspace (including padding) to
 * FileGrid’s background menu via {@link workspaceQuickActionsRegistry}.
 */
export default function WorkspaceMainWithContextMenu({ children, onContextMenu, ...rest }: MainProps) {
  return (
    <main
      {...rest}
      onContextMenu={(e) => {
        workspaceQuickActionsRegistry.dispatchWorkspaceBackgroundContextMenu(e);
        onContextMenu?.(e);
      }}
    >
      {children}
    </main>
  );
}
