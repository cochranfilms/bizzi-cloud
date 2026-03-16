/**
 * Shared Bizzi design tokens for Tailwind.
 * Used by web app and desktop Electron app.
 */
module.exports = {
  theme: {
    extend: {
      colors: {
        "bizzi-blue": "#00BFFF",
        "bizzi-cyan": "#00D4FF",
        "bizzi-navy": "#1e3a5f",
        "bizzi-sky": "#e8f4fc",
      },
      fontFamily: {
        sans: ["var(--font-geist-sans)", "system-ui", "sans-serif"],
        mono: ["var(--font-geist-mono)", "monospace"],
      },
    },
  },
};
