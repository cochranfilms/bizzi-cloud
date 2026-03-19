"use client";

/**
 * Section title with accent-colored background. Uses --bizzi-section-title-bg
 * from DashboardAppearanceContext (derived from accent color).
 */
export default function SectionTitle({
  children,
  className = "",
  as: Tag = "h2",
}: {
  children: React.ReactNode;
  className?: string;
  as?: "h2" | "h3";
}) {
  return (
    <Tag
      className={`block w-full rounded-lg px-4 py-2 text-center text-sm font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-300 ${className}`}
      style={{ backgroundColor: "var(--bizzi-section-title-bg)" }}
    >
      {children}
    </Tag>
  );
}
