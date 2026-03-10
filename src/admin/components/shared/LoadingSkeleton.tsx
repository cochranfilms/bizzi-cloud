"use client";

interface LoadingSkeletonProps {
  className?: string;
  lines?: number;
}

export default function LoadingSkeleton({
  className = "",
  lines = 3,
}: LoadingSkeletonProps) {
  return (
    <div className={`animate-pulse space-y-3 ${className}`}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="h-4 rounded bg-neutral-200 dark:bg-neutral-700"
          style={{ width: i === lines - 1 && lines > 1 ? "75%" : "100%" }}
        />
      ))}
    </div>
  );
}
