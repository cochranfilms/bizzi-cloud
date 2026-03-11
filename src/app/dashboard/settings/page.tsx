"use client";

import { useState, useRef, useEffect, useCallback } from "react";
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
  Globe,
  ExternalLink,
  Image as ImageIcon,
  HardDrive,
} from "lucide-react";
import StorageAnalyticsPage from "@/components/dashboard/storage/StorageAnalyticsPage";
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

function ShareImageThumbnail({
  galleryId,
  asset,
  selected,
  onSelect,
}: {
  galleryId: string;
  asset: { id: string; name: string; object_key: string };
  selected: boolean;
  onSelect: () => void;
}) {
  const [thumbUrl, setThumbUrl] = useState<string | null>(null);
  const thumbRef = useRef<string | null>(null);

  useEffect(() => {
    if (!galleryId || !asset.object_key || !asset.name) return;
    let cancelled = false;
    (async () => {
      try {
        const auth = (await import("@/lib/firebase/client")).getFirebaseAuth();
        const token = await auth.currentUser?.getIdToken(true);
        if (!token || cancelled) return;
        const params = new URLSearchParams({
          object_key: asset.object_key,
          name: asset.name,
          size: "thumb",
        });
        const res = await fetch(`/api/galleries/${galleryId}/thumbnail?${params}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (!res.ok || cancelled) return;
        const blob = await res.blob();
        if (cancelled) return;
        const url = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(url);
          return;
        }
        if (thumbRef.current) URL.revokeObjectURL(thumbRef.current);
        thumbRef.current = url;
        setThumbUrl(url);
      } catch {
        // ignore
      }
    })();
    return () => {
      cancelled = true;
      if (thumbRef.current) {
        URL.revokeObjectURL(thumbRef.current);
        thumbRef.current = null;
      }
      setThumbUrl(null);
    };
  }, [galleryId, asset.object_key, asset.name]);

  return (
    <button
      type="button"
      onClick={onSelect}
      className={`relative flex aspect-square overflow-hidden rounded-lg border-2 transition-colors ${
        selected
          ? "border-bizzi-blue ring-2 ring-bizzi-blue/30"
          : "border-transparent hover:border-neutral-300 dark:hover:border-neutral-600"
      }`}
    >
      {thumbUrl ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img src={thumbUrl} alt="" className="h-full w-full object-cover" />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-neutral-100 dark:bg-neutral-800">
          <ImageIcon className="h-6 w-6 text-neutral-400" />
        </div>
      )}
      {selected && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/20">
          <Check className="h-6 w-6 text-white drop-shadow" strokeWidth={3} />
        </div>
      )}
    </button>
  );
}

function StudioHomepageSection() {
  const { user } = useAuth();
  const [publicSlug, setPublicSlug] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [shareImage, setShareImage] = useState<{
    object_key: string;
    name: string;
    gallery_id: string;
  } | null>(null);
  const [shareImageCandidates, setShareImageCandidates] = useState<
    Array<{ id: string; gallery_id: string; gallery_title: string; name: string; object_key: string }>
  >([]);
  const [shareImageLoading, setShareImageLoading] = useState(false);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/profile", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) {
          setPublicSlug(data.public_slug ?? data.handle ?? "");
          if (data.share_image_object_key && data.share_image_name && data.share_image_gallery_id) {
            setShareImage({
              object_key: data.share_image_object_key,
              name: data.share_image_name,
              gallery_id: data.share_image_gallery_id,
            });
          } else {
            setShareImage(null);
          }
        }
      } finally {
        if (!cancelled) setLoadingProfile(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setShareImageLoading(true);
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/profile/share-image-candidates", {
          headers: token ? { Authorization: `Bearer ${token}` } : {},
        });
        if (cancelled) return;
        const data = await res.json();
        if (cancelled) return;
        if (res.ok) setShareImageCandidates(data.assets ?? []);
      } finally {
        if (!cancelled) setShareImageLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setLoading(true);
    setError(null);
    setSuccess(false);
    try {
      const token = await user.getIdToken();
      const body: Record<string, unknown> = {
        public_slug: publicSlug.trim() || null,
      };
      if (shareImage) {
        body.share_image_object_key = shareImage.object_key;
        body.share_image_name = shareImage.name;
        body.share_image_gallery_id = shareImage.gallery_id;
      } else {
        body.share_image_object_key = null;
        body.share_image_name = null;
        body.share_image_gallery_id = null;
      }
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? "Failed to save");
      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setLoading(false);
    }
  };

  const baseUrl = typeof window !== "undefined" ? window.location.origin : "";
  const normalizedHandle = publicSlug.trim().toLowerCase().replace(/[^a-z0-9-]/g, "-");
  const homepageUrl = normalizedHandle ? `${baseUrl}/p/${normalizedHandle}` : null;
  const brandedExample = normalizedHandle ? `${baseUrl}/${normalizedHandle}/my-gallery-name` : null;

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
        <Globe className="h-5 w-5 text-bizzi-blue" />
        Profile handle
      </h2>
      <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
        Set your custom handle for branded URLs. Share galleries at{" "}
        <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">bizzicloud.io/yourhandle/gallery-name</code>.
        Same handle across personal and enterprise when using the same email.
      </p>
      <form onSubmit={handleSave} className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
            Handle
          </label>
          <div className="flex items-center gap-2">
            <span className="text-sm text-neutral-500 dark:text-neutral-400">
              {baseUrl}/
            </span>
            <input
              type="text"
              value={publicSlug}
              onChange={(e) => {
                setPublicSlug(e.target.value.replace(/[^a-zA-Z0-9-]/g, "").toLowerCase());
                setError(null);
              }}
              placeholder="janesmith"
              disabled={loadingProfile}
              className="flex-1 rounded-lg border border-neutral-200 bg-white px-3 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white dark:placeholder-neutral-500"
            />
          </div>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
            3–40 characters, letters, numbers, and hyphens only
          </p>
        </div>
        {error && (
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        )}
        {success && (
          <p className="flex items-center gap-1 text-sm text-green-600 dark:text-green-400">
            <Check className="h-4 w-4" /> Saved
          </p>
        )}
        <div className="flex flex-wrap gap-2">
          <button
            type="submit"
            disabled={loading || loadingProfile}
            className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-70"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </button>
          {homepageUrl && (
            <a
              href={homepageUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1.5 rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium dark:border-neutral-700 dark:text-neutral-300"
            >
              <ExternalLink className="h-4 w-4" />
              View homepage
            </a>
          )}
          {brandedExample && (
            <p className="flex w-full items-center gap-1 text-xs text-neutral-500 dark:text-neutral-400">
              Example gallery URL: <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">{brandedExample}</code>
            </p>
          )}
        </div>

        {/* Link preview - when sharing bizzicloud.io/p/handle */}
        <div className="border-t border-neutral-200 pt-6 dark:border-neutral-700">
          <h3 className="mb-2 flex items-center gap-2 text-base font-semibold text-neutral-900 dark:text-white">
            <ImageIcon className="h-4 w-4 text-bizzi-blue" />
            Link preview image
          </h3>
          <p className="mb-4 text-sm text-neutral-500 dark:text-neutral-400">
            Choose the image that appears when you share your public gallery link (
            <code className="rounded bg-neutral-100 px-1 dark:bg-neutral-800">
              {baseUrl}/p/{normalizedHandle || "yourhandle"}
            </code>
            ) on social media, messaging apps, or anywhere else. This is the preview people see before they click.
          </p>
          {shareImageLoading ? (
            <div className="flex gap-2 py-4 text-neutral-500 dark:text-neutral-400">
              <Loader2 className="h-5 w-5 animate-spin" />
              Loading your photos…
            </div>
          ) : shareImageCandidates.length === 0 ? (
            <p className="py-4 text-sm text-neutral-500 dark:text-neutral-400">
              Create galleries and add photos to choose a link preview image.
            </p>
          ) : (
            <div>
              <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Select photo
              </label>
              <div className="grid max-h-48 grid-cols-4 gap-2 overflow-y-auto sm:grid-cols-6">
                {shareImageCandidates.map((asset) => (
                  <ShareImageThumbnail
                    key={`${asset.gallery_id}-${asset.id}`}
                    galleryId={asset.gallery_id}
                    asset={asset}
                    selected={
                      shareImage?.object_key === asset.object_key &&
                      shareImage?.gallery_id === asset.gallery_id
                    }
                    onSelect={() =>
                      setShareImage({
                        object_key: asset.object_key,
                        name: asset.name,
                        gallery_id: asset.gallery_id,
                      })
                    }
                  />
                ))}
              </div>
            </div>
          )}
        </div>
      </form>
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

const ADDON_LABELS: Record<string, string> = {
  gallery: "Bizzi Gallery Suite",
  editor: "Bizzi Editor",
  fullframe: "Bizzi Full Frame",
};

const STORAGE_ADDON_LABELS: Record<string, string> = {
  indie_1: "+1 TB",
  indie_2: "+2 TB",
  indie_3: "+3 TB",
  video_1: "+1 TB",
  video_2: "+2 TB",
  video_3: "+3 TB",
  video_4: "+4 TB",
  video_5: "+5 TB",
};

function SubscriptionSection() {
  const { user } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();
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

  useEffect(() => {
    if (!user) return;
    if (searchParams.get("updated") === "subscription" || searchParams.get("cancelled") === "subscription") {
      refetch();
      const retry = setTimeout(() => refetch(), 2000);
      router.replace("/dashboard/settings", { scroll: false });
      return () => clearTimeout(retry);
    }
  }, [user, searchParams, refetch, router]);

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
        window.location.href = data.url;
      } else {
        setPortalError(data.error ?? "Failed to open billing portal");
      }
    } catch {
      setPortalError("Failed to open billing portal");
    } finally {
      setPortalLoading(false);
    }
  };

  const planLabel =
    planId === "free"
      ? "Starter Free"
      : planId === "solo"
        ? "Solo Creator"
        : planId === "indie"
          ? "Indie Filmmaker"
          : planId === "video"
            ? "Video Pro"
            : planId === "production"
              ? "Production House"
              : planId ?? "Starter Free";

  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
      <h2 className="mb-4 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
        <CreditCard className="h-5 w-5 text-bizzi-blue" />
        Subscription
      </h2>
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
                  {STORAGE_ADDON_LABELS[storageAddonId] ?? storageAddonId}
                </strong>
              </p>
            )}
            {hasPortalAccess ? (
              <div className="flex flex-wrap items-center gap-3">
                <Link
                  href="/dashboard/change-plan"
                  className="inline-flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
                >
                  Change plan
                </Link>
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
                <Link
                  href="/#pricing"
                  className="inline-flex items-center gap-2 text-sm font-medium text-bizzi-blue hover:underline"
                >
                  <ExternalLink className="h-4 w-4" />
                  Upgrade your plan
                </Link>
              </div>
            )}
            {portalError && (
              <p className="text-sm text-red-600 dark:text-red-400">{portalError}</p>
            )}
          </div>
        )}
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
          <StudioHomepageSection />
          <AccountSection />
          <StorageSection />
          <CreateOrganizationSection />
          <SubscriptionSection />
        </div>
      </main>
    </>
  );
}
