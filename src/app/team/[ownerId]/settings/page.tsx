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
import { TeamManagementSection } from "@/components/dashboard/TeamManagementSection";
import SettingsScopeHeader from "@/components/settings/SettingsScopeHeader";
import TeamMemberPersonalSettingsLayout from "@/components/settings/TeamMemberPersonalSettingsLayout";
import SettingsSidebarNav from "@/components/settings/SettingsSidebarNav";
import type { SettingsNavItem } from "@/components/settings/SettingsSidebarNav";
import { productSettingsCopy } from "@/lib/product-settings-copy";
import { Building2, Image as ImageIcon, Loader2, Users } from "lucide-react";

const OWNER_TEAM_NAV: SettingsNavItem[] = [
  { id: "branding", label: "Workspace branding", icon: Building2 },
  { id: "management", label: "Team administration", icon: Users },
];

export default function TeamSettingsPage() {
  const { user } = useAuth();
  const teamWs = usePersonalTeamWorkspaceRequired();
  const { teamOwnerUid, teamName, teamLogoUrl, roleLabel } = teamWs;
  const [ownerSection, setOwnerSection] = useState<"branding" | "management">("branding");
  const [ready, setReady] = useState(false);
  const [teamNameState, setTeamNameState] = useState("");
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState<boolean | null>(null);
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
      is_owner: boolean;
    };
    setTeamNameState(data.team_name ?? "");
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
        if (!cancelled) {
          setIsOwner(user?.uid === teamOwnerUid);
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [loadSettings]);

  const setOwnerNav = useCallback((id: string) => {
    const next = id === "management" ? "management" : "branding";
    setOwnerSection(next);
    if (typeof window !== "undefined") {
      window.history.replaceState(
        null,
        "",
        `#${next === "management" ? "team-management" : "branding"}`
      );
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !ready || isOwner !== true) return;
    const h = window.location.hash.replace(/^#/, "");
    if (h === "team-management" || h === "management" || h === "team") {
      setOwnerSection("management");
    } else if (h === "branding") {
      setOwnerSection("branding");
    }
  }, [ready, isOwner]);

  const handleSaveName = async () => {
    if (!user || !isOwner) return;
    const trimmed = teamNameState.trim();
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

  if (ready && isOwner === false) {
    return (
      <>
        <TopBar title="Settings" />
        <main className="flex-1 overflow-auto p-6">
          <TeamMemberPersonalSettingsLayout
            teamOwnerUid={teamOwnerUid}
            teamName={teamName}
            teamLogoUrl={teamLogoUrl}
            roleLabel={roleLabel}
          />
        </main>
      </>
    );
  }

  return (
    <>
      <TopBar title="Team workspace" />
      <main className="flex-1 overflow-auto p-6">
        <DashboardRouteFade ready={ready && isOwner === true} srOnlyMessage="Loading team settings">
          <div className="mx-auto flex max-w-5xl flex-col gap-8 lg:flex-row lg:items-start">
            <SettingsSidebarNav
              variant="enterprise"
              items={OWNER_TEAM_NAV}
              activeId={ownerSection}
              onSelect={setOwnerNav}
            />
            <div className="min-w-0 flex-1 space-y-8">
              <SettingsScopeHeader
                title="Team workspace administration"
                scope="personalTeam"
                permission={{ kind: "editable" }}
                effectSummary="Manage members, invites, storage, and branding for this team workspace. Your subscription and personal profile stay under Dashboard → Settings."
              >
                <p className="text-sm text-neutral-600 dark:text-neutral-400">
                  Your personal account and billing:{" "}
                  <Link
                    href="/dashboard/settings"
                    className="text-bizzi-blue hover:underline dark:text-bizzi-cyan"
                  >
                    Dashboard → Settings
                  </Link>
                  .
                </p>
              </SettingsScopeHeader>

              {ownerSection === "branding" && (
                <>
                  <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
                    <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
                      <Building2 className="h-5 w-5 text-[var(--enterprise-primary)]" />
                      Team name
                    </h2>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={teamNameState}
                        onChange={(e) => {
                          setTeamNameState(e.target.value);
                          setNameError(null);
                        }}
                        placeholder="Your team name"
                        className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--enterprise-primary)] dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                      />
                      <button
                        type="button"
                        onClick={handleSaveName}
                        disabled={savingName || teamNameState.trim().length < 2}
                        className="shrink-0 rounded-lg bg-[var(--enterprise-primary)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                      >
                        {savingName ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
                      </button>
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
                      </div>
                      {logoError && (
                        <p className="text-sm text-red-600 dark:text-red-400">{logoError}</p>
                      )}
                    </div>
                  </section>
                </>
              )}

              {ownerSection === "management" && <TeamManagementSection />}
            </div>
          </div>
        </DashboardRouteFade>
      </main>
    </>
  );
}
