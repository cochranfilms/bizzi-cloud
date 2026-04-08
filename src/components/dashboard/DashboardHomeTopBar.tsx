"use client";

import TopBar from "./TopBar";
import HomePillarTabs from "./HomePillarTabs";

/** Home hub chrome: open layout with centered pillar tabs and no duplicate “Home” title. */
export default function DashboardHomeTopBar() {
  return (
    <TopBar title={null} showLayoutSettings centerContent={<HomePillarTabs />} />
  );
}
