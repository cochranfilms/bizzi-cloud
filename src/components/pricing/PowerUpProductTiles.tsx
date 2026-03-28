"use client";

import { useCallback, useId, useState } from "react";
import type { KeyboardEvent } from "react";

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

const TILE_GRADIENTS: Record<string, string> = {
  gallery:
    "linear-gradient(168deg, #fff7ed 0%, #fdba74 38%, #d97706 72%, #9a3412 100%)",
  editor:
    "linear-gradient(168deg, #faf5ff 0%, #c4b5fd 40%, #7c3aed 78%, #4c1d95 100%)",
  fullframe:
    "linear-gradient(168deg, #ecfdf5 0%, #5eead4 42%, #0d9488 78%, #115e59 100%)",
};

export type PowerUpAddonTile = {
  id: string;
  name: string;
  price: number;
  accentColor: string;
  bundleNote?: string;
};

function GalleryGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M14 32l7-10 6 8 4-5 7 7H14z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <circle cx="18" cy="18" r="2.75" stroke="currentColor" strokeWidth="1.75" />
      <rect
        x="8"
        y="10"
        width="32"
        height="28"
        rx="4"
        stroke="currentColor"
        strokeWidth="1.75"
      />
    </svg>
  );
}

function EditorGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <rect
        x="10"
        y="14"
        width="28"
        height="20"
        rx="2.5"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M10 18h4.5v12H10V18zm27.5 0H42v12h-4.5V18z"
        fill="currentColor"
        opacity="0.35"
      />
      <path
        d="M17 22h14M17 26h10"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}

function FullFrameGlyph({ className }: { className?: string }) {
  return (
    <svg
      className={className}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden
    >
      <path
        d="M12 30l8-12 6 8 5-6 7 10H12z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
      />
      <rect
        x="10"
        y="12"
        width="28"
        height="10"
        rx="2"
        stroke="currentColor"
        strokeWidth="1.75"
      />
      <path
        d="M14 16h20M14 19h12"
        stroke="currentColor"
        strokeWidth="1.25"
        strokeLinecap="round"
        opacity="0.7"
      />
    </svg>
  );
}

function TileGlyph({ id, className }: { id: string; className?: string }) {
  switch (id) {
    case "gallery":
      return <GalleryGlyph className={className} />;
    case "editor":
      return <EditorGlyph className={className} />;
    default:
      return <FullFrameGlyph className={className} />;
  }
}

type PowerUpProductTilesProps = {
  addons: PowerUpAddonTile[];
};

export default function PowerUpProductTiles({ addons }: PowerUpProductTilesProps) {
  const [pinnedId, setPinnedId] = useState<string | null>(null);
  const sectionHintId = useId();

  const togglePin = useCallback((id: string) => {
    setPinnedId((cur) => (cur === id ? null : id));
  }, []);

  return (
    <>
      <p id={sectionHintId} className="sr-only">
        Hover a tile to see highlights. Click or press Enter to keep the summary open.
      </p>
      <div className="grid gap-10 sm:grid-cols-2 sm:gap-8 lg:grid-cols-3 lg:gap-10">
        {addons.map((addon) => {
          const summary = TILE_SUMMARIES[addon.id] ?? [];
          const gradient = TILE_GRADIENTS[addon.id] ?? TILE_GRADIENTS.gallery;
          const panelId = `powerup-panel-${addon.id}`;
          const expanded = pinnedId === addon.id;

          return (
            <div
              key={addon.id}
              className="flex min-w-0 flex-col items-center text-center"
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
              <div className="absolute inset-0" style={{ background: gradient }} />

              <div className="absolute inset-0 flex items-center justify-center pb-6 pt-4 pointer-events-none">
                <div className="rounded-full bg-white/[0.16] p-7 ring-1 ring-white/22">
                  <TileGlyph id={addon.id} className="h-14 w-14 text-white sm:h-16 sm:w-16" />
                </div>
              </div>

              <div
                id={panelId}
                role="region"
                aria-label={`${addon.name} highlights`}
                className={`absolute inset-0 flex items-center justify-center p-6 transition-opacity duration-300 ease-out motion-reduce:transition-none ${
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

            <h4 className="mt-8 max-w-[280px] text-xl font-semibold tracking-tight text-neutral-900 dark:text-white sm:text-[1.35rem]">
              {addon.name}
            </h4>
            <p className="mt-2 text-sm font-medium text-neutral-500 dark:text-neutral-400">
              <span style={{ color: addon.accentColor }} className="font-semibold">
                +${addon.price}
              </span>
              <span className="font-normal text-neutral-500 dark:text-neutral-400">
                {" "}
                /mo
              </span>
            </p>
            {addon.bundleNote ? (
              <p
                className="mt-1 max-w-[260px] text-xs font-medium opacity-90"
                style={{ color: addon.accentColor }}
              >
                ✦ {addon.bundleNote}
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
