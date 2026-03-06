"use client";

import dynamic from "next/dynamic";

const SharedGrid = dynamic(
  () => import("./SharedGrid"),
  { ssr: false }
);

export default function SharedContent() {
  return <SharedGrid />;
}
