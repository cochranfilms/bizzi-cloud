"use client";

import Link from "next/link";
import { Activity, FolderOpen, Settings, Users } from "lucide-react";
import { useEnterprise } from "@/context/EnterpriseContext";

export default function EnterpriseHomeControlCenter() {
  const { org, role } = useEnterprise();
  if (!org) return null;
  const isAdmin = role === "admin";

  const card =
    "flex items-center gap-3 rounded-lg border border-neutral-200 bg-white px-4 py-3 text-sm font-medium text-neutral-800 transition-colors hover:border-[var(--enterprise-primary)] hover:bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100 dark:hover:border-[var(--enterprise-primary)] dark:hover:bg-neutral-800/80";

  return (
    <section className="mb-6 rounded-xl border border-neutral-200 bg-neutral-50/80 p-5 dark:border-neutral-700 dark:bg-neutral-900/40">
      <h2 className="mb-1 text-sm font-semibold text-neutral-900 dark:text-white">
        Control center
      </h2>
      <p className="mb-4 text-xs text-neutral-600 dark:text-neutral-400">
        Organization storage is shared by everyone in {org.name}. Your admin may also set a{" "}
        <strong className="font-medium">per-seat upload cap</strong> so individual usage stays within an
        allocation—even when the org pool has free space.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <Link href="/enterprise/files" className={card}>
          <FolderOpen className="h-5 w-5 shrink-0 text-[var(--enterprise-primary)]" />
          Files
        </Link>
        <Link href="/enterprise/activity" className={card}>
          <Activity className="h-5 w-5 shrink-0 text-[var(--enterprise-primary)]" />
          Activity
        </Link>
        <Link href="/enterprise/settings" className={card}>
          <Settings className="h-5 w-5 shrink-0 text-[var(--enterprise-primary)]" />
          Organization settings
        </Link>
        {isAdmin ? (
          <Link href="/enterprise/seats" className={card}>
            <Users className="h-5 w-5 shrink-0 text-[var(--enterprise-primary)]" />
            Seats &amp; invites
          </Link>
        ) : null}
      </div>
    </section>
  );
}
