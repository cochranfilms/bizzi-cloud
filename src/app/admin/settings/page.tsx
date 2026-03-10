import PageHeader from "@/admin/components/shared/PageHeader";

export default function AdminSettingsPage() {
  return (
    <div className="space-y-6">
      <PageHeader
        title="Settings"
        subtitle="Phase 3: Plan limits, retention, alerts, feature flags, maintenance mode"
      />
      <div className="rounded-xl border border-dashed border-neutral-300 bg-neutral-50 p-12 text-center dark:border-neutral-600 dark:bg-neutral-800/50">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Settings page coming in Phase 3. Quotas, retention rules, alert thresholds, feature flags, maintenance mode.
        </p>
      </div>
    </div>
  );
}
