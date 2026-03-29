"use client";

export default function ReadOnlyBanner({ message }: { message: string }) {
  return (
    <div
      className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/50"
      role="status"
    >
      <p className="text-sm text-amber-800 dark:text-amber-200">{message}</p>
    </div>
  );
}
