"use client";

import { useRef, useState } from "react";
import Image from "next/image";
import { User, Camera, Loader2, Check } from "lucide-react";
import { useProfileUpdate } from "@/hooks/useProfileUpdate";
import SettingsSectionScope from "@/components/settings/SettingsSectionScope";
import { productSettingsCopy } from "@/lib/product-settings-copy";

export default function PersonalProfileSettingsSection() {
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
      <SettingsSectionScope label={productSettingsCopy.scopes.personalAccountOnly} />
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
              <span className="text-2xl font-medium text-bizzi-blue dark:text-bizzi-cyan">
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
