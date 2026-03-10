"use client";

import type { ReactNode } from "react";
import { Loader2 } from "lucide-react";

export interface Column<T> {
  id: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string;
  sortable?: boolean;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  loading?: boolean;
  emptyState?: ReactNode;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
  keyExtractor: (row: T) => string;
  stickyHeader?: boolean;
}

export default function DataTable<T>({
  columns,
  rows,
  loading = false,
  emptyState,
  onRowClick,
  rowActions,
  keyExtractor,
  stickyHeader = true,
}: DataTableProps<T>) {
  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
        <Loader2 className="h-8 w-8 animate-spin text-bizzi-blue dark:text-bizzi-cyan" />
      </div>
    );
  }

  if (rows.length === 0 && emptyState) {
    return <div className="rounded-xl border border-neutral-200 bg-white p-8 dark:border-neutral-700 dark:bg-neutral-900">{emptyState}</div>;
  }

  if (rows.length === 0) {
    return (
      <div className="flex min-h-[200px] flex-col items-center justify-center rounded-xl border border-neutral-200 bg-white py-12 dark:border-neutral-700 dark:bg-neutral-900">
        <p className="text-sm text-neutral-500 dark:text-neutral-400">
          No data to display
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-hidden rounded-xl border border-neutral-200 bg-white dark:border-neutral-700 dark:bg-neutral-900">
      <div className="overflow-x-auto">
        <table className="w-full min-w-[600px]">
          <thead>
            <tr className="border-b border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800/50">
              {columns.map((col) => (
                <th
                  key={col.id}
                  className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-400 ${
                    col.className ?? ""
                  } ${stickyHeader ? "sticky top-0 bg-neutral-50 dark:bg-neutral-800/50" : ""}`}
                >
                  {col.header}
                </th>
              ))}
              {rowActions && <th className="w-12 px-4 py-3" />}
            </tr>
          </thead>
          <tbody className="divide-y divide-neutral-200 dark:divide-neutral-700">
            {rows.map((row) => (
              <tr
                key={keyExtractor(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={`transition-colors ${
                  onRowClick
                    ? "cursor-pointer hover:bg-neutral-50 dark:hover:bg-neutral-800/50"
                    : ""
                }`}
              >
                {columns.map((col) => (
                  <td
                    key={col.id}
                    className={`px-4 py-3 text-sm text-neutral-700 dark:text-neutral-300 ${
                      col.className ?? ""
                    }`}
                  >
                    {col.cell(row)}
                  </td>
                ))}
                {rowActions && (
                  <td className="px-4 py-3">{rowActions(row)}</td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
