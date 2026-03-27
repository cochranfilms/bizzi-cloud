"use client";

import TopBar from "@/components/dashboard/TopBar";
import DashboardRouteFade from "@/components/dashboard/DashboardRouteFade";
import WorkspaceCommentActivity from "@/components/dashboard/WorkspaceCommentActivity";
import { usePersonalTeamWorkspaceRequired } from "@/context/PersonalTeamWorkspaceContext";

export default function TeamCommentsPage() {
  const { teamOwnerUid } = usePersonalTeamWorkspaceRequired();

  return (
    <>
      <TopBar title="Comments" />
      <main className="flex min-h-0 flex-1 flex-col p-6">
        <DashboardRouteFade ready>
          <div className="mx-auto w-full max-w-5xl space-y-6">
            <WorkspaceCommentActivity
              apiPath={`/api/team/${encodeURIComponent(teamOwnerUid)}/comments/activity`}
              filesBasePath={`/team/${encodeURIComponent(teamOwnerUid)}`}
            />
          </div>
        </DashboardRouteFade>
      </main>
    </>
  );
}
