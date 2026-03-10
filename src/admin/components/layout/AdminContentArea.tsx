"use client";

export default function AdminContentArea({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <main className="flex-1 overflow-auto bg-neutral-50 dark:bg-neutral-950">
      <div className="p-4 md:p-6">{children}</div>
    </main>
  );
}
