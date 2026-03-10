"use client";

export default function StorageSkeleton() {
  return (
    <div className="space-y-8 animate-pulse">
      <div className="rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm dark:border-neutral-700 dark:bg-neutral-900">
        <div className="mb-1 h-4 w-32 rounded bg-neutral-200 dark:bg-neutral-700" />
        <div className="mb-4 h-8 w-72 rounded bg-neutral-200 dark:bg-neutral-700" />
        <div className="mb-4 flex gap-4">
          <div className="h-4 w-24 rounded bg-neutral-100 dark:bg-neutral-800" />
          <div className="h-4 w-20 rounded bg-neutral-100 dark:bg-neutral-800" />
        </div>
        <div className="mb-4 h-3 w-full max-w-md rounded-full bg-neutral-100 dark:bg-neutral-800" />
        <div className="h-3 w-40 rounded bg-neutral-100 dark:bg-neutral-800" />
      </div>
      <div>
        <div className="mb-3 h-4 w-28 rounded bg-neutral-200 dark:bg-neutral-700" />
        <div className="h-8 w-full rounded-full bg-neutral-100 dark:bg-neutral-800" />
      </div>
      <div>
        <div className="mb-4 h-4 w-36 rounded bg-neutral-200 dark:bg-neutral-700" />
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {[1, 2, 3, 4, 5, 6].map((i) => (
            <div
              key={i}
              className="rounded-xl border border-neutral-200 bg-white p-4 shadow-sm dark:border-neutral-700 dark:bg-neutral-900"
            >
              <div className="mb-3 flex gap-2">
                <div className="h-3 w-3 rounded-full bg-neutral-200 dark:bg-neutral-700" />
                <div className="h-4 w-24 rounded bg-neutral-200 dark:bg-neutral-700" />
              </div>
              <div className="mb-2 h-6 w-20 rounded bg-neutral-100 dark:bg-neutral-800" />
              <div className="mb-2 h-3 w-32 rounded bg-neutral-100 dark:bg-neutral-800" />
              <div className="h-3 w-16 rounded bg-neutral-100 dark:bg-neutral-800" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
