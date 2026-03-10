"use client";

import { useState, useMemo } from "react";
import PageHeader from "../components/shared/PageHeader";
import FilesSummaryRow from "../components/files/FilesSummaryRow";
import FilesFilters from "../components/files/FilesFilters";
import FilesTable from "../components/files/FilesTable";
import FileDetailDrawer from "../components/files/FileDetailDrawer";
import LargeFilesPanel from "../components/files/LargeFilesPanel";
import { useAdminFiles } from "../hooks/useAdminFiles";
import type { AdminFile } from "../types/adminFiles.types";
import EmptyState from "../components/shared/EmptyState";
import { FileStack } from "lucide-react";

export default function FilesPage() {
  const { files, total, largeFiles, loading, error, refresh } = useAdminFiles();
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [selectedFile, setSelectedFile] = useState<AdminFile | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const filteredFiles = useMemo(() => {
    let list = files;
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(
        (f) =>
          f.name.toLowerCase().includes(q) ||
          f.id.toLowerCase().includes(q) ||
          f.ownerEmail.toLowerCase().includes(q)
      );
    }
    if (statusFilter) list = list.filter((f) => f.status === statusFilter);
    return list;
  }, [files, search, statusFilter]);

  const flaggedCount = files.filter((f) => f.flags?.length).length;

  const handleClearFilters = () => {
    setSearch("");
    setStatusFilter("");
  };

  const handleRowClick = (file: AdminFile) => {
    setSelectedFile(file);
    setDrawerOpen(true);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Files"
        subtitle="File-level admin visibility and operations"
        actions={
          <button
            type="button"
            onClick={() => void refresh()}
            className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium dark:border-neutral-700 dark:bg-neutral-800"
          >
            Refresh
          </button>
        }
      />

      <FilesSummaryRow total={total} flagged={flaggedCount} />

      <FilesFilters
        search={search}
        onSearchChange={setSearch}
        statusFilter={statusFilter}
        onStatusFilterChange={setStatusFilter}
        onClear={handleClearFilters}
      />

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-200">
          {error}
        </div>
      )}

      <FilesTable
        files={filteredFiles}
        loading={loading}
        onRowClick={handleRowClick}
      />

      <LargeFilesPanel files={largeFiles} />

      <FileDetailDrawer
        file={selectedFile}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
