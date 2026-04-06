"use client";

import { LayoutSettingsProvider } from "@/context/LayoutSettingsContext";

export default function PublicShareLayout({ children }: { children: React.ReactNode }) {
  return <LayoutSettingsProvider>{children}</LayoutSettingsProvider>;
}
