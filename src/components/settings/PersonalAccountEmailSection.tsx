"use client";

import { Mail } from "lucide-react";
import { useProfileUpdate } from "@/hooks/useProfileUpdate";
import SettingsSectionScope from "@/components/settings/SettingsSectionScope";
import { productSettingsCopy } from "@/lib/product-settings-copy";

export default function PersonalAccountEmailSection() {
  const { user } = useProfileUpdate();

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <SettingsSectionScope label={productSettingsCopy.scopes.personalAccountOnly} />
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
        <Mail className="h-5 w-5 text-bizzi-blue" />
        Email
      </h2>
      <div>
        <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
          Email
        </label>
        <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
          {user?.email ?? "—"}
        </p>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Email cannot be changed here. Contact support if needed.
        </p>
      </div>
    </section>
  );
}
