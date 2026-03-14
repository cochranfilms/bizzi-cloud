import TopBar from "@/components/dashboard/TopBar";
import TransferGrid from "@/components/dashboard/TransferGrid";

export default function DesktopTransfersPage() {
  return (
    <>
      <TopBar title="Transfers" />
      <main className="mt-4 flex-1 min-h-0 overflow-auto px-4 py-5 sm:mt-6 sm:px-6 sm:py-6">
        <TransferGrid />
      </main>
    </>
  );
}
