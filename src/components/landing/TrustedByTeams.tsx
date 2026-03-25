"use client";

import { useEffect, useState } from "react";
import LoopingVideoPreview from "@/components/LoopingVideoPreview";

const TOP_ROW = [
  { src: "/Frost.mp4", title: "Frost" },
  { src: "/Video.mp4", title: "Video" },
] as const;

/** Same clips as the former marquee; one copy only (scroll does not loop) */
const MARQUEE_VIDEOS = [
  "/Darren.mp4",
  "/Cody.mp4",
  "/James-Choi.mp4",
  "/Kathryn-Book.mp4",
] as const;

/** Each bottom tile matches one top panel: half the row width, 16×9 */
function marqueeCardClassName() {
  return "relative aspect-video w-[50vw] max-w-none shrink-0 overflow-hidden rounded-sm";
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

        <div
          className="relative z-10 -mt-6 overflow-hidden border-t border-white/10 bg-neutral-950/95 shadow-[0_-12px_40px_rgba(0,0,0,0.45)] backdrop-blur-sm sm:-mt-10"
          aria-label="Customer stories"
        >
          <div
            className={
              reduceMotion
                ? "flex w-full flex-wrap justify-center gap-2 py-3"
                : "flex w-max animate-teams-marquee-once py-3"
            }
          >
            {MARQUEE_VIDEOS.map((src) => (
              <div key={src} className={marqueeCardClassName()}>
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
    </section>
  );
}
