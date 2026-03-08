/** Gallery background color options – neutral tones for client gallery view */
export interface GalleryBackgroundTheme {
  id: string;
  name: string;
  /** CSS background color (hex or rgb) */
  background: string;
  /** Text color for contrast – "dark" or "light" */
  textTone: "dark" | "light";
}

export const GALLERY_BACKGROUND_THEMES: GalleryBackgroundTheme[] = [
  { id: "white", name: "White", background: "#ffffff", textTone: "dark" },
  { id: "off-white", name: "Off-white", background: "#fafafa", textTone: "dark" },
  { id: "cream", name: "Cream", background: "#f5f0e8", textTone: "dark" },
  { id: "warm-beige", name: "Warm beige", background: "#ebe6df", textTone: "dark" },
  { id: "light-gray", name: "Light gray", background: "#f0f0f0", textTone: "dark" },
  { id: "slate-50", name: "Slate", background: "#f8fafc", textTone: "dark" },
  { id: "stone", name: "Stone", background: "#e7e5e4", textTone: "dark" },
  { id: "neutral-100", name: "Neutral", background: "#f5f5f5", textTone: "dark" },
  { id: "charcoal", name: "Charcoal", background: "#2d2d2d", textTone: "light" },
  { id: "black", name: "Black", background: "#0a0a0a", textTone: "light" },
];

export function getGalleryBackgroundTheme(id: string | null | undefined): GalleryBackgroundTheme {
  if (!id) return GALLERY_BACKGROUND_THEMES.find((t) => t.id === "warm-beige") ?? GALLERY_BACKGROUND_THEMES[0];
  const theme = GALLERY_BACKGROUND_THEMES.find((t) => t.id === id);
  return theme ?? GALLERY_BACKGROUND_THEMES[0];
}
