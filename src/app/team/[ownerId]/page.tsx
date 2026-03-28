"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import TopBar from "@/components/dashboard/TopBar";
import HomeStorageView from "@/components/dashboard/HomeStorageView";

function TeamHomeContent() {
  const { ownerId } = useParams<{ ownerId: string }>();
  const basePath = `/team/${ownerId}`;
  return (
    <>
      <TopBar title="Home" showLayoutSettings />
      <main className="flex-1 overflow-auto px-3 py-4 pb-28 sm:p-6 sm:pb-6">
        <Suspense fallback={null}>
          <HomeStorageView basePath={basePath} />
        </Suspense>
      </main>
    </>
  );
}

export default function TeamHomePage() {
  return (
    <Suspense fallback={null}>
      <TeamHomeContent />
    </Suspense>
  );
}
