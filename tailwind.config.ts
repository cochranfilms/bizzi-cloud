import type { Config } from "tailwindcss";
import bizziPreset from "./tailwind.bizzi.preset";

const config: Config = {
  presets: [bizziPreset as unknown as Config],
  darkMode: "class",
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      // Bizzi tokens come from tailwind.bizzi.preset.js
    },
  },
  plugins: [],
};

export default config;
