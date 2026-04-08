"use client";

import TopBar from "./TopBar";

/** Home hub chrome: layout + New row only; drive switching lives in the Workspace rail. */
export default function DashboardHomeTopBar() {
  return <TopBar title={null} showLayoutSettings />;
}
