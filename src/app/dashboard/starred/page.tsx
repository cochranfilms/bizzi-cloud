import TopBar from "@/components/dashboard/TopBar";

export default function StarredPage() {
  return (
    <>
      <TopBar title="Starred" />
      <main className="flex-1 overflow-auto p-6">
        <p className="text-neutral-500 dark:text-neutral-400">
          Star important files and folders for quick access.
        </p>
      </main>
    </>
  );
}
