/**
 * WCAG relative luminance for sRGB hex (e.g. #rrggbb). Used to pick light vs dark UI tokens from a page background.
 */
export function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function linearizeChannel(c: number): number {
  const s = c / 255;
  return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
}

export function relativeLuminanceSrgb(hex: string): number {
  const rgb = hexToRgb(hex);
  if (!rgb) return 0.5;
  const r = linearizeChannel(rgb.r);
  const g = linearizeChannel(rgb.g);
  const b = linearizeChannel(rgb.b);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** When true, use `html.dark` so Tailwind `dark:` chrome (light text) reads well on the chosen background. */
export function shouldUseDarkUiTokensForPageBackground(pageBackgroundHex: string): boolean {
  return relativeLuminanceSrgb(pageBackgroundHex) < 0.45;
}
