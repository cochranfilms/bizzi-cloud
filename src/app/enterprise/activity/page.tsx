import TopBar from "@/components/dashboard/TopBar";
import ActivityContent from "@/components/dashboard/ActivityContent";

export default function EnterpriseActivityPage() {
  return (
    <>
      <TopBar title="Activity" />
      <main className="flex-1 overflow-auto p-6">
        <ActivityContent scope="organization" />
      </main>
    </>
  );
}
