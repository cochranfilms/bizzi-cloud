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
      keyframes: {
        "landing-marquee": {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
      animation: {
        "landing-marquee": "landing-marquee 48s linear infinite",
      },
    },
  },
  plugins: [],
};

export default config;
