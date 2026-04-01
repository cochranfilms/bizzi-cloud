"use client";

import { useEffect } from "react";

/** Legacy URL: migration UI lives under Settings → Migration. */
export default function MigrationsRedirectPage() {
  useEffect(() => {
    const path = `${window.location.origin}/dashboard/settings#migration`;
    window.location.replace(path);
  }, []);

  return (
    <div className="flex min-h-[40vh] items-center justify-center p-6 text-sm text-neutral-500 dark:text-neutral-400">
      Redirecting to Settings…
    </div>
  );
}
