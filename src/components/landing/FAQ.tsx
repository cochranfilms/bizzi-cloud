"use client";

import { useState } from "react";

const faqs = [
  {
    question: "What is Bizzi Cloud?",
    answer:
      "Bizzi Cloud is cloud storage built for creators. Store and organize your projects—video, photo, design—in one place. From your Bizzi Byte SSD to the cloud, access your work anywhere, anytime. Fast, reliable, built for how creators work.",
  },
  {
    question: "Who can use this platform?",
    answer:
      "Bizzi Cloud is for creators of all kinds: videographers, photographers, designers, and creative teams. Solo creators, indie filmmakers, production houses, and agencies all use Bizzi Cloud to store, share, and deliver their work.",
  },
  {
    question: "Can I share files with external clients or partners?",
    answer:
      "Yes. Bizzi Cloud supports smart share links, password-protected delivery, and branded client pages. Share folders or individual files with anyone—clients, collaborators, or partners—without giving them full account access.",
  },
  {
    question: "How does Bizzi Cloud work with Bizzi Byte SSDs?",
    answer:
      "Bizzi Cloud extends your Bizzi Byte SSD workflow into the cloud. Upload from your SSD, sync across devices, and deliver to clients—all from one platform. Same philosophy: fast, reliable, built for creators.",
  },
];

export default function FAQ() {
  const [openIndex, setOpenIndex] = useState<number | null>(0);

  return (
    <section id="faq" className="py-20 md:py-28 px-6 bg-bizzi-sky/30">
      <div className="max-w-3xl mx-auto">
        <div className="text-center mb-12">
          <h2 className="text-3xl md:text-4xl font-bold text-bizzi-navy mb-4">
            Frequently Asked Questions
          </h2>
          <p className="text-lg text-neutral-600">
            Common questions about our platform.
          </p>
        </div>
        <div className="space-y-3">
          {faqs.map((faq, i) => (
            <div
              key={faq.question}
              className="rounded-xl bg-white border border-neutral-200 overflow-hidden shadow-sm"
            >
              <button
                type="button"
                onClick={() => setOpenIndex(openIndex === i ? null : i)}
                className="w-full flex items-center justify-between px-6 py-4 text-left hover:bg-neutral-50 transition-colors"
              >
                <span className="font-medium text-bizzi-navy">{faq.question}</span>
                <span
                  className={`flex-shrink-0 ml-4 text-2xl font-light text-neutral-500 transition-transform ${
                    openIndex === i ? "rotate-45" : ""
                  }`}
                >
                  +
                </span>
              </button>
              {openIndex === i && (
                <div className="px-6 pb-4 pt-0">
                  <p className="text-neutral-600 leading-relaxed">{faq.answer}</p>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
