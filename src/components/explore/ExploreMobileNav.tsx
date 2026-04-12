"use client";

import { useState } from "react";
import { Menu } from "lucide-react";
import Sheet from "@/components/ui/Sheet";
import ExploreJumpLink from "@/components/explore/ExploreJumpLink";
import type { ExploreNavItem } from "@/content/explore-sections-data";

type Props = {
  items: ExploreNavItem[];
  activeId: string;
};

export default function ExploreMobileNav({ items, activeId }: Props) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed z-40 flex h-14 w-14 items-center justify-center rounded-full border border-neutral-200/90 bg-white text-bizzi-navy shadow-lg backdrop-blur-sm dark:border-neutral-600 dark:bg-neutral-900 dark:text-sky-100 lg:hidden"
        style={{
          bottom: "max(1.25rem, env(safe-area-inset-bottom, 0px))",
          right: "max(1.25rem, env(safe-area-inset-right, 0px))",
        }}
        aria-label="Open table of contents"
        data-explore-action="mobile-toc-open"
        data-explore-region="mobile-toc-fab"
      >
        <Menu className="h-6 w-6" />
      </button>

      <Sheet open={open} onOpenChange={setOpen} side="left" title="Explore Bizzi">
        <nav
          className="px-4 py-4"
          aria-label="Table of contents"
          data-explore-region="mobile-toc-panel"
        >
          <ul className="space-y-1">
            {items.map((item) => (
              <li key={item.id}>
                <ExploreJumpLink
                  href={`#${item.id}`}
                  exploreAction="mobile-toc"
                  onNavigate={() => setOpen(false)}
                  className={`flex min-h-[48px] items-center rounded-lg px-3 py-2 text-sm ${
                    activeId === item.id
                      ? "bg-bizzi-sky font-semibold text-bizzi-navy dark:bg-neutral-800 dark:text-sky-50"
                      : "text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  }`}
                >
                  {item.label}
                </ExploreJumpLink>
                {item.children && item.children.length > 0 ? (
                  <ul className="ml-2 mt-1 space-y-0.5 border-l border-neutral-200 pl-2 dark:border-neutral-700">
                    {item.children.map((ch) => (
                      <li key={ch.id}>
                        <ExploreJumpLink
                          href={`#${ch.id}`}
                          exploreAction="mobile-toc"
                          onNavigate={() => setOpen(false)}
                          className="flex min-h-[44px] items-center rounded-lg px-2 py-2 text-xs text-neutral-600 hover:bg-neutral-100 sm:min-h-0 sm:py-1.5 dark:text-neutral-400 dark:hover:bg-neutral-800"
                        >
                          {ch.label}
                        </ExploreJumpLink>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        </nav>
      </Sheet>
    </>
  );
}
