import PageHeader from "@/admin/components/shared/PageHeader";

export default function AdminSupportPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Support"
        subtitle="Phase 2: Support tickets and operations queue"
      />
      <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center dark:border-neutral-600 dark:bg-neutral-800/50">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Support page coming in Phase 2. Open tickets, priority, affected user, issue type, quick links.
        </p>
      </div>
    </div>
  );
}
