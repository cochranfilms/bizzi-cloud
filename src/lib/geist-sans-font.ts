import localFont from "next/font/local";

/**
 * Geist Sans with preload disabled — avoids Chrome warnings when the font
 * is preloaded but not applied within a few seconds (e.g. on routes that
 * barely use it). Matches `geist/font/sans` variable name for drop-in use.
 */
export const GeistSans = localFont({
  src: "../../node_modules/geist/dist/fonts/geist-sans/Geist-Variable.woff2",
  variable: "--font-geist-sans",
  weight: "100 900",
  adjustFontFallback: false,
  preload: false,
});
