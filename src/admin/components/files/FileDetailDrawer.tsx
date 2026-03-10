"use client";

import Link from "next/link";
import SideDrawer from "../shared/SideDrawer";
import { formatBytes } from "@/admin/utils/formatBytes";
import { formatDateTime } from "@/admin/utils/formatDateTime";
import type { AdminFile } from "@/admin/types/adminFiles.types";

interface FileDetailDrawerProps {
  file: AdminFile | null;
  isOpen: boolean;
  onClose: () => void;
}

export default function FileDetailDrawer({
  file,
  isOpen,
  onClose,
}: FileDetailDrawerProps) {
  if (!file) return null;

  return (
    <SideDrawer isOpen={isOpen} onClose={onClose} title={file.name} width="md">
      <div className="space-y-6">
        <div>
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            File info
          </h4>
          <dl className="grid gap-2 text-sm">
            <div>
              <dt className="text-neutral-500">ID</dt>
              <dd className="font-mono text-xs">{file.id}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Size</dt>
              <dd>{formatBytes(file.sizeBytes)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">MIME type</dt>
              <dd>{file.mimeType}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Path</dt>
              <dd className="truncate">{file.folderPath || "/"}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Status</dt>
              <dd>{file.status}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Shared</dt>
              <dd>{file.shared ? "Yes" : "No"}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Created</dt>
              <dd>{formatDateTime(file.createdAt)}</dd>
            </div>
            <div>
              <dt className="text-neutral-500">Modified</dt>
              <dd>{formatDateTime(file.modifiedAt)}</dd>
            </div>
          </dl>
        </div>

        <div className="border-t border-neutral-200 pt-4 dark:border-neutral-700">
          <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500">
            Quick actions
          </h4>
          <div className="flex flex-wrap gap-2">
            <Link
              href={`/admin/users?highlight=${file.ownerId}`}
              className="rounded-lg bg-bizzi-blue px-3 py-1.5 text-sm font-medium text-white hover:bg-bizzi-cyan dark:bg-bizzi-cyan/20 dark:text-bizzi-cyan"
            >
              View owner
            </Link>
            <button
              type="button"
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Force reprocess preview
            </button>
            <button
              type="button"
              className="rounded-lg border border-neutral-200 px-3 py-1.5 text-sm hover:bg-neutral-50 dark:border-neutral-700 dark:hover:bg-neutral-800"
            >
              Mark for investigation
            </button>
          </div>
        </div>
      </div>
    </SideDrawer>
  );
}
