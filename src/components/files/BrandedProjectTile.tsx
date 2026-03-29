"use client";

import type { CreativeProjectTileVariant, CreativeTileBrandId } from "@/lib/creative-project-thumbnail";
import {
  resolveCreativeProjectTile,
  type CreativeProjectThumbnailSource,
} from "@/lib/creative-project-thumbnail";

function cx(...parts: (string | undefined | false | null)[]): string {
  return parts.filter(Boolean).join(" ");
}

export type BrandedProjectTileSize = "sm" | "md" | "lg" | "xl";

const SIZE_MAP: Record<
  BrandedProjectTileSize,
  { pad: string; radius: string; mark: string; ext: string; chip: string }
> = {
  sm: { pad: "p-1.5", radius: "rounded-md", mark: "h-7 w-7", ext: "text-[9px]", chip: "text-[8px] px-1 py-px" },
  md: { pad: "p-2", radius: "rounded-lg", mark: "h-9 w-9", ext: "text-[10px]", chip: "text-[9px] px-1 py-0.5" },
  lg: { pad: "p-2.5", radius: "rounded-xl", mark: "h-12 w-12", ext: "text-xs", chip: "text-[10px] px-1.5 py-0.5" },
  xl: { pad: "p-6", radius: "rounded-2xl", mark: "h-20 w-20", ext: "text-sm", chip: "text-xs px-2 py-0.5" },
};

function FoldCorner({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "pointer-events-none absolute right-0 top-0 h-4 w-4 overflow-hidden",
        className
      )}
      aria-hidden
    >
      <div className="absolute right-0 top-0 h-6 w-6 origin-top-right rotate-45 translate-x-2 -translate-y-2 bg-white/18 shadow-sm dark:bg-white/10" />
    </div>
  );
}

function PremiereMark({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "relative flex flex-col items-center justify-center rounded-lg bg-[#1a0f2e] shadow-inner",
        className
      )}
    >
      <span className="text-[0.65em] font-bold leading-none tracking-tight text-[#c4a8ff] sm:text-[0.7em]">
        Pr
      </span>
      <span className="mt-0.5 text-[0.35em] font-semibold uppercase tracking-wider text-white/90">
        PROJ
      </span>
    </div>
  );
}

function FinalCutMark({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-lg bg-gradient-to-b from-neutral-700 to-neutral-900 shadow-inner",
        className
      )}
    >
      <div className="absolute left-0 right-0 top-0 h-[38%] origin-top-left -rotate-6 bg-[repeating-linear-gradient(-45deg,#f5f5f5_0px,#f5f5f5_4px,#171717_4px,#171717_8px)] dark:from-neutral-100 dark:to-neutral-200" />
      <div className="absolute inset-x-[12%] bottom-[14%] top-[44%] rounded-md bg-[conic-gradient(from_180deg_at_50%_50%,#ef4444,#f59e0b,#22c55e,#3b82f6,#a855f7,#ef4444)] opacity-95 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]" />
    </div>
  );
}

function ResolveMark({ className }: { className?: string }) {
  return (
    <div className={cx("relative flex items-center justify-center rounded-lg bg-neutral-900 shadow-inner", className)}>
      <div className="relative h-[55%] w-[55%]">
        <div className="absolute left-1/2 top-1/2 h-[42%] w-[42%] -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#3b82f6] opacity-95 shadow-sm" />
        <div className="absolute left-[8%] top-[28%] h-[38%] w-[38%] rounded-full bg-[#22c55e] opacity-95 shadow-sm" />
        <div className="absolute bottom-[12%] right-[10%] h-[36%] w-[36%] rounded-full bg-[#f43f5e] opacity-95 shadow-sm" />
      </div>
    </div>
  );
}

function AfterEffectsMark({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "flex items-center justify-center rounded-lg bg-gradient-to-br from-[#1b1035] to-[#2d1854] shadow-inner",
        className
      )}
    >
      <span className="text-[0.55em] font-bold text-[#d4b5ff]">Ae</span>
    </div>
  );
}

function LightroomMark({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "flex items-center justify-center rounded-lg bg-gradient-to-br from-sky-900 to-sky-950 shadow-inner",
        className
      )}
    >
      <span className="text-[0.5em] font-bold text-sky-200">Lr</span>
    </div>
  );
}

function PhotoshopMark({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "flex items-center justify-center rounded-lg bg-[#001e36] shadow-inner",
        className
      )}
    >
      <span className="text-[0.5em] font-bold text-[#31a8ff]">Ps</span>
    </div>
  );
}

function IllustratorMark({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "flex items-center justify-center rounded-lg bg-[#330000] shadow-inner",
        className
      )}
    >
      <span className="text-[0.5em] font-bold text-[#ff9a00]">Ai</span>
    </div>
  );
}

function InterchangeMark({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "flex items-center justify-center rounded-lg bg-gradient-to-br from-neutral-600 to-neutral-800 shadow-inner",
        className
      )}
    >
      <svg viewBox="0 0 24 24" className="h-[45%] w-[45%] text-white/85" fill="none" aria-hidden>
        <path
          d="M6 17V7l5 5-5 5M13 7h5M13 12h4M13 17h5"
          stroke="currentColor"
          strokeWidth="1.75"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
    </div>
  );
}

function GenericCreativeMark({ className }: { className?: string }) {
  return (
    <div
      className={cx(
        "flex items-center justify-center rounded-lg bg-gradient-to-br from-neutral-500/30 to-neutral-700/40 shadow-inner dark:from-neutral-600/40 dark:to-neutral-800/50",
        className
      )}
    >
      <svg viewBox="0 0 24 24" className="h-[42%] w-[42%] text-neutral-200 dark:text-neutral-300" fill="currentColor" aria-hidden>
        <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8l-6-6z" opacity="0.9" />
      </svg>
    </div>
  );
}

function BrandMark({
  brandId,
  sizeClass,
}: {
  brandId: CreativeTileBrandId;
  sizeClass: string;
}) {
  switch (brandId) {
    case "premiere_pro":
      return <PremiereMark className={sizeClass} />;
    case "final_cut_pro":
      return <FinalCutMark className={sizeClass} />;
    case "davinci_resolve":
      return <ResolveMark className={sizeClass} />;
    case "after_effects":
      return <AfterEffectsMark className={sizeClass} />;
    case "lightroom":
      return <LightroomMark className={sizeClass} />;
    case "photoshop":
      return <PhotoshopMark className={sizeClass} />;
    case "illustrator":
      return <IllustratorMark className={sizeClass} />;
    case "interchange":
      return <InterchangeMark className={sizeClass} />;
    default:
      return <GenericCreativeMark className={sizeClass} />;
  }
}

function tileSurfaceClass(brandId: CreativeTileBrandId): string {
  switch (brandId) {
    case "premiere_pro":
      return "from-[#2e1a4d]/95 to-[#150a24] border-[#c4a8ff]/25";
    case "final_cut_pro":
      return "from-neutral-800/95 to-neutral-950 border-neutral-500/20";
    case "davinci_resolve":
      return "from-neutral-700/90 to-neutral-950 border-neutral-400/15";
    case "after_effects":
      return "from-[#2d1854]/92 to-[#13081f] border-violet-400/20";
    case "lightroom":
      return "from-sky-950/90 to-neutral-950 border-sky-400/20";
    case "photoshop":
      return "from-[#001e36]/95 to-[#000814] border-[#31a8ff]/25";
    case "illustrator":
      return "from-[#330000]/95 to-[#1a0505] border-[#ff9a00]/25";
    case "interchange":
      return "from-neutral-700/88 to-neutral-900 border-neutral-500/18";
    default:
      return "from-neutral-600/35 to-neutral-900/90 border-neutral-400/20 dark:from-neutral-700/50 dark:to-neutral-950";
  }
}

export function BrandedProjectTile({
  brandId,
  tileVariant,
  fileName,
  displayLabel,
  extensionLabel,
  size = "md",
  className,
  showInnerCaption = true,
}: {
  brandId: CreativeTileBrandId;
  tileVariant: CreativeProjectTileVariant;
  fileName: string;
  displayLabel: string;
  extensionLabel: string;
  size?: BrandedProjectTileSize;
  className?: string;
  /** When false, only the mark + footer label (for tiny list thumbs). */
  showInnerCaption?: boolean;
}) {
  const s = SIZE_MAP[size];
  const surface = tileSurfaceClass(brandId);
  const isArchive = tileVariant === "archive_container";
  const innerCaption = showInnerCaption && size !== "sm";

  return (
    <div
      className={cx(
        "relative flex h-full w-full flex-col overflow-hidden border bg-gradient-to-br shadow-sm",
        surface,
        s.pad,
        s.radius,
        isArchive && "ring-1 ring-amber-500/35 dark:ring-amber-400/25",
        className
      )}
      title={fileName}
    >
      <FoldCorner />
      {isArchive ? (
        <span
          className={cx(
            "absolute left-2 top-2 z-[1] font-medium uppercase tracking-wide text-amber-200/95 dark:text-amber-300/95",
            s.chip
          )}
        >
          Archive
        </span>
      ) : null}
      <div className="relative z-0 flex min-h-0 flex-1 flex-col items-center justify-center gap-1">
        <div className={cx("shrink-0 drop-shadow-md", s.mark)}>
          <BrandMark brandId={brandId} sizeClass="h-full w-full" />
        </div>
        {innerCaption ? (
          <div className="w-full min-w-0 px-0.5 text-center">
            <p
              className={cx(
                "truncate font-semibold leading-tight text-white/95 dark:text-white",
                size === "md" ? "text-[11px]" : "text-xs"
              )}
              title={fileName}
            >
              {fileName}
            </p>
            {extensionLabel ? (
              <p className={cx("mt-0.5 font-medium uppercase tracking-wide text-white/55", s.ext)}>
                {extensionLabel.startsWith(".") ? extensionLabel : `.${extensionLabel}`}
              </p>
            ) : null}
          </div>
        ) : extensionLabel ? (
          <span className={cx("font-medium uppercase tracking-wide text-white/60", s.ext)}>
            {extensionLabel.startsWith(".") ? extensionLabel : `.${extensionLabel}`}
          </span>
        ) : null}
      </div>
      {size !== "sm" ? (
        <p
          className="mt-auto truncate text-center text-[10px] font-medium text-white/50 dark:text-white/45"
          title={displayLabel}
        >
          {displayLabel}
        </p>
      ) : null}
    </div>
  );
}

export function BrandedProjectTileFromSource({
  source,
  size = "md",
  className,
}: {
  source: CreativeProjectThumbnailSource;
  size?: BrandedProjectTileSize;
  className?: string;
}) {
  const r = resolveCreativeProjectTile(source);
  if (r.mode !== "branded_project") return null;
  return (
    <BrandedProjectTile
      brandId={r.brandId}
      tileVariant={r.tileVariant}
      fileName={source.name}
      displayLabel={r.displayLabel}
      extensionLabel={r.extensionLabel}
      size={size}
      className={className}
    />
  );
}
