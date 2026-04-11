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

function LightningBolts({
  accentColor,
  scopeId,
  variant,
}: {
  accentColor: string;
  scopeId: string;
  variant: "card" | "spill";
}) {
  const filterId = `powerup-lightning-glow-${variant}-${scopeId}`;
  if (variant === "card") {
    return (
      <svg
        className="pointer-events-none absolute inset-0 h-full w-full"
        viewBox="0 0 100 130"
        preserveAspectRatio="xMidYMid slice"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden
      >
        <defs>
          <filter id={filterId} x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur in="SourceGraphic" stdDeviation="0.45" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <g stroke={accentColor} style={{ color: accentColor }}>
          <path
            className="powerup-lightning-bolt"
            filter={`url(#${filterId})`}
            d="M 52 22 L 55 38 L 49 41 L 56 56 L 50 60 L 57 76 L 52 80 L 58 100"
          />
          <path
            className="powerup-lightning-bolt powerup-lightning-bolt--delay-1"
            filter={`url(#${filterId})`}
            d="M 42 26 L 39 40 L 45 44 L 37 58 L 44 62 L 38 78 L 45 82 L 40 100"
          />
          <path
            className="powerup-lightning-bolt powerup-lightning-bolt--delay-2"
            filter={`url(#${filterId})`}
            d="M 48 30 L 51 46 L 46 50 L 53 66 L 48 70 L 54 86 L 49 90 L 53 104"
          />
        </g>
      </svg>
    );
  }
  return (
    <svg
      className="pointer-events-none mx-auto h-12 w-[52%] shrink-0 sm:h-14"
      viewBox="0 0 80 52"
      preserveAspectRatio="xMidYMin meet"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <defs>
        <filter id={filterId} x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur in="SourceGraphic" stdDeviation="0.35" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>
      <g stroke={accentColor} style={{ color: accentColor }}>
        <path
          className="powerup-lightning-bolt"
          filter={`url(#${filterId})`}
          d="M 40 2 L 37 16 L 43 20 L 35 34 L 42 38 L 36 50 L 43 52"
        />
        <path
          className="powerup-lightning-bolt powerup-lightning-bolt--delay-1"
          filter={`url(#${filterId})`}
          d="M 48 4 L 51 14 L 46 18 L 52 30 L 47 34 L 53 46 L 48 50"
        />
      </g>
    </svg>
  );
}

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

                <LightningBolts accentColor={addon.accentColor} scopeId={addon.id} variant="card" />

                <div className="relative z-[2] flex h-full items-center justify-center px-6 pb-8 pt-6 pointer-events-none">
                  <Image
                    src="/White-Bizzi.png"
                    alt=""
                    width={200}
                    height={200}
                    className="h-auto w-[min(48%,8.5rem)] select-none drop-shadow-[0_2px_12px_rgba(0,0,0,0.12)] sm:w-[min(46%,9rem)]"
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

              <LightningBolts accentColor={addon.accentColor} scopeId={`${addon.id}-spill`} variant="spill" />

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
