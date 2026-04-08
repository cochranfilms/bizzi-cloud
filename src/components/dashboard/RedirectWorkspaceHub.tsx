"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

function Inner({ href }: { href: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  useEffect(() => {
    const q = searchParams.toString();
    router.replace(`${href}${q ? `?${q}` : ""}`);
  }, [href, router, searchParams]);
  return null;
}

/** Preserves query string (e.g. ?drive=) when moving /files → home hub. */
export default function RedirectWorkspaceHub({ href }: { href: string }) {
  return (
    <Suspense fallback={null}>
      <Inner href={href} />
    </Suspense>
  );
}
