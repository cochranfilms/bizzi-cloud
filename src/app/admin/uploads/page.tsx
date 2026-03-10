import PageHeader from "@/admin/components/shared/PageHeader";

export default function AdminUploadAnalyticsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Upload Analytics"
        subtitle="Phase 2: Upload success rate, volume, failures, and transfer performance"
      />
      <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center dark:border-neutral-600 dark:bg-neutral-800/50">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Upload Analytics page coming in Phase 2. Success rate, volume charts, failure reasons, regional performance.
        </p>
      </div>
    </div>
  );
}
