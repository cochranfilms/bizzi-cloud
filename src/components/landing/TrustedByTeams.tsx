"use client";

import { useEffect, useState } from "react";
import LoopingVideoPreview from "@/components/LoopingVideoPreview";

const TOP_ROW = [
  { src: "/Frost.mp4", title: "Frost" },
  { src: "/Video.mp4", title: "Video" },
] as const;

const MARQUEE_VIDEOS = [
  "/Darren.mp4",
  "/Cody.mp4",
  "/James-Choi.mp4",
  "/Kathryn-Book.mp4",
] as const;

/** Each bottom tile matches one top panel: half the row width, 16×9 */
function marqueeCardClassName() {
  return "relative aspect-video w-[50vw] max-w-none shrink-0 overflow-hidden rounded-sm bg-black";
}

export default function TrustedByTeams() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const handler = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  return (
    <section className="overflow-hidden bg-white/60 py-12 md:py-16">
      <div className="mb-8 text-center">
        <h2 className="text-xl font-semibold text-bizzi-navy md:text-2xl">
          Trusted by creative teams
        </h2>
      </div>

      <div className="relative w-full bg-black">
        <div className="grid w-full grid-cols-2 gap-0">
          {TOP_ROW.map(({ src, title }) => (
            <div
              key={src}
              className="relative aspect-video w-full overflow-hidden bg-black"
            >
              <LoopingVideoPreview
                src={src}
                mode="fullLoop"
                className="absolute inset-0 h-full w-full object-contain"
              />
              <span className="sr-only">{title}</span>
            </div>
          ))}
        </div>

        <div className="relative overflow-hidden" aria-label="Customer stories">
          <div
            className={
              reduceMotion
                ? "flex w-full flex-wrap justify-center gap-2"
                : "flex w-max animate-teams-marquee"
            }
          >
            {(reduceMotion ? MARQUEE_VIDEOS : [...MARQUEE_VIDEOS, ...MARQUEE_VIDEOS]).map(
              (src, i) => (
                <div key={`${src}-${i}`} className={marqueeCardClassName()}>
                  <LoopingVideoPreview
                    src={src}
                    mode="fullLoop"
                    className="absolute inset-0 h-full w-full object-contain"
                  />
                </div>
              ),
            )}
          </div>
        </div>
      </div>
    </section>
  );
}
