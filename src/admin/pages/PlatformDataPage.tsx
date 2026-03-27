"use client";

import { useCallback, useEffect, useState } from "react";
import PageHeader from "../components/shared/PageHeader";
import DataTable, { type Column } from "../components/shared/DataTable";
import PlatformJsonDrawer from "../components/platform-data/PlatformJsonDrawer";
import { useAuth } from "@/context/AuthContext";
import {
  fetchPlatformSummary,
  fetchPlatformWorkspaces,
  fetchPlatformShares,
  fetchPlatformActivity,
} from "../services/adminPlatformDataService";
import type {
  AdminActivityRow,
  AdminShareRow,
  AdminWorkspaceRow,
  PlatformSummary,
} from "../types/adminPlatformData.types";
import { PLATFORM_ACTIVITY_EVENT_TYPES } from "../types/adminPlatformData.types";
import { formatDateTime } from "@/admin/utils/formatDateTime";
import { Activity, Box, Loader2, RefreshCw, Share2 } from "lucide-react";

type TabId = "workspaces" | "shares" | "activity";

const PAGE_LIMIT = 25;

export default function PlatformDataPage() {
  const { user } = useAuth();
  const getToken = useCallback(() => (user ? user.getIdToken() : Promise.resolve(null)), [user]);

  const [tab, setTab] = useState<TabId>("workspaces");
  const [summary, setSummary] = useState<PlatformSummary | null>(null);
  const [summaryLoading, setSummaryLoading] = useState(true);

  const [wsRows, setWsRows] = useState<AdminWorkspaceRow[]>([]);
  const [wsTotal, setWsTotal] = useState(0);
  const [wsPage, setWsPage] = useState(1);
  const [wsLoading, setWsLoading] = useState(false);
  const [wsOrg, setWsOrg] = useState("");
  const [wsType, setWsType] = useState("");
  const [wsQ, setWsQ] = useState("");

  const [shRows, setShRows] = useState<AdminShareRow[]>([]);
  const [shTotal, setShTotal] = useState(0);
  const [shPage, setShPage] = useState(1);
  const [shLoading, setShLoading] = useState(false);
  const [shOwner, setShOwner] = useState("");
  const [shRecipient, setShRecipient] = useState("");
  const [shQ, setShQ] = useState("");
  const [shHideExpired, setShHideExpired] = useState(false);

  const [actRows, setActRows] = useState<AdminActivityRow[]>([]);
  const [actTotal, setActTotal] = useState(0);
  const [actPage, setActPage] = useState(1);
  const [actLoading, setActLoading] = useState(false);
  const [actActor, setActActor] = useState("");
  const [actEvent, setActEvent] = useState("");
  const [actScope, setActScope] = useState("");
  const [actOrg, setActOrg] = useState("");
  const [actQ, setActQ] = useState("");

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [drawerTitle, setDrawerTitle] = useState("");
  const [drawerSubtitle, setDrawerSubtitle] = useState<string | null>(null);
  const [drawerPayload, setDrawerPayload] = useState<unknown>(null);

  const loadSummary = useCallback(async () => {
    setSummaryLoading(true);
    try {
      const s = await fetchPlatformSummary({ getToken });
      setSummary(s);
    } catch {
      setSummary(null);
    } finally {
      setSummaryLoading(false);
    }
  }, [getToken]);

  const loadWorkspaces = useCallback(async () => {
    setWsLoading(true);
    try {
      const r = await fetchPlatformWorkspaces(
        {
          page: wsPage,
          limit: PAGE_LIMIT,
          organizationId: wsOrg.trim() || undefined,
          workspaceType: wsType || undefined,
          q: wsQ.trim() || undefined,
        },
        { getToken }
      );
      setWsRows(r.workspaces);
      setWsTotal(r.total);
    } finally {
      setWsLoading(false);
    }
  }, [getToken, wsPage, wsOrg, wsType, wsQ]);

  const loadShares = useCallback(async () => {
    setShLoading(true);
    try {
      const r = await fetchPlatformShares(
        {
          page: shPage,
          limit: PAGE_LIMIT,
          ownerId: shOwner.trim() || undefined,
          recipientMode: shRecipient || undefined,
          q: shQ.trim() || undefined,
          hideExpired: shHideExpired,
        },
        { getToken }
      );
      setShRows(r.shares);
      setShTotal(r.total);
    } finally {
      setShLoading(false);
    }
  }, [getToken, shPage, shOwner, shRecipient, shQ, shHideExpired]);

  const loadActivity = useCallback(async () => {
    setActLoading(true);
    try {
      const r = await fetchPlatformActivity(
        {
          page: actPage,
          limit: PAGE_LIMIT,
          actorUserId: actActor.trim() || undefined,
          eventType: actEvent || undefined,
          scopeType: actScope || undefined,
          organizationId: actOrg.trim() || undefined,
          q: actQ.trim() || undefined,
        },
        { getToken }
      );
      setActRows(r.events);
      setActTotal(r.total);
    } finally {
      setActLoading(false);
    }
  }, [getToken, actPage, actActor, actEvent, actScope, actOrg, actQ]);

  useEffect(() => {
    void loadSummary();
  }, [loadSummary]);

  useEffect(() => {
    if (tab === "workspaces") void loadWorkspaces();
  }, [tab, loadWorkspaces]);

  useEffect(() => {
    if (tab === "shares") void loadShares();
  }, [tab, loadShares]);

  useEffect(() => {
    if (tab === "activity") void loadActivity();
  }, [tab, loadActivity]);

  const openJson = (title: string, subtitle: string | null, payload: unknown) => {
    setDrawerTitle(title);
    setDrawerSubtitle(subtitle);
    setDrawerPayload(payload);
    setDrawerOpen(true);
  };

  const refreshAll = () => {
    void loadSummary();
    if (tab === "workspaces") void loadWorkspaces();
    if (tab === "shares") void loadShares();
    if (tab === "activity") void loadActivity();
  };

  const workspaceColumns: Column<AdminWorkspaceRow>[] = [
    {
      id: "name",
      header: "Workspace",
      cell: (r) => (
        <div>
          <div className="font-medium text-neutral-900 dark:text-white">{r.name || "—"}</div>
          <div className="font-mono text-xs text-neutral-500">{r.id}</div>
        </div>
      ),
    },
    {
      id: "type",
      header: "Type",
      cell: (r) => (
        <span className="rounded bg-neutral-100 px-2 py-0.5 text-xs dark:bg-neutral-800">
          {r.workspace_type}
        </span>
      ),
    },
    {
      id: "org",
      header: "Organization",
      cell: (r) => (
        <div>
          <div className="text-sm">{r.organization_name ?? "—"}</div>
          <div className="font-mono text-xs text-neutral-500">{r.organization_id}</div>
        </div>
      ),
    },
    {
      id: "members",
      header: "Members",
      cell: (r) => r.member_count,
    },
    {
      id: "updated",
      header: "Updated",
      cell: (r) => (r.updated_at ? formatDateTime(r.updated_at) : "—"),
    },
  ];

  const shareColumns: Column<AdminShareRow>[] = [
    {
      id: "name",
      header: "Share",
      cell: (r) => (
        <div>
          <div className="font-medium text-neutral-900 dark:text-white">{r.folder_name}</div>
          <div className="font-mono text-xs text-neutral-500">{r.token}</div>
        </div>
      ),
    },
    {
      id: "owner",
      header: "Owner",
      cell: (r) => (
        <div>
          <div className="text-sm">{r.owner_email ?? "—"}</div>
          <div className="font-mono text-xs text-neutral-500">{r.owner_id}</div>
        </div>
      ),
    },
    {
      id: "mode",
      header: "Recipients",
      cell: (r) => (
        <span className="text-xs">{r.recipient_mode ?? "—"}</span>
      ),
    },
    {
      id: "workspace",
      header: "Workspace target",
      cell: (r) =>
        r.workspace_target ? (
          <span className="text-xs">
            {r.workspace_target.kind}:{r.workspace_target.id?.slice(0, 8)}…
          </span>
        ) : (
          "—"
        ),
    },
    {
      id: "status",
      header: "Status",
      cell: (r) => (
        <span
          className={
            r.is_expired
              ? "text-amber-700 dark:text-amber-400"
              : "text-emerald-700 dark:text-emerald-400"
          }
        >
          {r.is_expired ? "Expired" : "Active"}
        </span>
      ),
    },
    {
      id: "created",
      header: "Created",
      cell: (r) => (r.created_at ? formatDateTime(r.created_at) : "—"),
    },
  ];

  const activityColumns: Column<AdminActivityRow>[] = [
    {
      id: "event",
      header: "Event",
      cell: (r) => (
        <span className="font-mono text-xs text-neutral-800 dark:text-neutral-200">
          {r.event_type}
        </span>
      ),
    },
    {
      id: "actor",
      header: "Actor",
      cell: (r) => <span className="font-mono text-xs">{r.actor_user_id}</span>,
    },
    {
      id: "scope",
      header: "Scope",
      cell: (r) => (
        <div className="text-xs">
          <div>{r.scope_type}</div>
          {r.organization_id && (
            <div className="font-mono text-neutral-500">org {r.organization_id.slice(0, 8)}…</div>
          )}
        </div>
      ),
    },
    {
      id: "workspace",
      header: "Workspace",
      cell: (r) =>
        r.workspace_id ? (
          <span className="font-mono text-xs">
            {r.workspace_type ?? "?"} · {r.workspace_id.slice(0, 8)}…
          </span>
        ) : (
          "—"
        ),
    },
    {
      id: "target",
      header: "Target",
      cell: (r) => (
        <div className="max-w-[200px] truncate text-xs" title={r.target_name ?? r.file_path ?? ""}>
          {r.target_name ?? r.file_path ?? "—"}
        </div>
      ),
    },
    {
      id: "time",
      header: "Time",
      cell: (r) => (r.created_at ? formatDateTime(r.created_at) : "—"),
    },
  ];

  const tabButtons: { id: TabId; label: string; count?: number }[] = [
    { id: "workspaces", label: "Workspaces", count: summary?.workspaceCount },
    { id: "shares", label: "Shares", count: summary?.shareCount },
    {
      id: "activity",
      label: "Activity",
      count: summary?.activityLogsTotal,
    },
  ];

  const pager = (
    total: number,
    page: number,
    setPage: (n: number) => void,
    loading: boolean
  ) => {
    const pages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
    return (
      <div className="flex flex-wrap items-center gap-3 text-sm text-neutral-600 dark:text-neutral-400">
        <span>
          {total} total · page {page} of {pages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            disabled={loading || page <= 1}
            onClick={() => setPage(page - 1)}
            className="rounded-lg border border-neutral-200 px-3 py-1 disabled:opacity-40 dark:border-neutral-600"
          >
            Previous
          </button>
          <button
            type="button"
            disabled={loading || page >= pages}
            onClick={() => setPage(page + 1)}
            className="rounded-lg border border-neutral-200 px-3 py-1 disabled:opacity-40 dark:border-neutral-600"
          >
            Next
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="Platform data"
        subtitle="Workspaces, folder shares, and live activity across every scope—alongside existing analytics elsewhere in admin."
        actions={
          <button
            type="button"
            onClick={() => refreshAll()}
            className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm font-medium dark:border-neutral-700 dark:bg-neutral-800"
          >
            <RefreshCw className="h-4 w-4" />
            Refresh
          </button>
        }
      />

      <div className="flex flex-wrap gap-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900">
        {summaryLoading ? (
          <div className="flex items-center gap-2 text-sm text-neutral-500">
            <Loader2 className="h-4 w-4 animate-spin" />
            Loading summary…
          </div>
        ) : summary ? (
          <>
            <div className="flex min-w-[140px] items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 dark:bg-neutral-800/80">
              <Box className="h-4 w-4 text-bizzi-blue dark:text-bizzi-cyan" />
              <div>
                <div className="text-xs text-neutral-500">Workspaces</div>
                <div className="text-lg font-semibold tabular-nums">{summary.workspaceCount}</div>
              </div>
            </div>
            <div className="flex min-w-[140px] items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 dark:bg-neutral-800/80">
              <Share2 className="h-4 w-4 text-violet-600 dark:text-violet-400" />
              <div>
                <div className="text-xs text-neutral-500">Folder shares</div>
                <div className="text-lg font-semibold tabular-nums">{summary.shareCount}</div>
              </div>
            </div>
            <div className="flex min-w-[140px] items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 dark:bg-neutral-800/80">
              <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
              <div>
                <div className="text-xs text-neutral-500">Activity (24h)</div>
                <div className="text-lg font-semibold tabular-nums">{summary.activityLogsLast24h}</div>
              </div>
            </div>
            <div className="flex min-w-[140px] items-center gap-2 rounded-lg bg-neutral-50 px-3 py-2 dark:bg-neutral-800/80">
              <div>
                <div className="text-xs text-neutral-500">Activity (all time)</div>
                <div className="text-lg font-semibold tabular-nums">{summary.activityLogsTotal}</div>
              </div>
            </div>
          </>
        ) : (
          <p className="text-sm text-amber-700 dark:text-amber-400">Could not load summary.</p>
        )}
      </div>

      <div className="flex flex-wrap gap-2 border-b border-neutral-200 pb-3 dark:border-neutral-700">
        {tabButtons.map((b) => (
          <button
            key={b.id}
            type="button"
            onClick={() => {
              setTab(b.id);
              if (b.id === "workspaces") setWsPage(1);
              if (b.id === "shares") setShPage(1);
              if (b.id === "activity") setActPage(1);
            }}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
              tab === b.id
                ? "bg-bizzi-blue text-white dark:bg-bizzi-cyan dark:text-neutral-900"
                : "bg-neutral-100 text-neutral-700 hover:bg-neutral-200 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            }`}
          >
            {b.label}
            {b.count != null && (
              <span className="ml-2 tabular-nums opacity-80">({b.count})</span>
            )}
          </button>
        ))}
      </div>

      {tab === "workspaces" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900 md:flex-row md:flex-wrap md:items-end">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-neutral-500">Organization ID</span>
              <input
                value={wsOrg}
                onChange={(e) => setWsOrg(e.target.value)}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 font-mono text-sm dark:border-neutral-600 dark:bg-neutral-800"
                placeholder="Filter by org…"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-neutral-500">Workspace type</span>
              <select
                value={wsType}
                onChange={(e) => setWsType(e.target.value)}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
              >
                <option value="">Any</option>
                <option value="private">private</option>
                <option value="org_shared">org_shared</option>
                <option value="team">team</option>
                <option value="project">project</option>
                <option value="gallery">gallery</option>
              </select>
            </label>
            <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-sm">
              <span className="text-neutral-500">Search name / id</span>
              <input
                value={wsQ}
                onChange={(e) => setWsQ(e.target.value)}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
                placeholder="Contains…"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setWsPage(1);
                void loadWorkspaces();
              }}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
            >
              Apply
            </button>
          </div>
          {pager(wsTotal, wsPage, setWsPage, wsLoading)}
          <DataTable
            columns={workspaceColumns}
            rows={wsRows}
            loading={wsLoading}
            keyExtractor={(r) => r.id}
            onRowClick={(r) => openJson(`Workspace ${r.id}`, r.name, r)}
          />
        </div>
      )}

      {tab === "shares" && (
        <div className="space-y-4">
          <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900 md:flex-row md:flex-wrap md:items-end">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-neutral-500">Owner UID</span>
              <input
                value={shOwner}
                onChange={(e) => setShOwner(e.target.value)}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 font-mono text-sm dark:border-neutral-600 dark:bg-neutral-800"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-neutral-500">Recipient mode</span>
              <select
                value={shRecipient}
                onChange={(e) => setShRecipient(e.target.value)}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
              >
                <option value="">Any</option>
                <option value="workspace">workspace</option>
                <option value="email">email</option>
              </select>
            </label>
            <label className="flex min-w-[200px] flex-1 flex-col gap-1 text-sm">
              <span className="text-neutral-500">Search</span>
              <input
                value={shQ}
                onChange={(e) => setShQ(e.target.value)}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
              />
            </label>
            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={shHideExpired}
                onChange={(e) => setShHideExpired(e.target.checked)}
              />
              Hide expired
            </label>
            <button
              type="button"
              onClick={() => {
                setShPage(1);
                void loadShares();
              }}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
            >
              Apply
            </button>
          </div>
          {pager(shTotal, shPage, setShPage, shLoading)}
          <DataTable
            columns={shareColumns}
            rows={shRows}
            loading={shLoading}
            keyExtractor={(r) => r.id}
            onRowClick={(r) => openJson(`Share ${r.token}`, r.share_path, r)}
          />
        </div>
      )}

      {tab === "activity" && (
        <div className="space-y-4">
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            Filters map to Firestore indexes: combine organization + scope, or actor + event type, or use a single
            dimension. Free-text search runs on the fetched page window.
          </p>
          <div className="flex flex-col gap-3 rounded-xl border border-neutral-200 bg-white p-4 dark:border-neutral-700 dark:bg-neutral-900 md:flex-row md:flex-wrap md:items-end">
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-neutral-500">Actor UID</span>
              <input
                value={actActor}
                onChange={(e) => setActActor(e.target.value)}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 font-mono text-sm dark:border-neutral-600 dark:bg-neutral-800"
              />
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-neutral-500">Event type</span>
              <select
                value={actEvent}
                onChange={(e) => setActEvent(e.target.value)}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
              >
                <option value="">Any</option>
                {PLATFORM_ACTIVITY_EVENT_TYPES.map((ev) => (
                  <option key={ev} value={ev}>
                    {ev}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-neutral-500">Scope</span>
              <select
                value={actScope}
                onChange={(e) => setActScope(e.target.value)}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
              >
                <option value="">Any</option>
                <option value="personal_account">personal_account</option>
                <option value="organization">organization</option>
              </select>
            </label>
            <label className="flex flex-col gap-1 text-sm">
              <span className="text-neutral-500">Organization ID</span>
              <input
                value={actOrg}
                onChange={(e) => setActOrg(e.target.value)}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 font-mono text-sm dark:border-neutral-600 dark:bg-neutral-800"
              />
            </label>
            <label className="flex min-w-[180px] flex-1 flex-col gap-1 text-sm">
              <span className="text-neutral-500">Contains (client)</span>
              <input
                value={actQ}
                onChange={(e) => setActQ(e.target.value)}
                className="rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800"
              />
            </label>
            <button
              type="button"
              onClick={() => {
                setActPage(1);
                void loadActivity();
              }}
              className="rounded-lg bg-neutral-900 px-4 py-2 text-sm font-medium text-white dark:bg-white dark:text-neutral-900"
            >
              Apply
            </button>
          </div>
          {pager(actTotal, actPage, setActPage, actLoading)}
          <DataTable
            columns={activityColumns}
            rows={actRows}
            loading={actLoading}
            keyExtractor={(r) => r.id}
            onRowClick={(r) => openJson(r.event_type, r.actor_user_id, r)}
          />
        </div>
      )}

      <PlatformJsonDrawer
        title={drawerTitle}
        subtitle={drawerSubtitle}
        payload={drawerPayload}
        isOpen={drawerOpen}
        onClose={() => setDrawerOpen(false)}
      />
    </div>
  );
}
