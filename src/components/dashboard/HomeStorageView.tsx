"use client";

import Link from "next/link";
import { Cloud } from "lucide-react";
import { useCloudFiles } from "@/hooks/useCloudFiles";

interface HomeStorageViewProps {
  /** Base path for links: "/dashboard" or "/enterprise" */
  basePath?: string;
}

export default function HomeStorageView({ basePath = "/dashboard" }: HomeStorageViewProps) {
  const { driveFolders, loading } = useCloudFiles();
  const totalItems = driveFolders.reduce((sum, d) => sum + d.items, 0);
  const filesHref = `${basePath}/files`;

  return (
    <div className="mx-auto max-w-6xl space-y-8">
      <section className="rounded-2xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900/50">
        <h2 className="mb-4 text-sm font-semibold text-neutral-700 dark:text-neutral-300">
          Your storage
        </h2>
        {loading ? (
          <div className="py-12 text-center text-sm text-neutral-500 dark:text-neutral-400">
            Loading…
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4">
            <Link
              href={filesHref}
              className="group flex flex-col items-center rounded-xl border border-neutral-200 bg-white p-6 transition-colors hover:border-bizzi-blue/30 hover:bg-neutral-50/50 dark:border-neutral-700 dark:bg-neutral-900 dark:hover:border-bizzi-blue/30 dark:hover:bg-neutral-800/50"
            >
              <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-xl bg-bizzi-blue/10 text-bizzi-blue dark:bg-bizzi-blue/20">
                <Cloud className="h-8 w-8" />
              </div>
              <h3 className="mb-1 truncate w-full text-center text-sm font-medium text-neutral-900 dark:text-white">
                Storage
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400">
                {totalItems} {totalItems === 1 ? "item" : "items"}
              </p>
            </Link>
          </div>
        )}
      </section>
    </div>
  );
}
