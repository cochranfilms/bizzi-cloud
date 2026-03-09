/**
 * Photographer homepage at /{handle} - lists their public galleries.
 * Redirects to /p/[handle] (reuses existing studio homepage).
 */
import { redirect, notFound } from "next/navigation";
import { isReservedHandle } from "@/lib/public-handle";

export default async function HandleHomepagePage({
  params,
}: {
  params: Promise<{ handle: string }>;
}) {
  const { handle } = await params;

  const normalizedHandle = handle.toLowerCase().trim();

  if (!normalizedHandle || isReservedHandle(normalizedHandle)) notFound();

  redirect(`/p/${normalizedHandle}`);
}
