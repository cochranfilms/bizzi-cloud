"use client";

import { useState, useRef } from "react";
import { useRouter } from "next/navigation";
import TopBar from "@/components/dashboard/TopBar";
import { useProfileUpdate } from "@/hooks/useProfileUpdate";
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
} from "lucide-react";
import Image from "next/image";

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

function SubscriptionSection() {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
        <CreditCard className="h-5 w-5 text-bizzi-blue" />
        Subscription
      </h2>
      <div className="rounded-lg border border-dashed border-neutral-300 bg-neutral-50 p-6 text-center dark:border-neutral-600 dark:bg-neutral-800/50">
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Subscription management is coming soon. You&apos;ll be able to upgrade, downgrade, and
          manage billing through Stripe.
        </p>
      </div>
    </section>
  );
}

export default function SettingsPage() {
  return (
    <>
      <TopBar title="Settings" />
      <main className="flex-1 overflow-auto p-6">
        <div className="mx-auto max-w-2xl space-y-6">
          <ProfileSection />
          <AccountSection />
          <CreateOrganizationSection />
          <SubscriptionSection />
        </div>
      </main>
    </>
  );
}
