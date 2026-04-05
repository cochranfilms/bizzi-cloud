"use client";

import { useEffect, useState } from "react";
import type { Uppy } from "@uppy/core";
import type { Meta, Body } from "@uppy/core";
import type { CSSProperties } from "react";

function deriveStatusBarCloudPct<M extends Meta, B extends Body>(
  uppy: Uppy<M, B>
): { pct: number; indeterminate: boolean } {
  const state = uppy.getState();
  const totalProgress = Math.max(0, Math.min(100, state.totalProgress ?? 0));
  const files = state.files ?? {};

  if (state.capabilities?.uploadProgress === false) {
    return { pct: totalProgress, indeterminate: true };
  }

  const determinateValues: number[] = [];
  let sawIndeterminate = false;

  for (const f of Object.values(files)) {
    const p = f.progress;
    for (const block of [p?.preprocess, p?.postprocess] as const) {
      if (!block) continue;
      if (block.mode === "determinate") {
        determinateValues.push(Math.max(0, Math.min(100, block.value * 100)));
      } else if (block.mode === "indeterminate") {
        sawIndeterminate = true;
      }
    }
  }

  if (determinateValues.length > 0) {
    const pct = Math.round(
      determinateValues.reduce((a, b) => a + b, 0) / determinateValues.length
    );
    return { pct: Math.max(0, Math.min(100, pct)), indeterminate: false };
  }
  if (sawIndeterminate) {
    return { pct: totalProgress, indeterminate: true };
  }

  return { pct: totalProgress, indeterminate: false };
}

/**
 * Drives `--bizzi-status-pct` for the Uppy StatusBar cloud (see uppy-bizzi-premium.css).
 */
export function useUppyStatusBarCloudVars<M extends Meta, B extends Body>(
  uppy: Uppy<M, B>
): { style: CSSProperties; className: string } {
  const [, setTick] = useState(0);
  useEffect(() => {
    const bump = () => setTick((x) => x + 1);
    uppy.on("state-update", bump);
    return () => {
      uppy.off("state-update", bump);
    };
  }, [uppy]);

  const { pct, indeterminate } = deriveStatusBarCloudPct(uppy);
  return {
    style: { ["--bizzi-status-pct" as string]: `${pct}%` },
    className: indeterminate ? "bizzi-uppy-statusbar-cloud-indeterminate" : "",
  };
}
