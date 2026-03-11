"use client";

import { useState } from "react";

export interface CheckoutModalProps {
  isOpen: boolean;
  onClose: () => void;
  planId: string;
  planName: string;
  addonId: string | null;
  addonName?: string;
  billing: "monthly" | "annual";
  priceLabel: string;
  onSubmit: (data: { name: string; email: string }) => Promise<void>;
  loading?: boolean;
  error?: string | null;
}

export default function CheckoutModal({
  isOpen,
  onClose,
  planId,
  planName,
  addonId,
  addonName,
  billing,
  priceLabel,
  onSubmit,
  loading = false,
  error = null,
}: CheckoutModalProps) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email.trim()) return;
    await onSubmit({ name: name.trim(), email: email.trim() });
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        aria-hidden
        onClick={onClose}
      />
      <div className="relative w-full max-w-md rounded-2xl bg-white p-6 shadow-xl dark:bg-neutral-900">
        <h3 className="text-xl font-semibold text-neutral-900 dark:text-white">
          Almost there
        </h3>
        <p className="mt-1 text-sm text-neutral-500 dark:text-neutral-400">
          Enter your details to continue to checkout
        </p>
        <div className="mt-4 rounded-lg bg-neutral-50 px-3 py-2 text-sm dark:bg-neutral-800 dark:text-neutral-300">
          {planName}
          {addonName && ` + ${addonName}`} — {priceLabel}
        </div>
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
              className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
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
              className="mt-1 w-full rounded-lg border border-neutral-200 bg-white px-4 py-2.5 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
              placeholder="you@example.com"
            />
          </div>
          {error && (
            <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
          )}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-xl border border-neutral-200 px-4 py-2.5 text-sm font-medium text-neutral-700 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !name.trim() || !email.trim()}
              className="flex-1 rounded-xl bg-bizzi-blue px-4 py-2.5 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan disabled:opacity-50"
            >
              {loading ? "Redirecting…" : "Continue to checkout"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
