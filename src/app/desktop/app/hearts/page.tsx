import TopBar from "@/components/dashboard/TopBar";
import HeartsContent from "@/components/dashboard/HeartsContent";

export default function DesktopHeartsPage() {
  return (
    <>
      <TopBar title="Hearts" />
      <main className="flex-1 overflow-auto p-6">
        <HeartsContent basePath="/desktop/app" />
      </main>
    </>
  );
}
