"use client";

export default function WhereToChangeHint({ children }: { children: React.ReactNode }) {
  return (
    <p className="mt-2 text-xs text-neutral-500 dark:text-neutral-400">
      <span className="font-medium text-neutral-600 dark:text-neutral-300">Where to change this: </span>
      {children}
    </p>
  );
}
