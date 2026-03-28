import type { Config } from "tailwindcss";
import bizziPreset from "./tailwind.bizzi.preset";

const config: Config = {
  presets: [bizziPreset as unknown as Config],
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
    /** Needed for card layout helpers (e.g. aspect-portrait) and any other lib-only class strings */
    "./src/lib/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Bizzi tokens come from tailwind.bizzi.preset.js
      aspectRatio: {
        /** Dashboard file/folder card “portrait” ratio (was aspect-[3/4], not scanned before src/lib was in content) */
        portrait: "3 / 4",
      },
    },
  },
  plugins: [],
};

export default config;
