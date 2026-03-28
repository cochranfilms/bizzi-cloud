"use client";

import { useState } from "react";
import { FAQ_ITEMS } from "@/lib/seo";

/** FAQ section with semantic markup for SEO and AI GEO discoverability. */

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-20 md:py-28 px-6">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-bizzi-navy dark:text-sky-50 mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-lg text-neutral-600 dark:text-neutral-300">
            Common questions about our platform.
          </p>
        </div>
        <div className="space-y-3" itemScope itemType="https://schema.org/FAQPage">
          {FAQ_ITEMS.map((faq, i) => (
            <div
              key={faq.question}
              className="rounded-xl bg-white border border-neutral-200 overflow-hidden shadow-sm dark:border-neutral-600 dark:bg-neutral-900/80 dark:shadow-black/20"
              itemScope
              itemProp="mainEntity"
              itemType="https://schema.org/Question"
            >
              <button
                type="button"
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between px-4 py-4 text-left hover:bg-neutral-50 transition-colors sm:px-6 active:bg-neutral-50 dark:hover:bg-neutral-800/80 dark:active:bg-neutral-800/80"
              >
                <span className="font-medium text-bizzi-navy dark:text-sky-100" itemProp="name">{faq.question}</span>
                <span
                  className={`flex-shrink-0 ml-4 text-2xl font-light text-neutral-500 dark:text-neutral-400 transition-transform ${
                    openIndex === i ? "rotate-45" : ""
                  }`}
                >
                  +
                </span>
              </button>
              {openIndex === i && (
                <div className="px-6 pb-4 pt-0" itemScope itemProp="acceptedAnswer" itemType="https://schema.org/Answer">
                  <p className="text-neutral-600 dark:text-neutral-300 leading-relaxed" itemProp="text">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
