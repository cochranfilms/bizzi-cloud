"use client";

import { Suspense } from "react";
import { useParams } from "next/navigation";
import DashboardHomeTopBar from "@/components/dashboard/DashboardHomeTopBar";
import HomeStorageView from "@/components/dashboard/HomeStorageView";

function TeamHomeContent() {
  const { ownerId } = useParams<{ ownerId: string }>();
  const basePath = `/team/${ownerId}`;
  return (
    <>
      <DashboardHomeTopBar />
      <main className="min-h-0 flex-1 overflow-auto px-4 pt-2 pb-28 sm:px-6 sm:pt-3 sm:pb-6 xl:px-8">
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
