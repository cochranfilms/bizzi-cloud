"use client";

import { smoothScrollToElement } from "@/lib/smooth-scroll";
import type { ReactNode } from "react";

type Props = {
  href: string;
  children: ReactNode;
  className?: string;
  /** Called after an in-page jump (e.g. close mobile drawer). */
  onNavigate?: () => void;
  "aria-current"?:"page" | "step" | "location" | "true" | "false" | boolean | undefined;
  /** Overrides default `jump` for hash links (e.g. `toc`, `mobile-toc`). */
  exploreAction?: string;
};

/**
 * In-page anchor with eased smooth scroll. External links pass through unchanged.
 */
export default function ExploreJumpLink({
  href,
  children,
  className,
  onNavigate,
  exploreAction,
  ...rest
}: Props) {
  const isHash = href.startsWith("#") && href.length > 1;
  const hashId = isHash ? href.slice(1) : undefined;

  return (
    <a
      href={href}
      className={className}
      {...rest}
      data-explore-action={isHash ? exploreAction ?? "jump" : href.startsWith("/") ? "app-route" : "link"}
      {...(hashId ? { "data-explore-target": hashId } : {})}
      onClick={(e) => {
        if (!isHash) {
          onNavigate?.();
          return;
        }
        e.preventDefault();
        const id = href.slice(1);
        const el = document.getElementById(id);
        if (el) void smoothScrollToElement(el).then(() => onNavigate?.());
        else onNavigate?.();
      }}
    >
      {children}
    </a>
  );
}
