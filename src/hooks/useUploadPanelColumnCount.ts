"use client";

import { useEffect, useState } from "react";

/** 1 col default (mobile + SSR), 2 from 768px, 3 from 1024px — matches plan md/lg. */
export function useUploadPanelColumnCount(): number {
  const [cols, setCols] = useState(1);

  useEffect(() => {
    const mqLg = window.matchMedia("(min-width: 1024px)");
    const mqMd = window.matchMedia("(min-width: 768px)");
    const read = () => {
      if (mqLg.matches) setCols(3);
      else if (mqMd.matches) setCols(2);
      else setCols(1);
    };
    read();
    mqLg.addEventListener("change", read);
    mqMd.addEventListener("change", read);
    return () => {
      mqLg.removeEventListener("change", read);
      mqMd.removeEventListener("change", read);
    };
  }, []);

  return cols;
}
