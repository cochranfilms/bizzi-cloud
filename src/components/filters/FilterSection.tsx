"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

interface FilterSectionProps {
  title: string;
  defaultCollapsed?: boolean;
  children: React.ReactNode;
}

export default function FilterSection({
  title,
  defaultCollapsed = false,
  children,
}: FilterSectionProps) {
  const [collapsed, setCollapsed] = useState(defaultCollapsed);
  return (
    <div className="border-b border-neutral-200 last:border-b-0 dark:border-neutral-700">
      <button
        type="button"
        onClick={() => setCollapsed((c) => !c)}
        className="flex w-full items-center justify-between py-3 text-left text-sm font-medium text-neutral-700 dark:text-neutral-300"
      >
        <span>{title}</span>
        {collapsed ? (
          <ChevronRight className="h-4 w-4 text-neutral-500" />
        ) : (
          <ChevronDown className="h-4 w-4 text-neutral-500" />
        )}
      </button>
      {!collapsed && <div className="pb-4">{children}</div>}
    </div>
  );
}
