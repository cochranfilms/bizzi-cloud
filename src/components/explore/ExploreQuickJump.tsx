"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, X } from "lucide-react";
import { buildQuickJumpEntries, type QuickJumpEntry } from "@/components/explore/explore-quick-jump-entries";
import { EXPLORE_NAV } from "@/content/explore-sections-data";
import { smoothScrollToElement } from "@/lib/smooth-scroll";

export default function ExploreQuickJump() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const entries = useMemo(() => buildQuickJumpEntries(EXPLORE_NAV), []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return entries.slice(0, 12);
    return entries.filter((e) => e.searchText.includes(q) || e.label.toLowerCase().includes(q)).slice(0, 24);
  }, [entries, query]);

  const go = useCallback(
    (id: string) => {
      setOpen(false);
      setQuery("");
      requestAnimationFrame(() => {
        const el = document.getElementById(id);
        if (el) void smoothScrollToElement(el);
      });
    },
    []
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setOpen((o) => !o);
      }
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <div
        className="flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3"
        data-explore-region="quick-jump"
      >
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="inline-flex min-h-[48px] w-full items-center gap-2 rounded-xl border border-neutral-200/90 bg-white/90 px-3 py-3 text-left text-sm text-neutral-600 shadow-sm backdrop-blur-sm transition hover:border-bizzi-blue/40 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900/80 dark:text-neutral-300 dark:hover:border-bizzi-cyan/35 dark:hover:text-white sm:max-w-md"
          aria-haspopup="dialog"
          aria-expanded={open}
          data-explore-action="quick-jump-open"
        >
          <Search className="h-4 w-4 shrink-0 text-neutral-400" aria-hidden />
          <span className="flex-1 truncate">Jump to a section…</span>
          <kbd className="hidden rounded border border-neutral-200 bg-neutral-50 px-1.5 py-0.5 font-mono text-[10px] text-neutral-500 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-400 sm:inline">
            ⌘K
          </kbd>
        </button>
      </div>

      {open && (
        <div
          className="fixed inset-0 z-[60] flex items-start justify-center bg-neutral-950/50 p-3 pt-[max(2.5rem,env(safe-area-inset-top))] backdrop-blur-sm sm:p-4 sm:pt-[12vh]"
          role="dialog"
          aria-modal="true"
          aria-label="Jump to section"
          data-explore-region="quick-jump-modal"
          onClick={() => setOpen(false)}
        >
          <div
            className="max-h-[min(85dvh,560px)] w-full max-w-lg overflow-hidden rounded-2xl border border-neutral-200 bg-white shadow-2xl dark:border-neutral-700 dark:bg-neutral-900"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-neutral-200 px-3 py-2 dark:border-neutral-700">
              <Search className="h-4 w-4 text-neutral-400" />
              <input
                autoFocus
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search sections, e.g. cache, proofing, mount…"
                className="min-h-[44px] flex-1 bg-transparent text-sm text-neutral-900 outline-none placeholder:text-neutral-400 dark:text-white"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="touch-target flex shrink-0 items-center justify-center rounded-lg text-neutral-500 hover:bg-neutral-100 dark:hover:bg-neutral-800"
                aria-label="Close"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <ul className="max-h-[min(45dvh,380px)] overflow-y-auto overscroll-contain p-2 sm:max-h-[min(50vh,420px)]">
              {filtered.map((e: QuickJumpEntry) => (
                <li key={e.id}>
                  <button
                    type="button"
                    onClick={() => go(e.id)}
                    className="min-h-[48px] w-full rounded-lg px-3 py-3 text-left text-sm text-neutral-800 hover:bg-bizzi-sky/80 sm:min-h-0 sm:py-2.5 dark:text-neutral-100 dark:hover:bg-neutral-800"
                    data-explore-action="quick-jump-select"
                    data-explore-target={e.id}
                  >
                    {e.label}
                  </button>
                </li>
              ))}
              {filtered.length === 0 && (
                <li className="px-3 py-6 text-center text-sm text-neutral-500">No matches. Try another word.</li>
              )}
            </ul>
          </div>
        </div>
      )}
    </>
  );
}
