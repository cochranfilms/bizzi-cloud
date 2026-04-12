"use client";

import { useLayoutEffect } from "react";
import { markDashboardPerf, dashboardPerfMarks } from "@/lib/dashboard-client-timing";

/** Marks the start of dashboard home client work (first paint pipeline). */
export default function DashboardHomePerfMarks() {
  useLayoutEffect(() => {
    markDashboardPerf(dashboardPerfMarks.navigation);
  }, []);
  return null;
}
