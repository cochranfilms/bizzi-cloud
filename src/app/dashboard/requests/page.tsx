import TopBar from "@/components/dashboard/TopBar";

export default function FileRequestsPage() {
  return (
    <>
      <TopBar title="File requests" />
      <main className="flex-1 overflow-auto p-6">
        <p className="text-neutral-500 dark:text-neutral-400">
          Create links for others to upload files directly to your account.
        </p>
      </main>
    </>
  );
}
