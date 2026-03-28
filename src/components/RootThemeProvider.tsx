"use client";

import { ThemeProvider } from "@/context/ThemeContext";

/**
 * Single app-wide theme provider so `document.documentElement` `.dark` matches
 * user preference on every route (marketing, auth, dashboard, admin).
 */
export function RootThemeProvider({ children }: { children: React.ReactNode }) {
  return <ThemeProvider>{children}</ThemeProvider>;
}
