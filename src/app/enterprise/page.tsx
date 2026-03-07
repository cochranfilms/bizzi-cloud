import TopBar from "@/components/dashboard/TopBar";
import HomeStorageView from "@/components/dashboard/HomeStorageView";

export default function EnterpriseHomePage() {
  return (
    <>
      <TopBar title="Home" />
      <main className="flex-1 overflow-auto p-6">
        <HomeStorageView basePath="/enterprise" />
      </main>
    </>
  );
}
