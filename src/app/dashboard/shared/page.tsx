import TopBar from "@/components/dashboard/TopBar";
import SharedContent from "@/components/dashboard/SharedContent";

export default function SharedPage() {
  return (
    <>
      <TopBar title="Shared with you" />
      <main className="flex-1 overflow-auto p-6">
        <SharedContent />
      </main>
    </>
  );
}
