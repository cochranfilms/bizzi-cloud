"use client";

import {
  HardDrive,
  Archive,
  Bell,
  ToggleLeft,
  Wrench,
  Megaphone,
  Globe,
} from "lucide-react";
import type { SettingsSection } from "@/admin/hooks/useAdminSettings";

const sections: { id: SettingsSection; label: string; icon: typeof HardDrive }[] = [
  { id: "quotas", label: "Quotas & limits", icon: HardDrive },
  { id: "retention", label: "Retention rules", icon: Archive },
  { id: "alerts", label: "Alert thresholds", icon: Bell },
  { id: "features", label: "Feature flags", icon: ToggleLeft },
  { id: "maintenance", label: "Maintenance mode", icon: Wrench },
  { id: "banner", label: "Announcement banner", icon: Megaphone },
  { id: "display", label: "Display (locale & currency)", icon: Globe },
];

interface SettingsNavigationProps {
  active: SettingsSection;
  onSelect: (section: SettingsSection) => void;
}

export default function SettingsNavigation({ active, onSelect }: SettingsNavigationProps) {
  return (
    <nav className="space-y-0.5">
      {sections.map((s) => {
        const Icon = s.icon;
        const isActive = active === s.id;
        return (
          <button
            key={s.id}
            type="button"
            onClick={() => onSelect(s.id)}
            className={`flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm transition-colors ${
              isActive
                ? "bg-bizzi-blue/10 font-medium text-bizzi-blue dark:bg-bizzi-cyan/20 dark:text-bizzi-cyan"
                : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
            }`}
          >
            <Icon className="h-4 w-4 flex-shrink-0" />
            {s.label}
          </button>
        );
      })}
    </nav>
  );
}
