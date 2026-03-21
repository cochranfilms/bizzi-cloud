"use client";

import { useState, useRef, useEffect, useCallback, Suspense } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import TopBar from "@/components/dashboard/TopBar";
import { useProfileUpdate } from "@/hooks/useProfileUpdate";
import { useSubscription } from "@/hooks/useSubscription";
import { useEnterprise } from "@/context/EnterpriseContext";
import { useAuth } from "@/context/AuthContext";
import {
  User,
  Camera,
  Mail,
  Lock,
  CreditCard,
  Loader2,
  Check,
  Building2,
  ExternalLink,
  HardDrive,
  Shield,
  Download,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import StorageAnalyticsPage from "@/components/dashboard/storage/StorageAnalyticsPage";
import Image from "next/image";
import { useDesktopMode } from "@/hooks/useDesktopMode";
import {
  PLAN_LABELS,
  ADDON_LABELS,
  STORAGE_ADDON_LABELS,
  type StorageAddonId,
} from "@/lib/pricing-data";
import { ColdStorageAlertBanner } from "@/components/dashboard/ColdStorageAlertBanner";

const WEB_APP_URL = process.env.NEXT_PUBLIC_APP_URL ?? "https://www.bizzicloud.io";

function ProfileSection() {
  const { user } = useProfileUpdate();
  const {
    displayName,
    setDisplayName,
    photoURL,
    uploadPhoto,
    updateDisplayName,
    loading: profileLoading,
    error: profileError,
    success: profileSuccess,
  } = useProfileUpdate();

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      return;
    }
    setUploading(true);
    try {
      await uploadPhoto(file);
    } finally {
      setUploading(false);
      e.target.value = "";
    }
  };

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
        <User className="h-5 w-5 text-bizzi-blue" />
        Profile
      </h2>
      <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
        <div className="flex shrink-0 flex-col items-center gap-2">
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading || !user}
            className="group relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-full bg-neutral-100 dark:bg-neutral-800"
          >
            {uploading ? (
              <Loader2 className="h-8 w-8 animate-spin text-bizzi-blue" />
            ) : photoURL ? (
              <Image
                src={photoURL}
                alt="Profile"
                fill
                className="object-cover"
                sizes="96px"
                unoptimized
              />
            ) : (
              <span className="text-2xl font-medium text-bizzi-blue">
                {(user?.displayName ?? user?.email ?? "U").slice(0, 2).toUpperCase()}
              </span>
            )}
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity group-hover:opacity-100">
              <Camera className="h-6 w-6 text-white" />
            </div>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handlePhotoChange}
            aria-label="Upload profile photo"
          />
          <span className="text-xs text-neutral-500 dark:text-neutral-400">
            Click to change
          </span>
        </div>
        <div className="min-w-0 flex-1">
          <label
            htmlFor="displayName"
            className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
          >
            Display name
          </label>
          <div className="flex gap-2">
            <input
              id="displayName"
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Your name"
              className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder-neutral-500"
            />
            <button
              type="button"
              onClick={updateDisplayName}
              disabled={profileLoading}
              className="shrink-0 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-70"
            >
              {profileLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
            </button>
          </div>
          {profileError && (
            <p className="mt-1 text-sm text-red-600 dark:text-red-400">{profileError}</p>
          )}
          {profileSuccess && (
            <p className="mt-1 flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
              <Check className="h-4 w-4" /> Saved
            </p>
          )}
        </div>
      </div>
    </section>
  );
}

function AccountSection() {
  const { user } = useProfileUpdate();
  const {
    changePassword,
    passwordLoading,
    passwordError,
    passwordSuccess,
    isEmailProvider,
  } = useProfileUpdate();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword !== confirmPassword) {
      return;
    }
    await changePassword(currentPassword, newPassword);
    setCurrentPassword("");
    setNewPassword("");
    setConfirmPassword("");
  };

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
        <Mail className="h-5 w-5 text-bizzi-blue" />
        Account
      </h2>
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Email
          </label>
          <p className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-sm text-neutral-600 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
            {user?.email ?? "—"}
          </p>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            Email cannot be changed here. Contact support if needed.
          </p>
        </div>

        {isEmailProvider && (
          <form onSubmit={handlePasswordSubmit} className="space-y-4 border-t border-neutral-200 pt-4 dark:border-neutral-700">
            <h3 className="flex items-center gap-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
              <Lock className="h-4 w-4" />
              Change password
            </h3>
            <div>
              <label
                htmlFor="currentPassword"
                className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400"
              >
                Current password
              </label>
              <input
                id="currentPassword"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                required
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>
            <div>
              <label
                htmlFor="newPassword"
                className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400"
              >
                New password
              </label>
              <input
                id="newPassword"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
            </div>
            <div>
              <label
                htmlFor="confirmPassword"
                className="mb-1 block text-sm text-neutral-600 dark:text-neutral-400"
              >
                Confirm new password
              </label>
              <input
                id="confirmPassword"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                minLength={6}
                className="w-full rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              />
              {newPassword && confirmPassword && newPassword !== confirmPassword && (
                <p className="mt-1 text-sm text-amber-600 dark:text-amber-400">
                  Passwords do not match
                </p>
              )}
            </div>
            {passwordError && (
              <p className="text-sm text-red-600 dark:text-red-400">{passwordError}</p>
            )}
            {passwordSuccess && (
              <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
                <Check className="h-4 w-4" /> Password updated
              </p>
            )}
            <button
              type="submit"
              disabled={passwordLoading || newPassword !== confirmPassword || !newPassword}
              className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-70"
            >
              {passwordLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Update password"}
            </button>
          </form>
        )}

        {!isEmailProvider && (
          <p className="text-sm text-neutral-500 dark:text-neutral-400">
            You signed in with a different provider. Password management is not available.
          </p>
        )}
      </div>
    </section>
  );
}

function CreateOrganizationSection() {
  const router = useRouter();
  const { org, loading: orgLoading, refetch } = useEnterprise();
  const { user } = useAuth();
  const [orgName, setOrgName] = useState("");
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = orgName.trim();
    if (trimmed.length < 2) {
      setError("Organization name must be at least 2 characters");
      return;
    }
    setError(null);
    setCreating(true);
    try {
      const token = await user?.getIdToken();
      const res = await fetch("/api/enterprise/create", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: trimmed }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create organization");
      }
      await refetch();
      router.push("/enterprise");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create");
    } finally {
      setCreating(false);
    }
  };

  if (orgLoading || org) return null;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
        <Building2 className="h-5 w-5 text-bizzi-blue" />
        Create organization
      </h2>
      <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
        Create an enterprise organization to invite team members, customize branding, and manage shared storage.
      </p>
      <form onSubmit={handleCreate} className="flex gap-2">
        <input
          type="text"
          value={orgName}
          onChange={(e) => {
            setOrgName(e.target.value);
            setError(null);
          }}
          placeholder="Your company name"
          disabled={creating}
          className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
        />
        <button
          type="submit"
          disabled={creating || orgName.trim().length < 2}
          className="shrink-0 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create"}
        </button>
      </form>
      {error && (
        <p className="mt-2 text-sm text-red-600 dark:text-red-400">{error}</p>
      )}
    </section>
  );
}

function StorageSection() {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <h2 className="mb-6 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
        <HardDrive className="h-5 w-5 text-bizzi-blue" />
        Storage
      </h2>
      <StorageAnalyticsPage basePath="/dashboard" />
    </section>
  );
}

function PrivacySection() {
  const { user } = useAuth();
  const { org } = useEnterprise();
  const [doNotSell, setDoNotSell] = useState(false);
  const [analytics, setAnalytics] = useState(false);
  const [functional, setFunctional] = useState(false);
  const [loading, setLoading] = useState(false);
  const [exportLoading, setExportLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [ownsOrg, setOwnsOrg] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const fetchAccountStatus = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/account/status", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setOwnsOrg(data.owns_org ?? false);
      }
    } catch {
      setOwnsOrg(false);
    }
  }, [user]);

  const fetchPrivacy = useCallback(async () => {
    if (!user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/account/privacy", {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.ok) {
        const data = await res.json();
        setDoNotSell(data.do_not_sell_personal_info ?? false);
        const cc = data.cookie_consent ?? {};
        setAnalytics(cc.analytics ?? false);
        setFunctional(cc.functional ?? false);
      }
    } catch {
      // ignore
    }
  }, [user]);

  useEffect(() => {
    fetchPrivacy();
  }, [fetchPrivacy]);

  useEffect(() => {
    fetchAccountStatus();
  }, [fetchAccountStatus]);

  const handleSavePrivacy = async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    setSuccess(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/account/privacy", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          do_not_sell_personal_info: doNotSell,
          cookie_consent: { essential: true, analytics, functional },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSuccess("Privacy preferences saved.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    if (!user) return;
    setExportLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/account/export", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? "Export failed");
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `bizzi-cloud-export-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
      setSuccess("Data exported. Download started.");
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Export failed");
    } finally {
      setExportLoading(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!user || deleteConfirm !== "DELETE") return;
    setDeleteLoading(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/account/delete", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ confirmation: "DELETE" }),
      });
      const data = (await res.json()) as {
        error?: string;
        hasEnterpriseAccess?: boolean;
        ownsOrg?: boolean;
      };
      if (!res.ok) throw new Error(data.error ?? "Deletion failed");
      setDeleteModalOpen(false);
      setDeleteConfirm("");
      if (data.hasEnterpriseAccess) {
        router.push("/account/personal-deleted");
        router.refresh();
      } else {
        const { signOut } = await import("firebase/auth");
        const { getFirebaseAuth } = await import("@/lib/firebase/client");
        await signOut(getFirebaseAuth());
        router.push("/");
        router.refresh();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Deletion failed");
    } finally {
      setDeleteLoading(false);
    }
  };

  const router = useRouter();
  const hasEnterpriseAccess = !!org;

  return (
    <section
      id="privacy"
      className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900"
    >
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
        <Shield className="h-5 w-5 text-bizzi-blue" />
        Privacy
      </h2>
      <div className="space-y-6">
        <div>
          <h3 className="mb-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
            Do Not Sell My Personal Information (CCPA)
          </h3>
          <p className="mb-2 text-xs text-neutral-500 dark:text-neutral-400">
            Bizzi Cloud does not sell your data. California residents can opt out of any future sale or sharing.
          </p>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={doNotSell}
              onChange={(e) => setDoNotSell(e.target.checked)}
              className="rounded border-neutral-300 text-bizzi-blue focus:ring-bizzi-blue"
            />
            <span className="text-sm">Opt out of sale/sharing of my personal information</span>
          </label>
        </div>
        <div>
          <h3 className="mb-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
            Cookie preferences
          </h3>
          <div className="space-y-2">
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={true}
                disabled
                className="rounded border-neutral-300 text-bizzi-blue"
              />
              <span className="text-sm">Essential (required)</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={analytics}
                onChange={(e) => setAnalytics(e.target.checked)}
                className="rounded border-neutral-300 text-bizzi-blue focus:ring-bizzi-blue"
              />
              <span className="text-sm">Analytics</span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={functional}
                onChange={(e) => setFunctional(e.target.checked)}
                className="rounded border-neutral-300 text-bizzi-blue focus:ring-bizzi-blue"
              />
              <span className="text-sm">Functional</span>
            </label>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={handleSavePrivacy}
            disabled={loading}
            className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan disabled:opacity-70"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save preferences"}
          </button>
        </div>
        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
        {success && (
          <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" /> {success}
          </p>
        )}
        <div className="border-t border-neutral-200 pt-6 dark:border-neutral-700">
          <h3 className="mb-2 text-sm font-medium text-neutral-800 dark:text-neutral-200">
            Your data rights
          </h3>
          {ownsOrg && (
            <div className="mb-4 rounded-lg border border-amber-200 bg-amber-50 p-4 dark:border-amber-800 dark:bg-amber-950/30">
              <p className="text-sm text-amber-800 dark:text-amber-200">
                You still administer an organization. Transfer ownership or delete the organization
                before closing your identity.
              </p>
              <Link
                href="/enterprise/seats"
                className="mt-2 inline-block text-sm font-medium text-amber-700 underline hover:text-amber-800 dark:text-amber-300 dark:hover:text-amber-200"
              >
                Go to organization seats to transfer ownership
              </Link>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleExport}
              disabled={exportLoading}
              className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium dark:border-neutral-700 dark:text-neutral-300"
            >
              {exportLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
              Download my data
            </button>
            <button
              type="button"
              onClick={() => setDeleteModalOpen(true)}
              disabled={ownsOrg}
              className="inline-flex items-center gap-2 rounded-lg border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-50 dark:border-red-900 dark:text-red-400 dark:hover:bg-red-900/20"
            >
              <Trash2 className="h-4 w-4" />
              {hasEnterpriseAccess ? "Delete personal account" : "Delete my account"}
            </button>
          </div>
        </div>
      </div>
      {deleteModalOpen && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/50 p-4">
          <div className="max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
            <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
              {hasEnterpriseAccess ? "Delete personal account" : "Delete account"}
            </h3>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              {hasEnterpriseAccess ? (
                <>
                  Your personal workspace will be deleted and is recoverable for 30 days. Your
                  enterprise workspace access will remain active. You can continue to sign in
                  and use your team storage, or restore your personal account within the grace period.
                </>
              ) : (
                <>
                  Your account is scheduled for permanent deletion on{" "}
                  {new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toLocaleDateString("en-US", {
                    year: "numeric",
                    month: "long",
                    day: "numeric",
                  })}
                  . Until then, your files remain recoverable. Log back in and resubscribe to restore them.
                </>
              )}
            </p>
            <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
              Type <strong>DELETE</strong> to confirm:
            </p>
            <input
              type="text"
              value={deleteConfirm}
              onChange={(e) => setDeleteConfirm(e.target.value)}
              placeholder="DELETE"
              className="mt-2 w-full rounded-lg border border-neutral-200 px-3 py-2 text-sm dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                onClick={() => {
                  setDeleteModalOpen(false);
                  setDeleteConfirm("");
                }}
                className="flex-1 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium dark:border-neutral-700"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleDeleteAccount}
                disabled={deleteLoading || deleteConfirm !== "DELETE"}
                className="flex-1 rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
              >
                {deleteLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : hasEnterpriseAccess ? (
                  "Delete personal account"
                ) : (
                  "Delete account"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SubscriptionSection() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
  const isDesktop = useDesktopMode();
  const {
    planId,
    addonIds,
    storageAddonId,
    hasPortalAccess,
    loading,
    refetch,
  } = useSubscription();
  const [portalLoading, setPortalLoading] = useState(false);
  const [syncLoading, setSyncLoading] = useState(false);
  const [portalError, setPortalError] = useState<string | null>(null);

  const [showConfirmationBanner, setShowConfirmationBanner] = useState(false);
  const [confirmationType, setConfirmationType] = useState<"updated" | "cancelled" | "purchase" | null>(null);
  const [powerUpWarningModalOpen, setPowerUpWarningModalOpen] = useState(false);
  const [powerUpCheckLoading, setPowerUpCheckLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    const updated = searchParams.get("updated") === "subscription";
    const cancelled = searchParams.get("cancelled") === "subscription";
    const purchaseConfirmed = searchParams.get("purchase_confirmed") === "1" || searchParams.get("checkout") === "success";
    if (updated || cancelled || purchaseConfirmed) {
      refetch();
      const retry = setTimeout(() => refetch(), 2000);
      setConfirmationType(cancelled ? "cancelled" : purchaseConfirmed ? "purchase" : "updated");
      setShowConfirmationBanner(true);
      router.replace(isDesktop ? "/desktop/app/settings" : "/dashboard/settings", { scroll: false });
      return () => clearTimeout(retry);
    }
  }, [user, searchParams, refetch, router, isDesktop]);

  const syncFromStripe = async () => {
    if (!user) return;
    setSyncLoading(true);
    setPortalError(null);
    try {
      const token = await user.getIdToken(true);
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/stripe/sync-by-email`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await res.json()) as { ok?: boolean; error?: string };
      if (res.ok && data.ok) {
        await refetch();
      } else {
        setPortalError(data.error ?? "No subscription found");
      }
    } catch {
      setPortalError("Failed to sync");
    } finally {
      setSyncLoading(false);
    }
  };

  const handleChangePlanClick = async () => {
    if (!user) return;
    setPowerUpCheckLoading(true);
    try {
      const token = await user.getIdToken(true);
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/storage/powerup-files-check`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = (await res.json()) as { hasRawFiles?: boolean; hasGalleryMediaFiles?: boolean };
      const hasAtRiskFiles =
        (data.hasRawFiles || data.hasGalleryMediaFiles) === true;
      if (hasAtRiskFiles && (addonIds.includes("editor") || addonIds.includes("gallery") || addonIds.includes("fullframe"))) {
        setPowerUpWarningModalOpen(true);
      } else {
        navigateToChangePlan();
      }
    } catch {
      navigateToChangePlan();
    } finally {
      setPowerUpCheckLoading(false);
    }
  };

  const navigateToChangePlan = () => {
    if (isDesktop) {
      window.open(`${WEB_APP_URL}/dashboard/change-plan`, "_blank");
    } else {
      router.push("/dashboard/change-plan");
    }
  };

  const openPortal = async () => {
    if (!user) return;
    setPortalLoading(true);
    setPortalError(null);
    try {
      const token = await user.getIdToken();
      const base = typeof window !== "undefined" ? window.location.origin : "";
      const res = await fetch(`${base}/api/stripe/portal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
      });
      const data = (await res.json()) as { url?: string; error?: string };
      if (res.ok && data.url) {
        if (isDesktop) {
          window.open(data.url, "_blank");
        } else {
          window.location.href = data.url;
        }
      } else {
        setPortalError(data.error ?? "Failed to open billing portal");
      }
    } catch {
      setPortalError("Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  const planLabel = PLAN_LABELS[planId ?? "free"] ?? "Starter Free";

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
        <CreditCard className="h-5 w-5 text-bizzi-blue" />
        Subscription
      </h2>
      <ColdStorageAlertBanner />
      {showConfirmationBanner && (
        <div
          className={`mb-4 flex items-start gap-3 rounded-lg border p-4 ${
            confirmationType === "cancelled"
              ? "border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20"
              : "border-green-200 bg-green-50 dark:border-green-800 dark:bg-green-900/20"
          }`}
        >
          <Check className="mt-0.5 h-5 w-5 shrink-0 text-green-600 dark:text-green-400" />
          <div className="min-w-0 flex-1">
            {confirmationType === "cancelled" ? (
              <>
                <p className="font-medium text-amber-900 dark:text-amber-100">
                  Subscription cancelled
                </p>
                <p className="mt-1 text-sm text-amber-800 dark:text-amber-200">
                  Your plan will end at the close of your current billing period. You&apos;ll keep access until then.
                </p>
              </>
            ) : confirmationType === "purchase" ? (
              <>
                <p className="font-medium text-green-900 dark:text-green-100">
                  Welcome! Your purchase is complete
                </p>
                <p className="mt-1 text-sm text-green-800 dark:text-green-200">
                  Your plan is now active. You can manage your subscription and billing below.
                </p>
              </>
            ) : (
              <>
                <p className="font-medium text-green-900 dark:text-green-100">
                  Plan updated successfully
                </p>
                <p className="mt-1 text-sm text-green-800 dark:text-green-200">
                  Your subscription changes have been applied. A prorated charge or credit has been applied to your account.
                </p>
              </>
            )}
            <button
              type="button"
              onClick={() => setShowConfirmationBanner(false)}
              className="mt-2 text-sm font-medium text-green-700 underline hover:no-underline dark:text-green-300"
            >
              Dismiss
            </button>
          </div>
        </div>
      )}
      <div className="rounded-lg border border-neutral-200 bg-neutral-50 p-6 dark:border-neutral-700 dark:bg-neutral-800/50">
        {loading ? (
          <div className="flex items-center gap-2 text-neutral-600 dark:text-neutral-400">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span className="text-sm">Loading…</span>
          </div>
        ) : (
          <div className="space-y-4">
            <p className="text-sm text-neutral-600 dark:text-neutral-400">
              Current plan: <strong className="text-neutral-900 dark:text-white">{planLabel}</strong>
            </p>
            {addonIds.length > 0 && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Power Ups:{" "}
                <span className="font-medium text-neutral-900 dark:text-white">
                  {addonIds.map((id) => ADDON_LABELS[id] ?? id).join(", ")}
                </span>
              </p>
            )}
            {storageAddonId && (
              <p className="text-sm text-neutral-600 dark:text-neutral-400">
                Additional storage:{" "}
                <strong className="text-neutral-900 dark:text-white">
                  {STORAGE_ADDON_LABELS[storageAddonId as StorageAddonId] ?? storageAddonId}
                </strong>
              </p>
            )}
            {hasPortalAccess ? (
              <div className="flex flex-wrap items-center gap-3">
                {isDesktop ? (
                  <>
                    <button
                      type="button"
                      onClick={handleChangePlanClick}
                      disabled={powerUpCheckLoading}
                      className="inline-flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
                    >
                      {powerUpCheckLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ExternalLink className="h-4 w-4" />
                      )}
                      Manage subscription on web
                    </button>
                    <button
                      type="button"
                      onClick={openPortal}
                      disabled={portalLoading}
                      className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      {portalLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ExternalLink className="h-4 w-4" />
                      )}
                      Manage billing (opens in browser)
                    </button>
                    <p className="w-full text-xs text-neutral-500 dark:text-neutral-400">
                      Subscription management is available on the web app.
                    </p>
                  </>
                ) : (
                  <>
                    <button
                      type="button"
                      onClick={handleChangePlanClick}
                      disabled={powerUpCheckLoading}
                      className="inline-flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
                    >
                      {powerUpCheckLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : null}
                      Change plan
                    </button>
                    <button
                      type="button"
                      onClick={openPortal}
                      disabled={portalLoading}
                      className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                    >
                      {portalLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <ExternalLink className="h-4 w-4" />
                      )}
                      Manage billing
                    </button>
                    <p className="w-full text-xs text-neutral-500 dark:text-neutral-400">
                      Upgrade, downgrade, or change Power Ups. Manage payment method or cancel in billing.
                    </p>
                  </>
                )}
              </div>
            ) : (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={syncFromStripe}
                  disabled={syncLoading}
                  className="inline-flex items-center gap-2 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 disabled:opacity-50 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                >
                  {syncLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : null}
                  Sync subscription from Stripe
                </button>
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  If you just subscribed but still see Starter Free, click to sync.
                </p>
                {isDesktop ? (
                  <button
                    type="button"
                    onClick={() => window.open(`${WEB_APP_URL}/#pricing`, "_blank")}
                    className="inline-flex items-center gap-2 text-sm font-medium text-bizzi-blue hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Upgrade your plan (opens in browser)
                  </button>
                ) : (
                  <Link
                    href="/#pricing"
                    className="inline-flex items-center gap-2 text-sm font-medium text-bizzi-blue hover:underline"
                  >
                    <ExternalLink className="h-4 w-4" />
                    Upgrade your plan
                  </Link>
                )}
              </div>
            )}
            {portalError && (
              <p className="text-sm text-red-600 dark:text-red-400">{portalError}</p>
            )}
          </div>
        )}
      </div>

      {powerUpWarningModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="powerup-warning-title"
        >
          <div className="w-full max-w-md rounded-xl border border-neutral-200 bg-white p-6 shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
            <div className="flex gap-3">
              <AlertTriangle className="h-6 w-6 shrink-0 text-amber-500" />
              <div className="min-w-0 flex-1">
                <h3 id="powerup-warning-title" className="font-semibold text-neutral-900 dark:text-white">
                  Before you go
                </h3>
                <p className="mt-2 text-sm text-neutral-600 dark:text-neutral-400">
                  If you downgrade your power-up, some files (in RAW or Gallery Media) may no longer be visible in the app. They will still take up storage space on your account.
                </p>
                <div className="mt-6 flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setPowerUpWarningModalOpen(false)}
                    className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium text-neutral-700 hover:bg-neutral-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setPowerUpWarningModalOpen(false);
                      navigateToChangePlan();
                    }}
                    className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan"
                  >
                    Got it
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function SettingsContent() {
  const searchParams = useSearchParams();
  useEffect(() => {
    if (searchParams.get("tab") === "privacy") {
      document.getElementById("privacy")?.scrollIntoView({ behavior: "smooth" });
    }
  }, [searchParams]);

  return (
    <div className="mx-auto max-w-2xl space-y-6">
          <ProfileSection />
          <AccountSection />
          <StorageSection />
          <PrivacySection />
          <CreateOrganizationSection />
          <SubscriptionSection />
        </div>
  );
}

export default function SettingsPage() {
  return (
    <>
      <TopBar title="Settings" />
      <main className="flex-1 overflow-auto p-6">
        <Suspense fallback={null}>
          <SettingsContent />
        </Suspense>
      </main>
    </>
  );
}
