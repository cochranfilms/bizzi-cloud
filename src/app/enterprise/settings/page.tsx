"use client";

import { useState, useRef, useCallback, useEffect, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import TopBar from "@/components/dashboard/TopBar";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useAuth } from "@/context/AuthContext";
import { ADDON_LABELS } from "@/lib/pricing-data";
import Image from "next/image";
import {
  Building2,
  Globe,
  Image as ImageIcon,
  Loader2,
  HardDrive,
  CreditCard,
  Zap,
  Users,
  HelpCircle,
} from "lucide-react";
import Link from "next/link";
import StorageAnalyticsPage from "@/components/dashboard/storage/StorageAnalyticsPage";
import { ColdStorageAlertBanner } from "@/components/dashboard/ColdStorageAlertBanner";
import DashboardRouteFade from "@/components/dashboard/DashboardRouteFade";
import SettingsScopeHeader from "@/components/settings/SettingsScopeHeader";
import ReadOnlyBanner from "@/components/settings/ReadOnlyBanner";
import SettingsSectionScope from "@/components/settings/SettingsSectionScope";
import SettingsSidebarNav from "@/components/settings/SettingsSidebarNav";
import type { SettingsNavItem } from "@/components/settings/SettingsSidebarNav";
import { productSettingsCopy } from "@/lib/product-settings-copy";
import SettingsHelpSupportSection from "@/components/settings/SettingsHelpSupportSection";

type EnterpriseSettingsSectionId =
  | "branding"
  | "storage"
  | "subscription"
  | "profile-handle"
  | "seats"
  | "help";

function EnterpriseSettingsPageInner() {
  const searchParams = useSearchParams();
  const { org, role, refetch } = useEnterprise();
  const { user } = useAuth();
  const [companyName, setCompanyName] = useState(org?.name ?? "");
  const [savingName, setSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(org?.logo_url ?? null);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [logoError, setLogoError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const isAdmin = role === "admin";

  const navItems = useMemo(() => {
    const base: SettingsNavItem[] = [
      { id: "branding", label: "Branding", icon: Building2 },
      { id: "storage", label: "Storage", icon: HardDrive },
      { id: "subscription", label: "Subscription", icon: CreditCard },
      { id: "profile-handle", label: "Profile handle", icon: Globe },
      { id: "help", label: "Help", icon: HelpCircle },
    ];
    if (isAdmin) {
      base.push({ id: "seats", label: "Seat management", icon: Users });
    }
    return base;
  }, [isAdmin]);

  const [section, setSection] = useState<EnterpriseSettingsSectionId>("branding");

  const setSectionNav = useCallback((id: string) => {
    const allowed = new Set(navItems.map((i) => i.id));
    const next = (allowed.has(id) ? id : "branding") as EnterpriseSettingsSectionId;
    setSection(next);
    if (typeof window !== "undefined") {
      const hash =
        next === "seats"
          ? "seats"
          : next === "profile-handle"
            ? "profile-handle"
            : next === "help"
              ? "help"
              : next;
      window.history.replaceState(null, "", `#${hash}`);
    }
  }, [navItems]);

  useEffect(() => {
    if (!isAdmin && section === "seats") {
      setSection("branding");
    }
  }, [isAdmin, section]);

  useEffect(() => {
    if (searchParams.get("section") === "help") {
      setSection("help");
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", "#help");
      }
    }
  }, [searchParams]);

  useEffect(() => {
    if (typeof window === "undefined" || !org) return;
    const h = window.location.hash.replace(/^#/, "");
    const ids = new Set(navItems.map((i) => i.id));
    if (h === "storage") setSection("storage");
    else if (h === "subscription") setSection("subscription");
    else if (h === "profile-handle" || h === "galleries") setSection("profile-handle");
    else if (h === "help") setSection("help");
    else if ((h === "seats" || h === "seat-management") && ids.has("seats"))
      setSection("seats");
    else if (h === "branding" || h === "") setSection("branding");
  }, [org, navItems]);

  const handleSaveName = async () => {
    if (!org || !isAdmin) return;
    const trimmed = companyName.trim();
    if (trimmed.length < 2) {
      setNameError("Company name must be at least 2 characters");
      return;
    }
    setNameError(null);
    setSavingName(true);
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/enterprise/update", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: trimmed }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to update");
      }
      await refetch();
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
    if (!org || !isAdmin || !logoFile) return;
    setUploadingLogo(true);
    setLogoError(null);
    try {
      const token = await user?.getIdToken();
      const formData = new FormData();
      formData.append("logo", logoFile);
      const res = await fetch("/api/enterprise/logo", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: formData,
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to upload logo");
      }
      const data = await res.json();
      setLogoPreview(data.logo_url);
      setLogoFile(null);
      await refetch();
    } catch (err) {
      setLogoError(err instanceof Error ? err.message : "Failed to upload");
    } finally {
      setUploadingLogo(false);
    }
  };

  return (
    <>
      <TopBar title="Organization settings" />
      <main className="flex-1 overflow-auto p-6">
        <DashboardRouteFade
          ready={!!org}
          srOnlyMessage="Loading organization settings"
        >
        {org ? (
          <div className="mx-auto flex max-w-5xl flex-col gap-8 lg:flex-row lg:items-start">
            <SettingsSidebarNav
              variant="quickAccess"
              items={navItems}
              activeId={section}
              onSelect={setSectionNav}
            />
            <div className="min-w-0 flex-1 space-y-8">
              <SettingsScopeHeader
                title="Organization settings"
                scope="enterprise"
                permission={
                  isAdmin
                    ? { kind: "editable" }
                    : {
                        kind: "readOnly",
                        reason: "Only organization admins can change these settings.",
                      }
                }
                effectSummary={`${productSettingsCopy.scopes.organizationWide}. ${productSettingsCopy.organizationSeats.helper}`}
              />

              {!isAdmin ? (
                <ReadOnlyBanner message="Contact an organization admin to update the company profile, logo, or billing-related workspace options." />
              ) : null}

              {section === "branding" && (
                <>
                  <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
            <SettingsSectionScope label={productSettingsCopy.scopes.organizationWide} />
            <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
              <Building2 className="h-5 w-5 text-[var(--enterprise-primary)]" />
              Company name
            </h2>
            <div className="flex gap-2">
              <input
                type="text"
                value={companyName}
                onChange={(e) => {
                  setCompanyName(e.target.value);
                  setNameError(null);
                }}
                placeholder="Your company name"
                disabled={!isAdmin}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-[var(--enterprise-primary)] disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
              {isAdmin && (
                <button
                  type="button"
                  onClick={handleSaveName}
                  disabled={savingName || companyName.trim() === org.name}
                  className="shrink-0 rounded-lg bg-[var(--enterprise-primary)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90 disabled:opacity-50"
                >
                  {savingName ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    "Save"
                  )}
                </button>
              )}
            </div>
            {nameError && (
              <p className="mt-1 text-sm text-red-600 dark:text-red-400">
                {nameError}
              </p>
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
                      alt="Organization logo"
                      width={96}
                      height={96}
                      className="h-full w-full object-contain"
                      unoptimized
                    />
                  ) : (
                    <ImageIcon className="h-10 w-10 text-neutral-400" />
                  )}
                </div>
                {isAdmin && (
                  <>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={handleLogoSelect}
                      aria-label="Upload logo"
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
                <p className="text-sm text-red-600 dark:text-red-400">
                  {logoError}
                </p>
              )}
            </div>
          </section>
                </>
              )}

              {section === "storage" && (
                <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
                  <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
                    <HardDrive className="h-5 w-5 text-[var(--enterprise-primary)]" />
                    Storage
                  </h2>
                  <StorageAnalyticsPage basePath="/enterprise" />
                </section>
              )}

              {section === "subscription" && (
                <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
                  <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
                    <CreditCard className="h-5 w-5 text-[var(--enterprise-primary)]" />
                    Subscription
                  </h2>
                  <ColdStorageAlertBanner />
                  {org.storage_quota_bytes > 0 && (
                    <div className="mb-4 rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-700 dark:bg-neutral-800/50">
                      <p className="text-sm font-medium text-neutral-900 dark:text-white">
                        Total storage: {org.storage_quota_bytes >= 1024 ** 4
                          ? `${(org.storage_quota_bytes / 1024 ** 4).toFixed(1)} TB`
                          : org.storage_quota_bytes >= 1024 ** 3
                            ? `${(org.storage_quota_bytes / 1024 ** 3).toFixed(1)} GB`
                            : `${Math.round(org.storage_quota_bytes / 1024 ** 2)} MB`}
                      </p>
                      {org.max_seats != null && (
                        <p className="mt-1 text-sm text-neutral-600 dark:text-neutral-400">
                          {org.max_seats} seat{org.max_seats !== 1 ? "s" : ""} included
                        </p>
                      )}
                    </div>
                  )}
                  <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
                    Storage and seats are managed by Bizzi. Contact our sales team to change your plan or add seats.
                  </p>
                  <a
                    href="mailto:sales@bizzicloud.io"
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--enterprise-primary)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                  >
                    Contact sales
                  </a>
                  <div className="mt-6 border-t border-neutral-200 pt-6 dark:border-neutral-700">
                    <h3 className="mb-2 flex items-center gap-2 text-sm font-medium text-neutral-900 dark:text-white">
                      <Zap className="h-4 w-4 text-amber-500" />
                      Power ups
                    </h3>
                    {org?.addon_ids && org.addon_ids.length > 0 ? (
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        Your package includes:{" "}
                        {org.addon_ids
                          .map((id) => ADDON_LABELS[id] ?? id)
                          .join(", ")}
                        . Contact sales to add or change power ups.
                      </p>
                    ) : (
                      <p className="text-sm text-neutral-500 dark:text-neutral-400">
                        No power ups in your package. Contact sales to add Editor, Gallery Suite, or Full Frame.
                      </p>
                    )}
                  </div>
                </section>
              )}

              {section === "profile-handle" && (
                <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
                  <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
                    <Globe className="h-5 w-5 text-[var(--enterprise-primary)]" />
                    Profile handle
                  </h2>
                  <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
                    Your profile handle is used for branded gallery URLs (e.g. bizzicloud.io/yourhandle/gallery-name).
                    Same handle across personal and enterprise when using the same email. Set it in{" "}
                    <Link href="/enterprise/galleries" className="text-[var(--enterprise-primary)] hover:underline">
                      Galleries
                    </Link>
                    {" "}→ Gallery Settings.
                  </p>
                </section>
              )}

              {section === "seats" && isAdmin ? (
                <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
                  <h2 className="mb-2 text-lg font-semibold text-neutral-900 dark:text-white">
                    Seat management
                  </h2>
                  <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
                    Invite team members and manage who has access to your
                    organization.
                  </p>
                  <Link
                    href="/enterprise/seats"
                    className="inline-flex items-center gap-2 rounded-lg bg-[var(--enterprise-primary)] px-4 py-2 text-sm font-medium text-white transition-opacity hover:opacity-90"
                  >
                    Manage seats
                  </Link>
                </section>
              ) : null}

              {section === "help" ? (
                <SettingsHelpSupportSection
                  supportContext={searchParams.get("supportContext")}
                  primaryClassName="bg-[var(--enterprise-primary)] px-4 py-2 text-white hover:opacity-90"
                />
              ) : null}
            </div>
          </div>
        ) : null}
        </DashboardRouteFade>
      </main>
    </>
  );
}

export default function EnterpriseSettingsPage() {
  return (
    <Suspense fallback={null}>
      <EnterpriseSettingsPageInner />
    </Suspense>
  );
}
