"use client";

import TopBar from "@/components/dashboard/TopBar";
import DashboardRouteFade from "@/components/dashboard/DashboardRouteFade";
import WorkspaceCommentActivity from "@/components/dashboard/WorkspaceCommentActivity";

export default function EnterpriseCommentsPage() {
  return (
    <>
      <TopBar title="Comments" />
      <main className="flex min-h-0 flex-1 flex-col p-6">
        <DashboardRouteFade ready>
          <div className="mx-auto w-full max-w-5xl space-y-6">
            <WorkspaceCommentActivity
              apiPath="/api/enterprise/comments/activity"
              filesBasePath="/enterprise"
              title="Organization file comments"
            />
          </div>
        </DashboardRouteFade>
      </main>
    </>
  );
}
