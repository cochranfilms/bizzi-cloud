"use client";

import SideDrawer from "../shared/SideDrawer";

interface PlatformJsonDrawerProps {
  title: string;
  subtitle?: string | null;
  payload: unknown;
  isOpen: boolean;
  onClose: () => void;
}

export default function PlatformJsonDrawer({
  title,
  subtitle,
  payload,
  isOpen,
  onClose,
}: PlatformJsonDrawerProps) {
  return (
    <SideDrawer isOpen={isOpen} onClose={onClose} title={title} width="md">
      {subtitle && (
        <p className="mb-4 text-sm text-neutral-600 dark:text-neutral-400">{subtitle}</p>
      )}
      <pre className="max-h-[70vh] overflow-auto rounded-lg bg-neutral-100 p-3 text-xs dark:bg-neutral-800">
        {JSON.stringify(payload, null, 2)}
      </pre>
    </SideDrawer>
  );
}
