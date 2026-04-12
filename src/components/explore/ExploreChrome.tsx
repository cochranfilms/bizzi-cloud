"use client";

import ExploreMobileNav from "@/components/explore/ExploreMobileNav";
import ExploreQuickJump from "@/components/explore/ExploreQuickJump";
import ExploreSidebar from "@/components/explore/ExploreSidebar";
import { EXPLORE_DATA_VERSION } from "@/components/explore/explore-data-attributes";
import { useExploreScrollSpy } from "@/components/explore/useExploreScrollSpy";
import { EXPLORE_NAV, EXPLORE_SCROLL_SPY_IDS } from "@/content/explore-sections-data";
import type { ReactNode } from "react";

type Props = {
  children: ReactNode;
};

export default function ExploreChrome({ children }: Props) {
  const activeId = useExploreScrollSpy(EXPLORE_SCROLL_SPY_IDS);

  return (
    <div
      className="mx-auto w-full max-w-6xl overflow-x-clip px-4 pb-20 pt-3 sm:px-6 sm:pb-24 sm:pt-4 lg:grid lg:grid-cols-[minmax(200px,240px)_minmax(0,1fr)] lg:gap-10 lg:px-8 xl:gap-12"
      data-explore-version={EXPLORE_DATA_VERSION}
      data-explore-region="academy-layout"
    >
      <ExploreSidebar items={EXPLORE_NAV} activeId={activeId} />
      <div className="min-w-0" data-explore-region="academy-main-column">
        <div className="mb-8" data-explore-region="quick-jump-host">
          <ExploreQuickJump />
        </div>
        {children}
      </div>
      <ExploreMobileNav items={EXPLORE_NAV} activeId={activeId} />
    </div>
  );
}
