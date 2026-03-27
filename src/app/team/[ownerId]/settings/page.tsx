"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import TopBar from "@/components/dashboard/TopBar";
import DashboardRouteFade from "@/components/dashboard/DashboardRouteFade";
import { useAuth } from "@/context/AuthContext";
import {
  usePersonalTeamWorkspaceRequired,
  notifyTeamWorkspaceUpdated,
} from "@/context/PersonalTeamWorkspaceContext";
import { ENTERPRISE_THEMES } from "@/lib/enterprise-themes";
import type { EnterpriseThemeId } from "@/types/enterprise";
import { TeamManagementSection } from "@/components/dashboard/TeamManagementSection";
import WorkspaceCommentActivity from "@/components/dashboard/WorkspaceCommentActivity";
import { Building2, Image as ImageIcon, Loader2 } from "lucide-react";

export default function TeamSettingsPage() {
  const { user } = useAuth();
  const { teamOwnerUid } = usePersonalTeamWorkspaceRequired();
  const [ready, setReady] = useState(false);
  const [teamName, setTeamName] = useState("");
  const [themeId, setThemeId] = useState<EnterpriseThemeId>("bizzi");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const loadSettings = useCallback(async () => {
    if (!user) return;
    const token = await user.getIdToken();
    const res = await fetch(
      `/api/personal-team/settings?owner_uid=${encodeURIComponent(teamOwnerUid)}`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!res.ok) {
      throw new Error("Failed to load team settings");
    }
    const data = (await res.json()) as {
      team_name: string | null;
      logo_url: string | null;
      theme: string;
      is_owner: boolean;
    };
    setTeamName(data.team_name ?? "");
    setThemeId((data.theme as EnterpriseThemeId) || "bizzi");
    setLogoPreview(data.logo_url);
    setIsOwner(Boolean(data.is_owner));
    setReady(true);
  }, [user, teamOwnerUid]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await loadSettings();
      } catch {
        if (!cancelled) setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSettings]);

  const handleSaveName = async () => {
    if (!user || !isOwner) return;
    const trimmed = teamName.trim();
    if (trimmed.length < 2) {
      setNameError("Team name must be at least 2 characters");
      return;
    }
    setNameError(null);
    setSavingName(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/personal-team/settings?owner_uid=${encodeURIComponent(teamOwnerUid)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ team_name: trimmed }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data.error as string) ?? "Failed to update");
      }
      await loadSettings();
      notifyTeamWorkspaceUpdated(teamOwnerUid);
    } catch (err) {
      setNameError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSavingName(false);
    }
  };

  const handleThemeChange = async (id: EnterpriseThemeId) => {
    if (!user || !isOwner) return;
    setThemeId(id);
    try {
      const token = await user.getIdToken();
      const res = await fetch(
        `/api/personal-team/settings?owner_uid=${encodeURIComponent(teamOwnerUid)}`,
        {
          method: "PATCH",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({ theme: id }),
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data.error as string) ?? "Failed to update theme");
      }
      notifyTeamWorkspaceUpdated(teamOwnerUid);
    } catch {
      await loadSettings();
    }
  };

  const handleLogoSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setLogoError("Please select an image file (PNG, JPG, etc.)");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      setLogoError("Image must be under 2 MB");
      return;
    }
    setLogoError(null);
    setLogoFile(file);
    const url = URL.createObjectURL(file);
    setLogoPreview(url);
  };

  const handleUploadLogo = async () => {
    if (!user || !isOwner || !logoFile) return;
    setUploadingLogo(true);
    setLogoError(null);
    try {
      const token = await user.getIdToken();
      const formData = new FormData();
      formData.append("logo", logoFile);
      formData.append("team_owner_uid", teamOwnerUid);
      const res = await fetch("/api/personal-team/logo", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error((data.error as string) ?? "Failed to upload");
      }
      const data = await res.json();
      setLogoPreview(data.logo_url as string);
      setLogoFile(null);
      await loadSettings();
      notifyTeamWorkspaceUpdated(teamOwnerUid);
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Failed to upload");
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <>
      <TopBar title="Team settings" />
      <main className="flex-1 overflow-auto p-6">
        <DashboardRouteFade ready={ready} srOnlyMessage="Loading team settings">
          <div className="mx-auto max-w-2xl space-y-8">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              These settings apply to this team workspace only (shared folders and storage scoped to this team).
              Your personal account, billing, and personal files are managed under{" "}
              <Link href="/dashboard/settings" className="text-bizzi-blue hover:underline dark:text-bizzi-cyan">
                Personal Settings
              </Link>
              .
            </p>

            {!isOwner && (
              <div className="rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/50">
                <p className="text-sm text-amber-800 dark:text-amber-200">
                  You are a team member. Only the team owner can change the team name, logo, and theme.
                </p>
              </div>
            )}

            <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
                <Building2 className="h-5 w-5 text-[var(--enterprise-primary)]" />
                Team name
              </h2>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={teamName}
                  onChange={(e) => {
                    setTeamName(e.target.value);
                    setNameError(null);
                  }}
                  placeholder="Your team name"
                  disabled={!isOwner}
                  className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--enterprise-primary)] disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                />
                {isOwner && (
                  <button
                    type="button"
                    onClick={handleSaveName}
                    disabled={savingName || teamName.trim().length < 2}
                    className="shrink-0 rounded-lg bg-[var(--enterprise-primary)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                  >
                    {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                  </button>
                )}
              </div>
              {nameError && (
                <p className="mt-1 text-sm text-red-600 dark:text-red-400">{nameError}</p>
              )}
            </section>

            <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
              <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
                <ImageIcon className="h-5 w-5 text-[var(--enterprise-primary)]" />
                Logo
              </h2>
              <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                <div className="flex shrink-0 flex-col items-center gap-2">
                  <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-xl border border-neutral-200 bg-neutral-50 dark:border-neutral-700 dark:bg-neutral-800">
                    {logoPreview ? (
                      <Image
                        src={logoPreview}
                        alt="Team logo"
                        width={96}
                        height={96}
                        className="h-full w-full object-contain"
                        unoptimized
                      />
                    ) : (
                      <ImageIcon className="h-10 w-10 text-neutral-400" />
                    )}
                  </div>
                  {isOwner && (
                    <>
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept="image/*"
                        className="hidden"
                        onChange={handleLogoSelect}
                        aria-label="Upload team logo"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="text-sm text-[var(--enterprise-primary)] hover:underline"
                      >
                        Choose image
                      </button>
                      {logoFile && (
                        <button
                          type="button"
                          onClick={handleUploadLogo}
                          disabled={uploadingLogo}
                          className="flex items-center gap-1 rounded-lg bg-[var(--enterprise-primary)] px-3 py-1.5 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {uploadingLogo ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            "Upload"
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>
                {logoError && (
                  <p className="text-sm text-red-600 dark:text-red-400">{logoError}</p>
                )}
              </div>
            </section>

            <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
              <h2 className="mb-4 text-lg font-semibold text-neutral-900 dark:text-white">Theme</h2>
              <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
                Choose accent colors for this team workspace (navigation and highlights).
              </p>
              <div className="grid grid-cols-4 gap-3 sm:grid-cols-7">
                {ENTERPRISE_THEMES.map((theme) => (
                  <button
                    key={theme.id}
                    type="button"
                    onClick={() => isOwner && handleThemeChange(theme.id)}
                    disabled={!isOwner}
                    className={`flex flex-col items-center gap-1.5 rounded-lg border-2 p-3 transition-colors ${
                      themeId === theme.id
                        ? "border-[var(--enterprise-primary)] bg-[var(--enterprise-primary)]/10"
                        : "border-neutral-200 hover:border-neutral-300 dark:border-neutral-700 dark:hover:border-neutral-600"
                    } ${!isOwner ? "cursor-default opacity-70" : ""}`}
                    title={theme.name}
                  >
                    <div
                      className="h-8 w-8 rounded-full"
                      style={{ backgroundColor: theme.primary }}
                    />
                    <span className="text-xs font-medium text-neutral-700 dark:text-neutral-300">
                      {theme.name}
                    </span>
                  </button>
                ))}
              </div>
            </section>

            <WorkspaceCommentActivity
              apiPath={`/api/team/${encodeURIComponent(teamOwnerUid)}/comments/activity`}
              filesBasePath={`/team/${encodeURIComponent(teamOwnerUid)}`}
            />

            <TeamManagementSection />
          </div>
        </DashboardRouteFade>
      </main>
    </>
  );
}
