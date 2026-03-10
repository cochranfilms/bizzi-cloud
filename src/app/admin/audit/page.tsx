import PageHeader from "@/admin/components/shared/PageHeader";

export default function AdminAuditLogPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Audit Log"
        subtitle="Phase 2: Admin actions and sensitive system events"
      />
      <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center dark:border-neutral-600 dark:bg-neutral-800/50">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Audit Log page coming in Phase 2. Admin login, suspensions, billing changes, file overrides, permission changes.
        </p>
      </div>
    </div>
  );
}
