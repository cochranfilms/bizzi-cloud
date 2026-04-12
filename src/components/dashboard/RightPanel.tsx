"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import {
  HardDrive,
  FolderKanban,
  Activity,
  Share2,
  MessageCircle,
  FolderOpen,
  Settings,
  Users,
  Palette,
  Headphones,
  Heart,
  ChevronDown,
} from "lucide-react";
import StorageBadge from "./StorageBadge";
import DashboardColorsModal from "./DashboardColorsModal";
import SupportTicketModal from "./SupportTicketModal";
import { useEnterpriseOptional } from "@/context/EnterpriseContext";
import { useBackup } from "@/context/BackupContext";
import { useEffectivePowerUps } from "@/hooks/useEffectivePowerUps";
import { buildHomePillarRows } from "@/lib/home-pillar-drives";

/** Matches {@link LayoutSettingsBar} “Layout” control — compact rail rows. */
const railRow =
  "flex w-full min-h-8 items-center gap-2 rounded-md px-2.5 py-1.5 text-left text-xs font-medium transition-colors";

const railLinkIdle = `${railRow} border-0 bg-neutral-100 text-neutral-600 ring-1 ring-neutral-200/60 hover:bg-neutral-200/60 hover:text-neutral-900 dark:bg-neutral-800/80 dark:text-neutral-400 dark:ring-neutral-700/60 dark:hover:bg-neutral-700/60 dark:hover:text-white`;

const railLinkActive = `${railRow} border-0 bg-[var(--enterprise-primary)]/15 text-neutral-900 ring-1 ring-[var(--enterprise-primary)]/40 dark:text-white`;

const railMutedLinkRow = `${railRow} text-neutral-700 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800`;

interface RightPanelProps {
  onMobileClose?: () => void;
  basePath?: string;
  commentsHref?: string;
  storageComponent?: React.ReactNode;
}

function WorkspaceDriveRail({
  basePath,
  pathname,
  onMobileClose,
}: {
  basePath: string;
  pathname: string | null;
  onMobileClose?: () => void;
}) {
  const searchParams = useSearchParams();
  const { linkedDrives, loading: drivesLoading } = useBackup();
  const { hasEditor, hasGallerySuite, loading: powerUpLoading } = useEffectivePowerUps();

  const pillars = useMemo(
    () => buildHomePillarRows(linkedDrives, { hasEditor, hasGallerySuite }),
    [linkedDrives, hasEditor, hasGallerySuite]
  );

  if (drivesLoading || powerUpLoading || pillars.length === 0) return null;

  const path = pathname ?? "";
  const isWorkspaceHome = path === basePath || path === `${basePath}/`;
  const driveParam = searchParams?.get("drive") ?? null;

  return (
    <>
      {pillars.map(({ key, label, drive }) => {
        const href = `${basePath}?drive=${encodeURIComponent(drive.id)}`;
        const active = Boolean(isWorkspaceHome && driveParam === drive.id);
        return (
          <li key={key}>
            <Link
              href={href}
              onClick={onMobileClose}
              className={active ? railLinkActive : railLinkIdle}
            >
              <HardDrive
                className="h-3.5 w-3.5 shrink-0 text-[var(--enterprise-primary)]"
                strokeWidth={1.75}
              />
              <span className="min-w-0 truncate">{label}</span>
            </Link>
          </li>
        );
      })}
    </>
  );
}

function ActivityRailGroup({
  basePath,
  pathname,
  commentsHref,
  onMobileClose,
}: {
  basePath: string;
  pathname: string | null;
  commentsHref?: string;
  onMobileClose?: () => void;
}) {
  const path = pathname ?? "";
  const heartsHref = `${basePath}/hearts`;
  const childActive =
    path === heartsHref ||
    path.startsWith(`${heartsHref}/`) ||
    Boolean(commentsHref && (path === commentsHref || path.startsWith(`${commentsHref}/`)));
  const [open, setOpen] = useState(childActive);

  useEffect(() => {
    if (childActive) setOpen(true);
  }, [childActive]);

  const showCommented = Boolean(commentsHref);

  return (
    <li className="space-y-1">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className={`${railLinkIdle} ${childActive ? "ring-[var(--enterprise-primary)]/35" : ""} justify-between`}
        aria-expanded={open}
      >
        <span className="flex min-w-0 items-center gap-2">
          <Activity className="h-3.5 w-3.5 shrink-0 text-[var(--enterprise-primary)]" strokeWidth={1.75} />
          <span>Activity</span>
        </span>
        <ChevronDown
          className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden
        />
      </button>
      {open ? (
        <ul className="ml-1 space-y-1 border-l border-neutral-200 pl-2 dark:border-neutral-700" role="list">
          <li>
            <Link
              href={heartsHref}
              onClick={onMobileClose}
              className={
                path === heartsHref || path.startsWith(`${heartsHref}/`) ? railLinkActive : railLinkIdle
              }
            >
              <Heart className="h-3.5 w-3.5 shrink-0 text-[var(--enterprise-primary)]" strokeWidth={1.75} />
              Favorited
            </Link>
          </li>
          {showCommented && commentsHref ? (
            <li>
              <Link
                href={commentsHref}
                onClick={onMobileClose}
                className={
                  path === commentsHref || path.startsWith(`${commentsHref}/`) ? railLinkActive : railLinkIdle
                }
              >
                <MessageCircle
                  className="h-3.5 w-3.5 shrink-0 text-[var(--enterprise-primary)]"
                  strokeWidth={1.75}
                />
                Commented
              </Link>
            </li>
          ) : null}
        </ul>
      ) : null}
    </li>
  );
}

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
  const isActive = pathname === href || pathname.startsWith(`${href}/`);
  return (
    <li>
      <Link
        href={href}
        onClick={onMobileClose}
        className={isActive ? railLinkActive : railLinkIdle}
      >
        <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--enterprise-primary)]" strokeWidth={1.75} />
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
      <button type="button" onClick={onClick} className={railLinkIdle}>
        <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--enterprise-primary)]" strokeWidth={1.75} />
        {label}
      </button>
    </li>
  );
}

export default function RightPanel({
  onMobileClose,
  basePath = "/dashboard",
  commentsHref,
  storageComponent,
}: RightPanelProps) {
  const pathname = usePathname();
  const [colorsModalOpen, setColorsModalOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const enterpriseCtx = useEnterpriseOptional();
  const isEnterprisePanel = basePath === "/enterprise" && enterpriseCtx !== null;
  const isAdmin = enterpriseCtx?.role === "admin";

  const workspaceMenuTitle = "Workspace";

  if (isEnterprisePanel) {
    return (
      <>
        <aside className="flex h-full w-full max-w-[min(20rem,100vw-2rem)] flex-shrink-0 flex-col border-l border-neutral-200 bg-[var(--dashboard-bg)] shadow-xl sm:w-56 xl:max-w-none xl:shadow-none dark:border-neutral-800">
          <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
            <div className="min-h-0 flex-1 overflow-y-auto border-b border-neutral-200 p-4 dark:border-neutral-800">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {workspaceMenuTitle}
              </h3>
              <ul className="space-y-1.5">
                <EnterpriseSidebarCard
                  href={basePath}
                  label="Files"
                  Icon={FolderOpen}
                  pathname={pathname}
                  onMobileClose={onMobileClose}
                />
                <WorkspaceDriveRail basePath={basePath} pathname={pathname} onMobileClose={onMobileClose} />
                <ActivityRailGroup
                  basePath={basePath}
                  pathname={pathname}
                  commentsHref={commentsHref}
                  onMobileClose={onMobileClose}
                />
                <EnterpriseSidebarCard
                  href={`${basePath}/projects`}
                  label="NLE Projects"
                  Icon={FolderKanban}
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
      <aside className="flex h-full w-full max-w-[min(20rem,100vw-2rem)] flex-shrink-0 flex-col border-l border-neutral-200 bg-[var(--dashboard-bg)] shadow-xl sm:w-56 xl:max-w-none xl:shadow-none dark:border-neutral-800">
        <div className="flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
          <div className="min-h-0 flex-1 overflow-y-auto border-b border-neutral-200 dark:border-neutral-800">
            <div className="p-4">
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                {workspaceMenuTitle}
              </h3>
              <ul className="space-y-1.5">
                <WorkspaceDriveRail basePath={basePath} pathname={pathname} onMobileClose={onMobileClose} />
                <ActivityRailGroup
                  basePath={basePath}
                  pathname={pathname}
                  commentsHref={commentsHref}
                  onMobileClose={onMobileClose}
                />
                <li>
                  <Link
                    href={`${basePath}/projects`}
                    onClick={onMobileClose}
                    className={
                      pathname === `${basePath}/projects` || pathname.startsWith(`${basePath}/projects/`)
                        ? railLinkActive
                        : railLinkIdle
                    }
                  >
                    <FolderKanban
                      className="h-3.5 w-3.5 shrink-0 text-[var(--enterprise-primary)]"
                      strokeWidth={1.75}
                    />
                    NLE Projects
                  </Link>
                </li>
                <li>
                  <button
                    type="button"
                    onClick={() => {
                      onMobileClose?.();
                      setColorsModalOpen(true);
                    }}
                    className={railLinkIdle}
                  >
                    <Palette
                      className="h-3.5 w-3.5 shrink-0 text-[var(--enterprise-primary)]"
                      strokeWidth={1.75}
                    />
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
                    className={railLinkIdle}
                  >
                    <Headphones
                      className="h-3.5 w-3.5 shrink-0 text-[var(--enterprise-primary)]"
                      strokeWidth={1.75}
                    />
                    Support ticket
                  </button>
                </li>
              </ul>
            </div>

            <div className="border-t border-neutral-200 p-4 dark:border-neutral-800">
              <Link
                href={`${basePath}/shared`}
                onClick={onMobileClose}
                className={railMutedLinkRow}
              >
                <Share2 className="h-3.5 w-3.5 text-[var(--enterprise-primary)]" strokeWidth={1.75} />
                Shared with you
              </Link>
            </div>
          </div>

          <div className="flex min-h-0 flex-shrink-0 flex-col overflow-hidden">
            <div className="flex min-h-0 flex-col p-4">
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
