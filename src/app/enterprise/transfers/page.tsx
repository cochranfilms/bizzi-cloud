import TopBar from "@/components/dashboard/TopBar";
import TransferGrid from "@/components/dashboard/TransferGrid";

export default function EnterpriseTransfersPage() {
  return (
    <>
      <TopBar title="Transfers" />
      <main className="flex-1 overflow-auto p-6">
        <TransferGrid />
      </main>
    </>
  );
}
