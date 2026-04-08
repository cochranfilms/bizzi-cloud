"use client";

import { useMemo } from "react";
import { usePathname } from "next/navigation";
import { useThemeResolved } from "@/context/ThemeContext";
import { useDashboardAppearanceOptional } from "@/context/DashboardAppearanceContext";
import { useEnterpriseOptional } from "@/context/EnterpriseContext";
import { usePersonalTeamWorkspace } from "@/context/PersonalTeamWorkspaceContext";
import { resolveImmersiveWorkspaceAccent } from "@/lib/immersive-workspace-accent";
import { hexToRgb, immersiveAppVariantBackdropStyle } from "@/lib/immersive-app-backdrop";

const CLOUDS_BG = "/clouds-bg.jpeg";

type TransfersFolderImmersiveBackdropProps = {
  /** Extra classes on the cloud image (e.g. list row rounding). */
  imgClassName?: string;
};

/**
 * Clouds image + the same theme-aware gradient stack as immersive file preview (app variant),
 * for Storage “Transfers” system folder tiles.
 */
export default function TransfersFolderImmersiveBackdrop({
  imgClassName = "",
}: TransfersFolderImmersiveBackdropProps) {
  const pathname = usePathname();
  const theme = useThemeResolved();
  const isDark = theme === "dark";
  const appearance = useDashboardAppearanceOptional();
  const enterprise = useEnterpriseOptional();
  const teamWs = usePersonalTeamWorkspace();

  const workspaceAccent = useMemo(
    () =>
      resolveImmersiveWorkspaceAccent({
        pathname,
        orgTheme: enterprise?.org?.theme ?? enterprise?.organization?.theme,
        teamThemeId: teamWs?.teamThemeId,
        dashboardAccentHex: appearance?.accentColor ?? "#00BFFF",
      }),
    [
      pathname,
      enterprise?.org?.theme,
      enterprise?.organization?.theme,
      teamWs?.teamThemeId,
      appearance?.accentColor,
    ]
  );

  const rgb = useMemo(() => hexToRgb(workspaceAccent), [workspaceAccent]);
  const accentRgb = rgb ? `${rgb.r},${rgb.g},${rgb.b}` : "0,191,255";

  const overlayStyle = useMemo(
    () => immersiveAppVariantBackdropStyle({ accentRgb, isDark, pathname }),
    [accentRgb, isDark, pathname]
  );

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-img-element -- small public static asset */}
      <img
        src={CLOUDS_BG}
        alt=""
        className={`pointer-events-none absolute inset-0 z-0 h-full w-full object-cover object-[center_28%] ${imgClassName}`.trim()}
        aria-hidden
      />
      <div
        className="pointer-events-none absolute inset-0 z-[1]"
        style={overlayStyle}
        aria-hidden
      />
    </>
  );
}
