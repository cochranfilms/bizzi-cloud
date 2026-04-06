"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useMemo,
  useCallback,
} from "react";

const STORAGE_KEY = "bizzi-layout-settings";

export type ViewMode = "list" | "grid" | "thumbnail";
export type CardSize = "small" | "medium" | "large";
export type AspectRatio = "landscape" | "square" | "portrait";
export type ThumbnailScale = "fit" | "fill";

export interface LayoutSettings {
  viewMode: ViewMode;
  cardSize: CardSize;
  aspectRatio: AspectRatio;
  thumbnailScale: ThumbnailScale;
  showCardInfo: boolean;
}

const DEFAULT_SETTINGS: LayoutSettings = {
  viewMode: "grid",
  cardSize: "medium",
  aspectRatio: "landscape",
  thumbnailScale: "fit",
  showCardInfo: true,
};

interface LayoutSettingsContextType extends LayoutSettings {
  setViewMode: (mode: ViewMode) => void;
  setCardSize: (size: CardSize) => void;
  setAspectRatio: (ratio: AspectRatio) => void;
  setThumbnailScale: (scale: ThumbnailScale) => void;
  setShowCardInfo: (show: boolean) => void;
}

const LayoutSettingsContext = createContext<LayoutSettingsContextType | undefined>(
  undefined
);

function loadStored(): LayoutSettings {
  if (typeof window === "undefined") return DEFAULT_SETTINGS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(raw) as Partial<LayoutSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

function saveStored(settings: LayoutSettings) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

export function LayoutSettingsProvider({ children }: { children: React.ReactNode }) {
  const [settings, setSettings] = useState<LayoutSettings>(DEFAULT_SETTINGS);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    setSettings(loadStored());
  }, []);

  const update = useCallback((partial: Partial<LayoutSettings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...partial };
      saveStored(next);
      return next;
    });
  }, []);

  const contextValue: LayoutSettingsContextType = useMemo(
    () => ({
      ...settings,
      setViewMode: (mode) => update({ viewMode: mode }),
      setCardSize: (size) => update({ cardSize: size }),
      setAspectRatio: (ratio) => update({ aspectRatio: ratio }),
      setThumbnailScale: (scale) => update({ thumbnailScale: scale }),
      setShowCardInfo: (show) => update({ showCardInfo: show }),
    }),
    [settings, update]
  );

  return (
    <LayoutSettingsContext.Provider value={contextValue}>
      {children}
    </LayoutSettingsContext.Provider>
  );
}

export function useLayoutSettings() {
  const context = useContext(LayoutSettingsContext);
  if (context === undefined) {
    throw new Error("useLayoutSettings must be used within a LayoutSettingsProvider");
  }
  return context;
}

const LAYOUT_SETTINGS_FALLBACK: LayoutSettingsContextType = {
  ...DEFAULT_SETTINGS,
  setViewMode: () => {},
  setCardSize: () => {},
  setAspectRatio: () => {},
  setThumbnailScale: () => {},
  setShowCardInfo: () => {},
};

/** Same as useLayoutSettings when inside a provider; otherwise dashboard-default layout (e.g. public /s share page). */
export function useLayoutSettingsOptional(): LayoutSettingsContextType {
  const context = useContext(LayoutSettingsContext);
  return context ?? LAYOUT_SETTINGS_FALLBACK;
}
