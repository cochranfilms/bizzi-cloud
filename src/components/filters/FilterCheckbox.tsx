"use client";

interface FilterCheckboxProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
}

export default function FilterCheckbox({
  checked,
  onChange,
  label,
}: FilterCheckboxProps) {
  return (
    <label className="flex cursor-pointer items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onChange(e.target.checked)}
        className="h-4 w-4 rounded border-neutral-300 text-bizzi-blue focus:ring-bizzi-blue/20 dark:border-neutral-600"
      />
      <span className="text-neutral-700 dark:text-neutral-300">{label}</span>
    </label>
  );
}
