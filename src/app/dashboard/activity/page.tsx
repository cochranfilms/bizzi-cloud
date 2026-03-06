import TopBar from "@/components/dashboard/TopBar";

export default function ActivityPage() {
  return (
    <>
      <TopBar title="Activity" />
      <main className="flex-1 overflow-auto p-6">
        <p className="text-neutral-500 dark:text-neutral-400">
          View recent activity and changes.
        </p>
      </main>
    </>
  );
}
