import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import TransferAnalytics from "@/components/dashboard/TransferAnalytics";

export default async function TransferDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <>
      <div className="flex h-14 flex-shrink-0 items-center gap-4 border-b border-neutral-200 bg-[var(--dashboard-bg)] pl-14 pr-4 dark:border-neutral-800 lg:pl-6 lg:pr-6">
        <Link
          href="/dashboard/transfers"
          className="flex items-center gap-1 text-sm text-neutral-600 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white"
        >
          <ChevronLeft className="h-4 w-4" />
          Back to transfers
        </Link>
      </div>
      <main className="flex-1 overflow-auto p-6">
        <TransferAnalytics transferId={id} />
      </main>
    </>
  );
}
