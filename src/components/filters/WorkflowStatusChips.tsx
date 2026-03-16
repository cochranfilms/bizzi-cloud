"use client";

const STATUS_COLORS: Record<string, { bg: string; text: string }> = {
  draft: { bg: "bg-neutral-100 dark:bg-neutral-800", text: "text-neutral-700 dark:text-neutral-300" },
  in_review: { bg: "bg-amber-100 dark:bg-amber-900/30", text: "text-amber-800 dark:text-amber-200" },
  approved: { bg: "bg-emerald-100 dark:bg-emerald-900/30", text: "text-emerald-800 dark:text-emerald-200" },
  delivered: { bg: "bg-bizzi-blue/15 dark:bg-bizzi-cyan/15", text: "text-bizzi-blue dark:text-bizzi-cyan" },
  archived: { bg: "bg-neutral-100 dark:bg-neutral-800", text: "text-neutral-500 dark:text-neutral-400" },
};

const WORKFLOW_OPTIONS = [
  { value: "draft", label: "Draft" },
  { value: "in_review", label: "In Review" },
  { value: "approved", label: "Approved" },
  { value: "delivered", label: "Delivered" },
  { value: "archived", label: "Archived" },
];

interface WorkflowStatusChipsProps {
  value: string | string[] | undefined;
  onChange: (value: string | string[]) => void;
}

export default function WorkflowStatusChips({ value, onChange }: WorkflowStatusChipsProps) {
  const selected = Array.isArray(value) ? value : value ? [value] : [];

  const toggle = (v: string) => {
    const next = selected.includes(v)
      ? selected.filter((x) => x !== v)
      : [...selected, v];
    onChange(next.length === 1 ? next[0] : next);
  };

  return (
    <div className="flex flex-wrap gap-2">
      {WORKFLOW_OPTIONS.map((opt) => {
        const colors = STATUS_COLORS[opt.value] ?? STATUS_COLORS.draft;
        const isSelected = selected.includes(opt.value);
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => toggle(opt.value)}
            className={`rounded-full px-3.5 py-2 text-sm font-medium transition-all ${
              isSelected
                ? `${colors.bg} ${colors.text} ring-1 ring-inset ring-neutral-300/50 dark:ring-neutral-600/50`
                : "bg-neutral-50 text-neutral-600 hover:bg-neutral-100 dark:bg-neutral-800 dark:text-neutral-400 dark:hover:bg-neutral-700"
            }`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
