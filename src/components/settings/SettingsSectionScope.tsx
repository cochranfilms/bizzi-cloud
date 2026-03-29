"use client";

export default function SettingsSectionScope({
  label,
  permissionHint,
}: {
  label: string;
  permissionHint?: string;
}) {
  return (
    <div className="mb-3 mt-1 space-y-0.5">
      <p className="text-xs font-medium uppercase tracking-wide text-neutral-500 dark:text-neutral-400">
        {label}
      </p>
      {permissionHint ? (
        <p className="text-xs text-amber-800 dark:text-amber-200/85">{permissionHint}</p>
      ) : null}
    </div>
  );
}
