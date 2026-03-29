"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";

export type CheckoutModalLoadingPhase =
  | "idle"
  | "creating_account"
  | "redirecting_checkout";

export interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  planId: string;
  planName: string;
  addonId: string | null;
  addonName?: string;
  billing: "monthly" | "annual";
  priceLabel: string;
  /** Personal team seat breakdown for guest summary */
  teamSummaryLine?: string;
  onSubmit: (data: {
    name: string;
    email: string;
    password: string;
  }) => Promise<void>;
  loading?: boolean;
  loadingPhase?: CheckoutModalLoadingPhase;
  error?: string | null;
  /** When true, show recovery UI instead of the form (email already registered). */
  emailInUse?: boolean;
  /** After signup succeeded but checkout POST failed — show “Try checkout again”. */
  checkoutRecovery?: boolean;
  onRetryCheckout?: () => void | Promise<void>;
}

const PASSWORD_MIN = 6;

export default function CheckoutModal({
  isOpen,
  onClose,
  planId: _planId,
  planName,
  addonId,
  addonName,
  billing,
  priceLabel,
  teamSummaryLine,
  onSubmit,
  loading = false,
  loadingPhase = "idle",
  error = null,
  emailInUse = false,
  checkoutRecovery = false,
  onRetryCheckout,
}: CheckoutModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [fieldError, setFieldError] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [isOpen]);

  const resetFields = () => {
    setName("");
    setEmail("");
    setPassword("");
    setConfirmPassword("");
    setFieldError(null);
  };

  const handleClose = () => {
    if (loading) return;
    resetFields();
    onClose();
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFieldError(null);
    if (!name.trim() || !email.trim()) return;
    if (password.length < PASSWORD_MIN) {
      setFieldError(`Password must be at least ${PASSWORD_MIN} characters.`);
      return;
    }
    if (password !== confirmPassword) {
      setFieldError("Passwords do not match.");
      return;
    }
    await onSubmit({
      name: name.trim(),
      email: email.trim(),
      password,
    });
  };

  if (!isOpen) return null;
  if (typeof document === "undefined") return null;

  const submitLabel =
    loadingPhase === "creating_account"
      ? "Creating your account…"
      : loadingPhase === "redirecting_checkout"
        ? "Redirecting to secure checkout…"
        : "Continue to checkout";

  const canSubmit =
    !loading &&
    name.trim().length > 0 &&
    email.trim().length > 0 &&
    password.length >= PASSWORD_MIN &&
    confirmPassword.length > 0;

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center overflow-y-auto overscroll-contain p-4 sm:p-6">
      <button
        type="button"
        aria-label="Close"
        className="fixed inset-0 bg-black/50"
        onClick={loading ? undefined : handleClose}
      />
      <div
        className="relative z-10 my-auto max-h-[min(90dvh,720px)] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-900"
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-modal-title"
      >
        <h3
          id="checkout-modal-title"
          className="text-xl font-semibold text-neutral-900 dark:text-white"
        >
          Almost there
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Create your login so your account is ready after checkout.
        </p>
        <div className="mt-4 space-y-1 rounded-lg bg-neutral-50 px-3 py-2 text-sm dark:bg-neutral-800 dark:text-neutral-300">
          <p>
            {planName}
            {addonName && ` + ${addonName}`} — {priceLabel}
          </p>
          {teamSummaryLine ? (
            <p className="text-xs text-neutral-600 dark:text-neutral-400">{teamSummaryLine}</p>
          ) : null}
        </div>

        {emailInUse ? (
          <div className="mt-6 space-y-4">
            <p className="text-sm text-neutral-700 dark:text-neutral-300">
              An account already exists with this email. Sign in to continue checkout.
            </p>
            <div className="flex flex-col gap-3">
              <Link
                href="/login"
                className="block w-full rounded-xl bg-bizzi-blue px-4 py-2.5 text-center text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
              >
                Sign in
              </Link>
              <button
                type="button"
                onClick={() => {
                  resetFields();
                  onClose();
                }}
                className="w-full rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Back
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-6 space-y-4">
            <div>
              <label
                htmlFor="checkout-name"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                Name
              </label>
              <input
                id="checkout-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                required
                disabled={loading}
                autoComplete="name"
                className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-bizzi-blue disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                placeholder="Your name"
              />
            </div>
            <div>
              <label
                htmlFor="checkout-email"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                Email
              </label>
              <input
                id="checkout-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                disabled={loading}
                autoComplete="email"
                className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-bizzi-blue disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                placeholder="you@example.com"
              />
            </div>
            <div>
              <label
                htmlFor="checkout-password"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                Password
              </label>
              <input
                id="checkout-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                disabled={loading}
                minLength={PASSWORD_MIN}
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-bizzi-blue disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                placeholder={`At least ${PASSWORD_MIN} characters`}
              />
            </div>
            <div>
              <label
                htmlFor="checkout-password-confirm"
                className="block text-sm font-medium text-neutral-700 dark:text-neutral-300"
              >
                Confirm password
              </label>
              <input
                id="checkout-password-confirm"
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                required
                disabled={loading}
                minLength={PASSWORD_MIN}
                autoComplete="new-password"
                className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-bizzi-blue disabled:opacity-60 dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
                placeholder="Re-enter password"
              />
            </div>
            {fieldError && (
              <p className="text-sm text-red-600 dark:text-red-400">{fieldError}</p>
            )}
            {error && (
              <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
            )}
            {checkoutRecovery && error && onRetryCheckout && (
              <button
                type="button"
                onClick={() => void onRetryCheckout()}
                disabled={loading}
                className="w-full rounded-xl border border-bizzi-blue/40 bg-bizzi-blue/10 px-4 py-2.5 text-sm font-medium text-bizzi-blue hover:bg-bizzi-blue/15 disabled:opacity-50 dark:text-bizzi-cyan"
              >
                Try checkout again
              </button>
            )}
            <div className="flex gap-3 pt-2">
              <button
                type="button"
                onClick={handleClose}
                disabled={loading}
                className="flex-1 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={loading || !canSubmit}
                className="flex-1 rounded-xl bg-bizzi-blue px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
              >
                {submitLabel}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>,
    document.body
  );
}
