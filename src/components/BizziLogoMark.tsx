import Image from "next/image";
import type { CSSProperties } from "react";

type BizziLogoMarkProps = {
  width: number;
  height: number;
  className?: string;
  style?: CSSProperties;
  alt?: string;
  priority?: boolean;
  unoptimized?: boolean;
  /** Prefer `/logo-dark.png` when the surrounding chrome is dark but `html` may not have `.dark` (e.g. gallery themes). */
  forceDarkAppearance?: boolean;
};

/** Wordless mark: `/logo.png` in light UI, `/logo-dark.png` when `html` has `.dark`. */
export default function BizziLogoMark({
  width,
  height,
  className = "",
  style,
  alt,
  priority,
  unoptimized,
  forceDarkAppearance = false,
}: BizziLogoMarkProps) {
  const baseClass = `object-contain ${className}`.trim();

  const visibleAlt = alt === undefined ? "Bizzi Byte" : alt;
  const lightImgClass = forceDarkAppearance
    ? `${baseClass} hidden`.trim()
    : `${baseClass} dark:hidden`.trim();
  const darkImgClass = forceDarkAppearance
    ? `${baseClass} block`.trim()
    : `${baseClass} hidden dark:block`.trim();

  return (
    <>
      <Image
        src="/logo.png"
        alt={visibleAlt}
        width={width}
        height={height}
        className={lightImgClass}
        style={style}
        priority={priority}
        unoptimized={unoptimized}
      />
      <Image
        src="/logo-dark.png"
        alt=""
        aria-hidden
        width={width}
        height={height}
        className={darkImgClass}
        style={style}
        priority={priority}
        unoptimized={unoptimized}
      />
    </>
  );
}
