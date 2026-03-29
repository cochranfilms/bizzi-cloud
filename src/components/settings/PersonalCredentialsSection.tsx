"use client";

import { useState } from "react";
import { Mail, Lock, Loader2, Check } from "lucide-react";
import { useProfileUpdate } from "@/hooks/useProfileUpdate";
import SettingsSectionScope from "@/components/settings/SettingsSectionScope";
import { productSettingsCopy } from "@/lib/product-settings-copy";

/** Email + password (dashboard personal settings — combined “Account” card). */
export default function PersonalCredentialsSection() {
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
      <SettingsSectionScope label={productSettingsCopy.scopes.personalAccountOnly} />
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
          <form
            onSubmit={handlePasswordSubmit}
            className="space-y-4 border-t border-neutral-200 pt-4 dark:border-neutral-700"
          >
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
