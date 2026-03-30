"use client";

import { FilesFilterTopChromeProvider } from "@/context/FilesFilterTopChromeContext";

export default function FilesFilterTopChromeBoundary({
  children,
}: {
  children: React.ReactNode;
}) {
  return <FilesFilterTopChromeProvider>{children}</FilesFilterTopChromeProvider>;
}
