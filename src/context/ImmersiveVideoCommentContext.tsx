"use client";

import { createContext, useContext, type ReactNode } from "react";

export type ImmersiveVideoCommentContextValue = {
  /** Pauses playback and returns the current time in seconds, or null if no player is bound. */
  pauseAndGetTimestamp: () => number | null;
  /** Hex color for the timecode badge (custom button / dashboard chrome primary). */
  badgeColorHex: string;
};

const ImmersiveVideoCommentContext = createContext<ImmersiveVideoCommentContextValue | null>(
  null,
);

export function ImmersiveVideoCommentProvider({
  value,
  children,
}: {
  value: ImmersiveVideoCommentContextValue | null;
  children: ReactNode;
}) {
  return (
    <ImmersiveVideoCommentContext.Provider value={value}>
      {children}
    </ImmersiveVideoCommentContext.Provider>
  );
}

export function useImmersiveVideoCommentOptional(): ImmersiveVideoCommentContextValue | null {
  return useContext(ImmersiveVideoCommentContext);
}
