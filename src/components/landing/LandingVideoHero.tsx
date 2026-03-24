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

export default function LandingVideoHero() {
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    setReduceMotion(mq.matches);
    const handler = () => setReduceMotion(mq.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, []);

  const duplicated = [...MARQUEE_VIDEOS, ...MARQUEE_VIDEOS];

  return (
    <div className="relative w-full bg-black">
      {/* Frost + Video: first screen, two-up 16×9 filling the row (no horizontal scroll). */}
      <div className="grid w-full grid-cols-2 gap-0 sm:gap-px">
        {TOP_ROW.map(({ src, title }) => (
          <div
            key={src}
            className="relative aspect-video w-full overflow-hidden bg-neutral-950"
          >
            <LoopingVideoPreview
              src={src}
              loopSeconds={5}
              className="absolute inset-0 h-full w-full object-cover"
            />
            <span className="sr-only">{title}</span>
          </div>
        ))}
      </div>

      {/* Marquee sits above the bottom of Frost/Video (overlap) so it reads as “on top” of that row. */}
      <div
        className="relative z-10 -mt-6 overflow-hidden border-t border-white/10 bg-neutral-950/95 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:-mt-10"
        aria-label="Customer stories"
      >
        <div
          className={
            reduceMotion
              ? "flex w-full flex-wrap justify-center gap-2 py-3"
              : "flex w-max animate-landing-marquee py-3"
          }
        >
          {reduceMotion
            ? MARQUEE_VIDEOS.map((src) => (
                <div
                  key={src}
                  className="relative aspect-video w-[min(42vw,22rem)] shrink-0 overflow-hidden rounded-sm sm:w-80"
                >
                  <LoopingVideoPreview
                    src={src}
                    loopSeconds={5}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </div>
              ))
            : duplicated.map((src, i) => (
                <div
                  key={`${src}-${i}`}
                  className="relative aspect-video w-[min(42vw,22rem)] shrink-0 overflow-hidden rounded-sm sm:w-80"
                >
                  <LoopingVideoPreview
                    src={src}
                    loopSeconds={5}
                    className="absolute inset-0 h-full w-full object-cover"
                  />
                </div>
              ))}
        </div>
      </div>
    </div>
  );
}
