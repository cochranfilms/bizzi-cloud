import TopBar from "@/components/dashboard/TopBar";

export default function RecentPage() {
  return (
    <>
      <TopBar title="Recent" />
      <main className="flex-1 overflow-auto p-6">
        <p className="text-neutral-500 dark:text-neutral-400">
          Recently opened files and folders.
        </p>
      </main>
    </>
  );
}
