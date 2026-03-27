import TopBar from "@/components/dashboard/TopBar";
import HeartsContent from "@/components/dashboard/HeartsContent";

export default function HeartsPage() {
  return (
    <>
      <TopBar title="Hearts" showLayoutSettings />
      <main className="flex-1 overflow-auto p-6">
        <HeartsContent />
      </main>
    </>
  );
}
