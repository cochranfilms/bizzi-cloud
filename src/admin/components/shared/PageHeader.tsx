"use client";

import type { ReactNode } from "react";

interface PageHeaderProps {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  breadcrumbs?: Array<{ label: string; href?: string }>;
}

export default function PageHeader({
  title,
  subtitle,
  actions,
  breadcrumbs,
}: PageHeaderProps) {
  return (
    <header className="mb-6">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav className="mb-2 flex items-center gap-1 text-sm text-neutral-500 dark:text-neutral-400">
          {breadcrumbs.map((b, i) => (
            <span key={i} className="flex items-center gap-1">
              {b.href ? (
                <a
                  href={b.href}
                  className="hover:text-neutral-700 dark:hover:text-neutral-300"
                >
                  {b.label}
                </a>
              ) : (
                <span>{b.label}</span>
              )}
              {i < breadcrumbs.length - 1 && (
                <span className="text-neutral-400 dark:text-neutral-500">/</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-semibold text-neutral-900 dark:text-white md:text-2xl">
            {title}
          </h1>
          {subtitle && (
            <p className="mt-0.5 text-sm text-neutral-500 dark:text-neutral-400">
              {subtitle}
            </p>
          )}
        </div>
        {actions && (
          <div className="mt-3 flex flex-wrap items-center gap-2 sm:mt-0">
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}
