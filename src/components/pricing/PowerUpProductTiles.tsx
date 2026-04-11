"use client";

import { useCallback, useId, useMemo, useState } from "react";
import type { KeyboardEvent } from "react";
import Image from "next/image";
import { powerUpAddons } from "@/lib/pricing-data";

const TILE_SUMMARIES: Record<string, readonly string[]> = {
  gallery: [
    "Photo and Video Galleries",
    "Client Proofing and Delivery",
    "Invoicing",
  ],
  editor: ["Virtual SSD Mounting", "Auto Proxy Generation", "LUT Uploads"],
  fullframe: [
    "Bizzi Gallery Suite + Bizzi Editor",
    "The complete creator workflow. Unified.",
  ],
};

/** Shared card gradient: 135°, brand blues + grey at ~7% transparency (93% opacity). */
const POWERUP_CARD_BACKGROUND =
  "linear-gradient(135deg, rgba(96, 191, 239, 0.93) 0%, rgba(204, 206, 209, 0.93) 100%)";

export type PowerUpAddonTile = {
  id: string;
  name: string;
  price: number;
  accentColor: string;
  bundleNote?: string;
};

type PowerUpProductTilesProps = {
  /** Defaults to {@link powerUpAddons} so marketing tiles stay in sync with checkout. */
  addons?: PowerUpAddonTile[];
};

function tilesFromPricingData(): PowerUpAddonTile[] {
  return powerUpAddons.map(({ id, name, price, accentColor, bundleNote }) => ({
    id,
    name,
    price,
    accentColor,
    bundleNote,
  }));
}

export default function PowerUpProductTiles({ addons }: PowerUpProductTilesProps) {
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const sectionHintId = useId();
  const tiles = useMemo(() => addons ?? tilesFromPricingData(), [addons]);

  const togglePin = useCallback((id: string) => {
    setPinnedId((cur) => (cur === id ? null : id));
  }, []);

  return (
    <>
      <p id={sectionHintId} className="sr-only">
        Hover a tile to see highlights. Click or press Enter to keep the summary open.
      </p>
      <div className="grid gap-10 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3 lg:gap-10">
        {tiles.map((addon) => {
          const summary = TILE_SUMMARIES[addon.id] ?? [];
          const panelId = `powerup-panel-${addon.id}`;
          const expanded = pinnedId === addon.id;

          return (
            <div
              key={addon.id}
              className="relative flex min-w-0 flex-col items-center text-center"
            >
              <div
                role="button"
                tabIndex={0}
                aria-expanded={expanded}
                aria-controls={panelId}
                aria-describedby={sectionHintId}
                className="group relative w-full max-w-[340px] cursor-pointer overflow-hidden rounded-[2.25rem] shadow-md ring-1 ring-black/[0.08] outline-none transition-shadow motion-reduce:transition-none hover:shadow-lg focus-visible:shadow-lg focus-visible:ring-2 focus-visible:ring-neutral-400 dark:ring-white/12 dark:focus-visible:ring-neutral-500 sm:max-w-none"
                style={{ aspectRatio: "1 / 1.08" }}
                onClick={() => togglePin(addon.id)}
                onKeyDown={(e: KeyboardEvent) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    togglePin(addon.id);
                  }
                }}
              >
                <div className="absolute inset-0" style={{ background: POWERUP_CARD_BACKGROUND }} />

                <div className="relative z-[2] flex h-full items-center justify-center px-6 pb-8 pt-6 pointer-events-none">
                  <Image
                    src="/White-Bizzi.png"
                    alt=""
                    width={400}
                    height={400}
                    className="h-auto w-[min(96%,17rem)] select-none drop-shadow-[0_2px_12px_rgba(0,0,0,0.12)] sm:w-[min(92%,18rem)]"
                    priority={false}
                  />
                </div>

                <div
                  id={panelId}
                  role="region"
                  aria-label={`${addon.name} highlights`}
                  className={`absolute inset-0 z-[3] flex items-center justify-center p-6 transition-opacity duration-300 ease-out motion-reduce:transition-none ${
                    expanded
                      ? "opacity-100"
                      : "pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-focus-visible:pointer-events-auto group-focus-visible:opacity-100"
                  } ${expanded ? "pointer-events-auto" : ""}`}
                  style={{
                    background: `linear-gradient(165deg, color-mix(in srgb, ${addon.accentColor} 72%, #020617) 0%, rgb(15 23 42 / 0.94) 100%)`,
                  }}
                >
                  <ul
                    className={`w-full max-w-[236px] space-y-3 text-left text-[13px] font-semibold leading-relaxed tracking-[0.02em] text-white antialiased transition-all duration-300 ease-out motion-reduce:transition-none sm:text-sm sm:group-hover:text-[1.0625rem] group-hover:max-w-[268px] group-hover:text-base group-hover:font-bold group-hover:tracking-wide group-focus-visible:text-base group-focus-visible:font-bold sm:group-focus-visible:text-[1.0625rem] ${
                      expanded
                        ? "translate-y-0 text-base font-bold opacity-100 sm:text-[1.0625rem]"
                        : "translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-visible:translate-y-0 group-focus-visible:opacity-100"
                    }`}
                  >
                    {summary.map((line) => (
                      <li key={line} className="flex gap-3 transition-[gap] duration-300 group-hover:gap-3.5">
                        <span
                          className="mt-[0.42em] h-1.5 w-1.5 shrink-0 rounded-full bg-white ring-1 ring-white/35"
                          aria-hidden
                        />
                        <span className="min-w-0 text-pretty">{line}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <h4 className="relative z-[1] mt-1 max-w-[280px] text-xl font-semibold tracking-tight text-neutral-900 dark:text-white sm:text-[1.35rem]">
                {addon.name}
              </h4>
              <p className="mt-2 text-sm font-medium text-neutral-500 dark:text-neutral-400">
                <span style={{ color: addon.accentColor }} className="font-semibold">
                  +${addon.price}
                </span>
                <span className="font-normal text-neutral-500 dark:text-neutral-400"> /mo</span>
              </p>
              {addon.bundleNote ? (
                <p
                  className="mt-1 max-w-[260px] text-xs font-medium opacity-90"
                  style={{ color: addon.accentColor }}
                >
                  ✨ {addon.bundleNote}
                </p>
              ) : null}
              <p className="mt-3 max-w-[260px] text-xs leading-relaxed text-neutral-500 dark:text-neutral-400">
                Available on every paid plan (except free).
              </p>
            </div>
          );
        })}
      </div>
    </>
  );
}
