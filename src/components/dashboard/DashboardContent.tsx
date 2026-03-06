"use client";

import dynamic from "next/dynamic";

const FileGrid = dynamic(
  () => import("./FileGrid"),
  { ssr: false }
);

export default function DashboardContent() {
  return <FileGrid />;
}
