import TopBar from "@/components/dashboard/TopBar";

export default function TrashPage() {
  return (
    <>
      <TopBar title="Deleted files" />
      <main className="flex-1 overflow-auto p-6">
        <p className="text-neutral-500 dark:text-neutral-400">
          Deleted files are kept for 30 days before permanent deletion.
        </p>
      </main>
    </>
  );
}
