"use client";

import { useMemo, useEffect, useLayoutEffect, useState, type ReactNode, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { X } from "lucide-react";
import { useThemeResolved } from "@/context/ThemeContext";
import { useDashboardAppearanceOptional } from "@/context/DashboardAppearanceContext";
import { useEnterpriseOptional } from "@/context/EnterpriseContext";
import { usePersonalTeamWorkspace } from "@/context/PersonalTeamWorkspaceContext";
import { resolveImmersiveWorkspaceAccent } from "@/lib/immersive-workspace-accent";
import {
  LANDING_PAGE_GRADIENT_IMMERSIVE_BACKDROP,
  LANDING_PAGE_GRADIENT_IMMERSIVE_BACKDROP_DARK,
} from "@/lib/landing-gradient";

/** Above dashboard TopNavbar (z-60) and mobile drawer (z-50) */
const OVERLAY_Z = 200;

const BACKDROP_BLUR = "blur(56px) saturate(1.08)";

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function workspaceEnvironmentKey(pathname: string | null): "personal" | "team" | "organization" {
  const p = pathname ?? "";
  if (p.startsWith("/enterprise")) return "organization";
  if (p.startsWith("/team/")) return "team";
  return "personal";
}

export interface ImmersiveFilePreviewShellProps {
  onClose: () => void;
  title?: string;
  headerActions?: ReactNode;
  /** Center stage: image, video, PDF area */
  media: ReactNode;
  /** LUT / tools below the media (Drive-style). When set, `sideControls` is ignored. */
  bottomBar?: ReactNode | null;
  /** @deprecated Use `bottomBar`. Shown beside/below media when `bottomBar` is empty. */
  sideControls?: ReactNode | null;
  mediaFooter?: ReactNode | null;
  /** Comments / chat: right column on large screens, full width under stage on small screens. */
  rightRail?: ReactNode | null;
  /** Extra full-width block below the fold when not using `rightRail`. */
  belowFold?: ReactNode | null;
  variant?: "gallery" | "app";
}

/**
 * Portaled immersive preview: blurred dimmed backdrop, workspace-tinted environment, neutral media stage.
 */
export default function ImmersiveFilePreviewShell({
  onClose,
  title,
  headerActions,
  media,
  bottomBar,
  sideControls,
  mediaFooter,
  rightRail,
  belowFold,
  variant = "app",
}: ImmersiveFilePreviewShellProps) {
  const pathname = usePathname();
  const theme = useThemeResolved();
  const isDark = theme === "dark";
  const appearance = useDashboardAppearanceOptional();
  const enterprise = useEnterpriseOptional();
  const teamWs = usePersonalTeamWorkspace();
  const envKey = workspaceEnvironmentKey(pathname);

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

  /** Stronger ambient wash for team/org; personal stays neutral. */
  const ambientStrength = envKey === "personal" ? 0.05 : envKey === "team" ? 0.14 : 0.16;
  const ambientStrengthDark = envKey === "personal" ? 0.07 : envKey === "team" ? 0.18 : 0.22;

  const [mountEl, setMountEl] = useState<HTMLElement | null>(null);
  useLayoutEffect(() => {
    setMountEl(document.body);
  }, []);

  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const isGallery = variant === "gallery";

  const washOpacity = isDark ? ambientStrengthDark : ambientStrength;
  /** Strong blue veil + accent wash so the dashboard recedes; blur works where the engine supports it */
  const backdropStyle: CSSProperties = isGallery
    ? {
        WebkitBackdropFilter: BACKDROP_BLUR,
        backdropFilter: BACKDROP_BLUR,
        backgroundColor: isDark ? "rgba(0,0,0,0.82)" : "rgba(0,0,0,0.64)",
        backgroundImage: `radial-gradient(ellipse 85% 60% at 50% -5%, rgba(${accentRgb},${washOpacity}), transparent 55%), linear-gradient(180deg, rgba(${accentRgb},${washOpacity * 0.45}) 0%, transparent 35%)`,
      }
    : isDark
      ? {
          WebkitBackdropFilter: BACKDROP_BLUR,
          backdropFilter: BACKDROP_BLUR,
          /** Deeper sky gradient (same family as light immersive); white header chrome */
          backgroundColor: "rgba(6, 28, 48, 0.42)",
          backgroundImage: `${LANDING_PAGE_GRADIENT_IMMERSIVE_BACKDROP_DARK}, radial-gradient(ellipse 92% 72% at 50% -8%, rgba(${accentRgb},${Math.max(0.12, washOpacity * 0.4)}), transparent 56%)`,
        }
      : {
          WebkitBackdropFilter: BACKDROP_BLUR,
          backdropFilter: BACKDROP_BLUR,
          /** Landing-page sky gradient (hues) over blur; slightly translucent so the dashboard shows through */
          backgroundColor: "rgba(255, 255, 255, 0.12)",
          backgroundImage: `${LANDING_PAGE_GRADIENT_IMMERSIVE_BACKDROP}, radial-gradient(ellipse 92% 72% at 50% -8%, rgba(${accentRgb},${Math.max(0.08, washOpacity * 0.35)}), transparent 56%)`,
        };

  const headerChromeBorder: CSSProperties = isGallery
    ? { borderBottom: "1px solid rgba(255,255,255,0.22)" }
    : {
        borderWidth: 2,
        borderStyle: "solid",
        borderColor: workspaceAccent,
      };

  const railChromeBorder: CSSProperties | undefined = isGallery
    ? undefined
    : envKey === "personal"
      ? {
          borderWidth: 2,
          borderStyle: "solid",
          borderColor: isDark ? "rgba(120, 120, 120, 0.45)" : "rgba(70, 70, 80, 0.4)",
        }
      : {
          borderWidth: 2,
          borderStyle: "solid",
          borderColor: workspaceAccent,
        };

  const barBg = isGallery
    ? "bg-black/52"
    : isDark
      ? "bg-slate-950/78"
      : "bg-sky-50/55";

  /** App immersive: dark text on light sky backdrop (light theme), white text on deeper sky (dark theme) */
  const titleClass = isGallery ? "text-white/95" : isDark ? "text-white/95" : "text-neutral-900";

  const closeBtn = isGallery
    ? "text-white/90 hover:bg-white/15"
    : isDark
      ? "text-white/90 hover:bg-white/15"
      : "text-neutral-800 hover:bg-neutral-900/10";

  const asideDivider = isGallery
    ? "border-white/15"
    : isDark
      ? "border-neutral-800"
      : "border-neutral-200";

  const hasRight = !!rightRail;
  const hasBelowOnly = !!belowFold && !hasRight;
  const toolsBottom = bottomBar ?? null;
  const toolsSide = toolsBottom == null ? sideControls : null;

  const mediaSlotMaxH = hasRight
    ? "max-h-[min(92dvh,calc(100dvh-5rem))]"
    : hasBelowOnly
      ? "max-h-[min(56dvh,calc(100dvh-13rem))] sm:max-h-[min(58dvh,calc(100dvh-13.5rem))] lg:max-h-[min(62dvh,calc(100dvh-12.5rem))]"
      : "max-h-[min(82dvh,calc(100dvh-6.5rem))] sm:max-h-[min(84dvh,calc(100dvh-7rem))]";

  const panelBaseApp = isDark ? "bg-neutral-950/70 backdrop-blur-xl" : "bg-white/76 backdrop-blur-xl";
  const toolsBarClass = isGallery
    ? "w-full max-w-4xl shrink-0 rounded-xl border border-white/25 bg-black/48 px-3 py-3 shadow-lg backdrop-blur-xl sm:px-4"
    : `w-full max-w-4xl shrink-0 rounded-xl border border-neutral-200/40 px-3 py-3 shadow-md sm:px-4 dark:border-white/10 ${panelBaseApp}`;

  const belowFoldClass = isGallery
    ? "relative z-10 mx-auto mt-2 w-full max-w-3xl shrink-0 rounded-xl border border-white/30 bg-black/45 px-1 pt-5 shadow-[0_8px_40px_rgba(0,0,0,0.35)] sm:mt-4 sm:px-2 sm:pt-7"
    : `relative z-10 mx-auto mt-2 w-full max-w-3xl shrink-0 rounded-xl border border-neutral-200/35 px-1 pt-5 shadow-md sm:mt-4 sm:px-2 sm:pt-7 dark:border-white/10 ${panelBaseApp}`;

  const rightRailOuter = isGallery
    ? "mt-3 flex min-h-0 w-full shrink-0 flex-col rounded-xl border border-white/28 bg-black/48 shadow-[0_8px_40px_rgba(0,0,0,0.35)] backdrop-blur-2xl sm:mt-4 lg:mt-0 lg:max-h-none lg:w-[min(19rem,30vw)] lg:max-w-sm lg:flex-shrink-0 lg:pl-4"
    : "mt-3 flex min-h-0 w-full shrink-0 flex-col rounded-none border-0 bg-neutral-950/75 shadow-md backdrop-blur-2xl sm:mt-4 lg:mt-0 lg:max-h-none lg:w-[min(19rem,30vw)] lg:max-w-sm lg:flex-shrink-0 lg:pl-4";

  const shell = (
    <div
      className="animate-immersive-preview-enter relative flex h-[100dvh] max-h-[100dvh] flex-col overflow-hidden overscroll-contain opacity-0"
      style={{ animationFillMode: "forwards" }}
      role="dialog"
      aria-modal="true"
      aria-label={title ? `Preview: ${title}` : "File preview"}
    >
      <button
        type="button"
        className="absolute inset-0 z-0 cursor-zoom-out border-0 p-0"
        style={backdropStyle}
        aria-label="Close preview"
        onClick={onClose}
      />

      <div
        className="relative z-10 mx-auto flex h-full min-h-0 w-full max-w-[1800px] flex-1 flex-col px-3 pt-[max(0.5rem,env(safe-area-inset-top))] sm:px-5 sm:pt-[max(0.65rem,env(safe-area-inset-top))]"
        onClick={(e) => e.stopPropagation()}
      >
        <header
          className={`relative z-20 mb-2 flex min-h-11 shrink-0 items-center gap-2 rounded-none border-0 px-3 py-2 backdrop-blur-2xl sm:mb-3 sm:px-4 ${barBg}`}
          style={{
            WebkitBackdropFilter: "blur(20px)",
            backdropFilter: "blur(20px)",
            ...headerChromeBorder,
          }}
        >
          {title ? (
            <h2
              className={`min-w-0 flex-1 truncate text-sm font-medium tracking-tight sm:text-base ${titleClass}`}
              title={title}
            >
              {title}
            </h2>
          ) : (
            <div className="flex-1" />
          )}
          {headerActions ? (
            <div className="flex shrink-0 items-center gap-0.5 sm:gap-1">{headerActions}</div>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className={`touch-target-sm ml-auto flex shrink-0 items-center justify-center rounded-none p-2 transition-colors ${closeBtn}`}
            aria-label="Close"
          >
            <X className="h-5 w-5 sm:h-6 sm:w-6" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1 flex-col gap-2 overflow-hidden pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:gap-3">
          <div className="flex min-h-0 w-full flex-1 flex-col lg:flex-row lg:items-stretch lg:gap-4">
            <div className="flex min-h-0 min-w-0 flex-1 flex-col">
              <div
                className={`flex w-full min-h-0 flex-1 flex-col items-center justify-center gap-2 lg:gap-3 ${hasBelowOnly ? "min-h-[min(200px,35dvh)]" : "min-h-0"}`}
              >
                <div className={`flex w-full min-h-0 flex-1 flex-col items-center justify-center ${mediaSlotMaxH}`}>
                  <div className="flex h-full min-h-0 w-full max-w-full items-center justify-center px-0.5 sm:px-2">
                    {media}
                  </div>
                </div>

                {toolsBottom ? (
                  <div className={toolsBarClass}>{toolsBottom}</div>
                ) : null}

                {toolsSide ? (
                  <aside
                    className={`relative z-20 mt-3 w-full shrink-0 border-t pt-4 lg:mt-0 lg:w-80 lg:max-w-[min(20rem,calc(100vw-2rem))] lg:border-l lg:border-t-0 lg:pt-0 xl:w-80 ${asideDivider}`}
                  >
                    {toolsSide}
                  </aside>
                ) : null}

                {mediaFooter ? <div className="mt-1 w-full shrink-0 text-center">{mediaFooter}</div> : null}
              </div>

              {hasBelowOnly ? (
                <div className={`${belowFoldClass} mt-2 max-h-[40dvh] shrink-0 overflow-y-auto lg:max-h-[36dvh]`}>
                  {belowFold}
                </div>
              ) : null}
            </div>

            {hasRight ? (
              <aside
                className={rightRailOuter}
                style={!isGallery ? railChromeBorder : undefined}
              >
                <div className="max-h-[min(42dvh,520px)] overflow-y-auto px-3 py-3 sm:px-3.5 sm:py-3.5 lg:max-h-[calc(100dvh-5.5rem)]">
                  {rightRail}
                </div>
              </aside>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );

  if (mountEl == null) return null;

  return createPortal(
    <div className="fixed inset-0" style={{ zIndex: OVERLAY_Z }}>
      {shell}
    </div>,
    mountEl
  );
}
