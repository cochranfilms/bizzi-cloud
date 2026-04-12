/**
 * Client-side marks for dashboard load profiling (Chrome Performance + console in dev).
 * Use with performance.measure in dev to print nav → shell → account status → folder grid.
 */

const PREFIX = "bizzi:dashboard:";

export const dashboardPerfMarks = {
  /**
   * Dashboard home page client boundary (after shell). For cold loads the shell mark
   * typically fires first; use measures relative to this as “home pipeline start”.
   */
  navigation: `${PREFIX}navigation`,
  /** DashboardShell committed layout (nav + chrome). */
  shellLayout: `${PREFIX}shell-layout`,
  /** DashboardAuthGuard finished /api/account/status successfully. */
  accountStatusOk: `${PREFIX}account-status-ok`,
  /** Home hub: drive/folder tiles finished primary loading (useCloudFiles + drives). */
  folderGridReady: `${PREFIX}folder-grid-ready`,
} as const;

export function markDashboardPerf(markName: string): void {
  if (typeof performance?.mark !== "function") return;
  try {
    performance.mark(markName);
  } catch {
    /* duplicate mark name in strict mode */
  }
}

/** Log intervals between marks (development only). */
export function logDashboardPerfMeasures(): void {
  if (typeof window === "undefined" || process.env.NODE_ENV !== "development") return;
  const pairs: [string, string, string][] = [
    ["shell→home-page", dashboardPerfMarks.shellLayout, dashboardPerfMarks.navigation],
    ["home-page→account-status", dashboardPerfMarks.navigation, dashboardPerfMarks.accountStatusOk],
    ["account-status→folders", dashboardPerfMarks.accountStatusOk, dashboardPerfMarks.folderGridReady],
    ["shell→folders (e2e)", dashboardPerfMarks.shellLayout, dashboardPerfMarks.folderGridReady],
  ];
  for (const [label, start, end] of pairs) {
    try {
      const m = performance.measure(`bizzi:${label}`, start, end);
      console.info(`[bizzi-dashboard] ${label}: ${m.duration.toFixed(0)}ms`);
    } catch {
      /* marks missing until later in load */
    }
  }
}
