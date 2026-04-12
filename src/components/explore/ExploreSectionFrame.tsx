import Link from "next/link";
import {
  EXPLORE_RELATED,
  EXPLORE_SECTION_CTAS,
  exploreNavLabelForId,
} from "@/content/explore-sections-data";
import type { ReactNode } from "react";

type Props = {
  id: string;
  title: string;
  summary: string;
  /** Visual block: comparisons, steps, cards — not prose-only */
  visual: ReactNode;
  /** Deeper explanation */
  children: ReactNode;
  /** Optional boxed takeaway */
  takeaway?: ReactNode;
  /** Optional related override; defaults to EXPLORE_RELATED[id] */
  relatedIds?: string[];
};

export default function ExploreSectionFrame({
  id,
  title,
  summary,
  visual,
  children,
  takeaway,
  relatedIds,
}: Props) {
  const related = relatedIds ?? EXPLORE_RELATED[id] ?? [];
  const cta = EXPLORE_SECTION_CTAS[id];

  return (
    <section
      id={id}
      data-explore-section={id}
      data-explore-region="content-section"
      className={`explore-section-print mb-12 scroll-mt-[5.5rem] border-b border-neutral-200/70 pb-10 sm:mb-16 sm:pb-14 lg:mb-20 lg:pb-16 dark:border-neutral-800/80`}
    >
      <header className="mb-5 sm:mb-6">
        <h2 className="text-balance text-xl font-bold leading-snug tracking-tight text-bizzi-navy sm:text-2xl md:text-3xl dark:text-sky-50">
          {title}
        </h2>
        <p className="mt-2 max-w-3xl text-[0.9375rem] leading-relaxed text-neutral-600 sm:text-base dark:text-neutral-300">
          {summary}
        </p>
      </header>

      <div className="mb-8">{visual}</div>

      <div className="max-w-3xl space-y-4 text-[0.9375rem] text-neutral-700 sm:text-base dark:text-neutral-300">
        {children}
      </div>

      {takeaway && (
        <aside className="mt-6 rounded-xl border border-bizzi-blue/20 bg-bizzi-sky/50 p-4 text-sm text-neutral-800 sm:mt-8 dark:border-bizzi-cyan/20 dark:bg-neutral-800/50 dark:text-neutral-200">
          <p className="font-semibold text-bizzi-navy dark:text-sky-100">Quick takeaway</p>
          <div className="mt-2">{takeaway}</div>
        </aside>
      )}

      {cta && (
        <p className="mt-8">
          {cta.href.startsWith("#") ? (
            <a
              href={cta.href}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-bizzi-blue px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-bizzi-cyan dark:bg-bizzi-blue"
              data-explore-action="section-cta"
              data-explore-target={cta.href.slice(1)}
            >
              {cta.label}
            </a>
          ) : (
            <Link
              href={cta.href}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full bg-bizzi-blue px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-bizzi-cyan"
              data-explore-action="section-cta-app"
            >
              {cta.label}
            </Link>
          )}
        </p>
      )}

      {related.length > 0 && (
        <footer
          className="mt-8 rounded-2xl border border-neutral-200/90 bg-white/60 p-3 sm:mt-10 sm:p-4 dark:border-neutral-700 dark:bg-neutral-900/40"
          data-explore-region="related-topics"
        >
          <p className="text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Related topics
          </p>
          <ul className="mt-3 flex flex-wrap gap-2">
            {related.map((rid) => (
              <li key={rid}>
                <a
                  href={`#${rid}`}
                  className="inline-flex min-h-[44px] items-center rounded-full border border-neutral-200 bg-white px-3 py-2 text-sm font-medium text-bizzi-navy transition hover:border-bizzi-blue/50 hover:text-bizzi-blue sm:min-h-0 sm:py-1.5 dark:border-neutral-600 dark:bg-neutral-800 dark:text-sky-100 dark:hover:border-bizzi-cyan/50"
                  data-explore-action="related-topic"
                  data-explore-target={rid}
                >
                  {exploreNavLabelForId(rid)}
                </a>
              </li>
            ))}
          </ul>
        </footer>
      )}
    </section>
  );
}
