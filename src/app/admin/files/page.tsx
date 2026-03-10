import PageHeader from "@/admin/components/shared/PageHeader";

export default function AdminFilesPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Files"
        subtitle="Phase 2: File-level admin visibility and operations"
      />
      <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center dark:border-neutral-600 dark:bg-neutral-800/50">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Files page coming in Phase 2. Search by file name, ID, owner; view metadata; detect large/duplicate/suspicious files; admin actions.
        </p>
      </div>
    </div>
  );
}
