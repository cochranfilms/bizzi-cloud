"use client";

import { useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  Heart,
  Clock,
  FolderKanban,
  Activity,
  Share2,
  MessageCircle,
  FolderOpen,
  Settings,
  Users,
  Palette,
  Headphones,
} from "lucide-react";
import StorageBadge from "./StorageBadge";
import DashboardColorsModal from "./DashboardColorsModal";
import SupportTicketModal from "./SupportTicketModal";
import { useEnterpriseOptional } from "@/context/EnterpriseContext";

const quickAccessItems = (basePath: string) => [
  { href: `${basePath}/hearts`, label: "Hearts", icon: Heart },
  { href: `${basePath}/recent`, label: "Recent", icon: Clock },
  { href: `${basePath}/projects`, label: "Projects", icon: FolderKanban },
];

interface RightPanelProps {
  onMobileClose?: () => void;
  /** Base path for links (e.g. /dashboard or /enterprise). Default: /dashboard */
  basePath?: string;
  /** When set, shows a Quick access link (org / team file comment activity). */
  commentsHref?: string;
  /** Optional custom storage component (e.g. EnterpriseStorageBadge). Default: StorageBadge */
  storageComponent?: React.ReactNode;
}

const enterpriseCardIdle =
  "border-neutral-200 text-neutral-800 hover:border-[var(--enterprise-primary)] hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-100 dark:hover:border-[var(--enterprise-primary)] dark:hover:bg-neutral-800/80";

function EnterpriseSidebarCard({
  href,
  label,
  Icon,
  pathname,
  onMobileClose,
}: {
  href: string;
  label: string;
  Icon: LucideIcon;
  pathname: string;
  onMobileClose?: () => void;
}) {
  const isActive = pathname === href;
  return (
    <li>
      <Link
        href={href}
        onClick={onMobileClose}
        className={`flex items-center gap-3 rounded-lg border bg-white px-3 py-2.5 text-sm font-medium transition-colors dark:bg-neutral-900 ${
          isActive
            ? "border-[var(--enterprise-primary)] bg-[var(--enterprise-primary)]/10 text-neutral-900 dark:text-white"
            : enterpriseCardIdle
        }`}
      >
        <Icon className="h-5 w-5 shrink-0 text-[var(--enterprise-primary)]" strokeWidth={1.75} />
        {label}
      </Link>
    </li>
  );
}

function EnterpriseSidebarActionButton({
  label,
  Icon,
  onClick,
}: {
  label: string;
  Icon: LucideIcon;
  onClick: () => void;
}) {
  return (
    <li>
      <button
        type="button"
        onClick={onClick}
        className={`flex w-full items-center gap-3 rounded-lg border bg-white px-3 py-2.5 text-left text-sm font-medium transition-colors dark:bg-neutral-900 ${enterpriseCardIdle}`}
      >
        <Icon className="h-5 w-5 shrink-0 text-[var(--enterprise-primary)]" strokeWidth={1.75} />
        {label}
      </button>
    </li>
  );
}

const quickAccessActionClass = {
  idle:
    "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white",
  active:
    "bg-bizzi-blue/10 font-medium text-bizzi-blue dark:bg-bizzi-blue/20 dark:text-bizzi-cyan",
} as const;

export default function RightPanel({
  onMobileClose,
  basePath = "/dashboard",
  commentsHref,
  storageComponent,
}: RightPanelProps) {
  const pathname = usePathname();
  const [colorsModalOpen, setColorsModalOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const items = quickAccessItems(basePath);
  const enterpriseCtx = useEnterpriseOptional();
  const isEnterprisePanel = basePath === "/enterprise" && enterpriseCtx !== null;
  const isAdmin = enterpriseCtx?.role === "admin";

  if (isEnterprisePanel) {
    return (
      <>
        <aside className="flex h-full w-full max-w-[min(20rem,100vw-2rem)] flex-shrink-0 flex-col border-l border-neutral-200 bg-white shadow-xl sm:w-56 xl:max-w-none xl:shadow-none dark:border-neutral-800 dark:bg-neutral-950">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto border-b border-neutral-200 p-4 dark:border-neutral-800">
              <h3 className="mb-3 text-sm font-semibold text-neutral-900 dark:text-white">
                Control Center
              </h3>
              <ul className="space-y-2">
                <EnterpriseSidebarCard
                  href={`${basePath}/files`}
                  label="Files"
                  Icon={FolderOpen}
                  pathname={pathname}
                  onMobileClose={onMobileClose}
                />
                <EnterpriseSidebarCard
                  href={`${basePath}/activity`}
                  label="Activity"
                  Icon={Activity}
                  pathname={pathname}
                  onMobileClose={onMobileClose}
                />
                <EnterpriseSidebarCard
                  href={`${basePath}/settings`}
                  label="Organization settings"
                  Icon={Settings}
                  pathname={pathname}
                  onMobileClose={onMobileClose}
                />
                {isAdmin ? (
                  <EnterpriseSidebarCard
                    href={`${basePath}/seats`}
                    label="Seats & invites"
                    Icon={Users}
                    pathname={pathname}
                    onMobileClose={onMobileClose}
                  />
                ) : null}
                {items.map((item) => (
                  <EnterpriseSidebarCard
                    key={item.href}
                    href={item.href}
                    label={item.label}
                    Icon={item.icon}
                    pathname={pathname}
                    onMobileClose={onMobileClose}
                  />
                ))}
                {commentsHref ? (
                  <EnterpriseSidebarCard
                    href={commentsHref}
                    label="Comments"
                    Icon={MessageCircle}
                    pathname={pathname}
                    onMobileClose={onMobileClose}
                  />
                ) : null}
                <EnterpriseSidebarActionButton
                  label="Customize dashboard"
                  Icon={Palette}
                  onClick={() => {
                    onMobileClose?.();
                    setColorsModalOpen(true);
                  }}
                />
                <EnterpriseSidebarActionButton
                  label="Support ticket"
                  Icon={Headphones}
                  onClick={() => {
                    onMobileClose?.();
                    setSupportModalOpen(true);
                  }}
                />
              </ul>
            </div>
            <div className="flex min-h-0 flex-shrink-0 flex-col overflow-hidden">
              <div className="flex min-h-0 flex-1 flex-col p-4">
                {storageComponent ?? <StorageBadge />}
              </div>
            </div>
          </div>
        </aside>
        <DashboardColorsModal open={colorsModalOpen} onClose={() => setColorsModalOpen(false)} />
        <SupportTicketModal isOpen={supportModalOpen} onClose={() => setSupportModalOpen(false)} />
      </>
    );
  }

  return (
    <>
      <aside className="flex h-full w-full max-w-[min(20rem,100vw-2rem)] flex-shrink-0 flex-col border-l border-neutral-200 bg-white shadow-xl sm:w-56 xl:max-w-none xl:shadow-none dark:border-neutral-800 dark:bg-neutral-950">
        {/* Quick access */}
        <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
          <h3 className="mb-3 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
            Quick access
          </h3>
          <ul className="space-y-0.5">
            {items.map((item) => {
              const Icon = item.icon;
              const isActive = pathname === item.href;
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    onClick={onMobileClose}
                    className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive ? quickAccessActionClass.active : quickAccessActionClass.idle
                    }`}
                  >
                    <Icon className="h-4 w-4 flex-shrink-0" />
                    {item.label}
                  </Link>
                </li>
              );
            })}
            {commentsHref ? (
              <li key={commentsHref}>
                <Link
                  href={commentsHref}
                  onClick={onMobileClose}
                  className={`flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${
                    pathname === commentsHref
                      ? quickAccessActionClass.active
                      : quickAccessActionClass.idle
                  }`}
                >
                  <MessageCircle className="h-4 w-4 flex-shrink-0" />
                  Comments
                </Link>
              </li>
            ) : null}
            <li>
              <button
                type="button"
                onClick={() => {
                  onMobileClose?.();
                  setColorsModalOpen(true);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${quickAccessActionClass.idle}`}
              >
                <Palette className="h-4 w-4 flex-shrink-0" />
                Customize dashboard
              </button>
            </li>
            <li>
              <button
                type="button"
                onClick={() => {
                  onMobileClose?.();
                  setSupportModalOpen(true);
                }}
                className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors ${quickAccessActionClass.idle}`}
              >
                <Headphones className="h-4 w-4 flex-shrink-0" />
                Support ticket
              </button>
            </li>
          </ul>
        </div>

        {/* Activity */}
        <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
          <Link
            href={`${basePath}/activity`}
            onClick={onMobileClose}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <Activity className="h-4 w-4" />
            Activity
          </Link>
        </div>

        {/* Shared shortcut */}
        <div className="border-b border-neutral-200 p-4 dark:border-neutral-800">
          <Link
            href={`${basePath}/shared`}
            onClick={onMobileClose}
            className="flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            <Share2 className="h-4 w-4" />
            Shared with you
          </Link>
        </div>

        {/* Storage — fills sidebar below shortcuts (single panel, no split with sync) */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className="flex min-h-0 flex-1 flex-col p-4">
            {storageComponent ?? <StorageBadge />}
          </div>
        </div>
      </aside>
      <DashboardColorsModal open={colorsModalOpen} onClose={() => setColorsModalOpen(false)} />
      <SupportTicketModal isOpen={supportModalOpen} onClose={() => setSupportModalOpen(false)} />
    </>
  );
}
