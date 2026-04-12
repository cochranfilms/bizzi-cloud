import { ImageIcon } from "lucide-react";

type Props = {
  caption?: string;
  aspect?: "video" | "wide" | "square";
};

const aspectClass = {
  video: "aspect-video",
  wide: "aspect-[21/9]",
  square: "aspect-square",
} as const;

/** Placeholder slot for future screenshots, demos, or UI captures */
export default function ExploreMediaPlaceholder({ caption, aspect = "video" }: Props) {
  return (
    <figure
      className="overflow-hidden rounded-2xl border border-dashed border-neutral-300 bg-gradient-to-br from-neutral-50 to-bizzi-sky/40 dark:border-neutral-600 dark:from-neutral-900 dark:to-neutral-800/80"
      data-explore-region="media-placeholder"
    >
      <div
        className={`flex ${aspectClass[aspect]} w-full flex-col items-center justify-center gap-2 text-neutral-400 dark:text-neutral-500`}
      >
        <ImageIcon className="h-10 w-10 opacity-60" aria-hidden />
        <span className="text-xs font-medium uppercase tracking-wide">Media placeholder</span>
      </div>
      {caption ? (
        <figcaption className="border-t border-neutral-200/80 px-4 py-2 text-center text-xs text-neutral-500 dark:border-neutral-700 dark:text-neutral-400">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}
