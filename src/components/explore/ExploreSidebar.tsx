"use client";

import ExploreJumpLink from "@/components/explore/ExploreJumpLink";
import type { ExploreNavItem } from "@/content/explore-sections-data";

type Props = {
  items: ExploreNavItem[];
  activeId: string;
};

export default function ExploreSidebar({ items, activeId }: Props) {
  return (
    <nav
      className="hidden lg:block"
      aria-label="Explore Bizzi table of contents"
      data-explore-region="sidebar-toc"
    >
      <div className="sticky top-[5.5rem] max-h-[calc(100dvh-6rem)] overflow-y-auto overscroll-y-contain pb-8 pr-2">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
          On this page
        </p>
        <ul className="space-y-0.5 border-l border-neutral-200 dark:border-neutral-700">
          {items.map((item) => {
            const isActive = activeId === item.id;
            return (
              <li key={item.id} className="-ml-px">
                <ExploreJumpLink
                  href={`#${item.id}`}
                  exploreAction="toc"
                  className={`block break-words border-l-2 py-1.5 pl-3 text-left text-sm leading-snug transition-colors ${
                    isActive
                      ? "border-bizzi-blue font-semibold text-bizzi-navy dark:border-bizzi-cyan dark:text-sky-50"
                      : "border-transparent font-medium text-neutral-600 hover:border-neutral-300 hover:text-neutral-900 dark:text-neutral-400 dark:hover:border-neutral-600 dark:hover:text-white"
                  }`}
                  aria-current={isActive ? "location" : undefined}
                >
                  {item.label}
                </ExploreJumpLink>
                {item.children && item.children.length > 0 && (
                  <ul className="ml-1 mt-1 space-y-0.5 border-l border-neutral-100 pl-2 dark:border-neutral-800">
                    {item.children.map((ch) => {
                      const subActive = activeId === ch.id;
                      return (
                        <li key={ch.id}>
                          <ExploreJumpLink
                            href={`#${ch.id}`}
                            exploreAction="toc"
                            className={`block break-words py-1 pl-2 text-left text-xs leading-snug ${
                              subActive
                                ? "font-semibold text-bizzi-blue dark:text-bizzi-cyan"
                                : "text-neutral-500 hover:text-neutral-800 dark:text-neutral-500 dark:hover:text-neutral-200"
                            }`}
                          >
                            {ch.label}
                          </ExploreJumpLink>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
