/**
 * Builtin LUT registry - predefined LUTs shipped with the app.
 * Extensible for future presets (Canon Log, BMD Film, etc.).
 */

export interface BuiltinLUT {
  id: string;
  name: string;
  publicPath: string;
  inputProfile: string;
  outputProfile: string;
  appliesTo: ("image" | "video")[];
}

export const BUILTIN_LUTS: BuiltinLUT[] = [
  {
    id: "sony_rec709",
    name: "Sony Rec 709",
    publicPath: "/CINECOLOR_S-LOG3.cube",
    inputProfile: "S-Log3",
    outputProfile: "Rec.709",
    appliesTo: ["video"],
  },
  // Future: canon_log_rec709, bmd_film_rec709, neutral_preview, creative_warm, creative_contrast
];

export function getBuiltinLUT(id: string): BuiltinLUT | null {
  return BUILTIN_LUTS.find((l) => l.id === id) ?? null;
}

export function getBuiltinLUTUrl(id: string): string | null {
  const lut = getBuiltinLUT(id);
  return lut ? lut.publicPath : null;
}

export function getBuiltinLUTsForMedia(media: "image" | "video"): BuiltinLUT[] {
  return BUILTIN_LUTS.filter((l) => l.appliesTo.includes(media));
}
