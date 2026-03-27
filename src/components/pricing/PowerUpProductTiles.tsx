"use client";

import { useCallback, useId, useState } from "react";
import type { MouseEvent } from "react";

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

  const togglePin = useCallback((id: string, e: MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setPinnedId((cur) => (cur === id ? null : id));
  }, []);

  return (
    <>
      <p id={sectionHintId} className="sr-only">
        Hover a tile or use the plus control to read a short feature summary.
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
              className="group relative w-full max-w-[340px] overflow-hidden rounded-[2.25rem] shadow-[0_22px_50px_-18px_rgba(15,23,42,0.35)] ring-1 ring-black/[0.06] motion-reduce:transition-none dark:ring-white/10 sm:max-w-none"
              style={{ aspectRatio: "1 / 1.08" }}
            >
              <div
                className="absolute inset-0 scale-105 motion-reduce:scale-100"
                style={{ background: gradient }}
              />
              <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_50%_120%,rgba(255,255,255,0.35),transparent_55%)] opacity-90 motion-reduce:opacity-100" />

              <div className="absolute inset-0 flex items-center justify-center pb-6 pt-4 pointer-events-none">
                <div className="rounded-full bg-white/15 p-7 shadow-inner backdrop-blur-[2px] ring-1 ring-white/25">
                  <TileGlyph
                    id={addon.id}
                    className="h-14 w-14 text-white drop-shadow-md sm:h-16 sm:w-16"
                  />
                </div>
              </div>

              <div
                id={panelId}
                role="region"
                aria-label={`${addon.name} highlights`}
                className={`absolute inset-0 flex items-center justify-center p-6 transition-all duration-300 ease-out motion-reduce:transition-none ${
                  expanded
                    ? "opacity-100 backdrop-blur-md"
                    : "pointer-events-none opacity-0 backdrop-blur-none group-hover:pointer-events-auto group-hover:opacity-100 group-hover:backdrop-blur-md group-focus-within:pointer-events-auto group-focus-within:opacity-100 group-focus-within:backdrop-blur-md"
                } ${expanded ? "pointer-events-auto" : ""}`}
                style={{
                  background: `linear-gradient(145deg, ${addon.accentColor}55, rgba(255,255,255,0.22))`,
                }}
              >
                <ul
                  className={`w-full max-w-[220px] space-y-2.5 text-left text-[13px] font-medium leading-snug text-white drop-shadow-sm transition duration-300 motion-reduce:transition-none sm:text-sm ${
                    expanded
                      ? "translate-y-0 opacity-100"
                      : "translate-y-1 opacity-0 group-hover:translate-y-0 group-hover:opacity-100 group-focus-within:translate-y-0 group-focus-within:opacity-100"
                  }`}
                >
                  {summary.map((line) => (
                    <li key={line} className="flex gap-2.5">
                      <span className="mt-[0.35em] h-1 w-1 shrink-0 rounded-full bg-white/90" />
                      <span>{line}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <button
                type="button"
                aria-expanded={expanded}
                aria-controls={panelId}
                aria-describedby={sectionHintId}
                className="absolute bottom-4 right-4 z-10 flex h-11 w-11 items-center justify-center rounded-full bg-neutral-950 text-lg font-light leading-none text-white shadow-lg transition-transform hover:scale-105 active:scale-95 motion-reduce:transition-none dark:bg-white dark:text-neutral-950"
                onClick={(e) => togglePin(addon.id, e)}
              >
                <span className="sr-only">
                  {expanded ? "Hide" : "Show"} {addon.name} summary
                </span>
                <span aria-hidden className="relative -top-px">
                  +
                </span>
              </button>
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
