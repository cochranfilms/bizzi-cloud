"use client";

import Link from "next/link";
import { useSubscription } from "@/hooks/useSubscription";

interface AddonGuardProps {
  children: React.ReactNode;
  require: "gallery" | "editor";
  featureName: string;
  upgradeMessage?: string;
}

export default function AddonGuard({
  children,
  require: required,
  featureName,
  upgradeMessage = "Upgrade your plan to add this power-up.",
}: AddonGuardProps) {
  const { hasGallerySuite, hasEditor, loading } = useSubscription();
  const hasAccess =
    required === "gallery" ? hasGallerySuite : hasEditor;

  if (loading) {
    return (
      <div className="flex min-h-[200px] items-center justify-center">
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-bizzi-blue border-t-transparent" />
      </div>
    );
  }

  if (!hasAccess) {
    return (
      <div className="flex min-h-[300px] flex-col items-center justify-center gap-6 p-8 text-center">
        <h2 className="text-xl font-semibold text-neutral-900 dark:text-white">
          {featureName} is a Power Up
        </h2>
        <p className="max-w-md text-sm text-neutral-600 dark:text-neutral-400">
          {upgradeMessage} Add the {featureName} add-on to your plan to unlock this feature.
        </p>
        <Link
          href="/#pricing"
          className="rounded-xl bg-bizzi-blue px-6 py-3 font-medium text-white transition-colors hover:bg-bizzi-cyan"
        >
          View pricing
        </Link>
      </div>
    );
  }

  return <>{children}</>;
}
