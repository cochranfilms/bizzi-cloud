"use client";

import { useState } from "react";
import { X } from "lucide-react";

interface ShareModalProps {
  open: boolean;
  onClose: () => void;
  folderName: string;
}

export default function ShareModal({
  open,
  onClose,
  folderName,
}: ShareModalProps) {
  const [email, setEmail] = useState("");
  const [permission, setPermission] = useState<"view" | "edit">("edit");

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={onClose}
        aria-hidden
      />
      <div className="relative w-full max-w-md rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900">
        <div className="flex items-center justify-between border-b border-neutral-200 p-4 dark:border-neutral-700">
          <h3 className="text-lg font-semibold text-neutral-900 dark:text-white">
            Share &quot;{folderName}&quot;
          </h3>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 p-4">
          <div>
            <label
              htmlFor="share-email"
              className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300"
            >
              Email address
            </label>
            <input
              id="share-email"
              type="email"
              placeholder="colleague@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="w-full rounded-lg border border-neutral-200 bg-white px-4 py-2 text-sm outline-none focus:border-bizzi-blue dark:border-neutral-700 dark:bg-neutral-800 dark:text-white"
            />
          </div>

          <div>
            <label className="mb-2 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
              Permission
            </label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setPermission("view")}
                className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  permission === "view"
                    ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                View
              </button>
              <button
                type="button"
                onClick={() => setPermission("edit")}
                className={`flex-1 rounded-lg border px-4 py-2 text-sm font-medium transition-colors ${
                  permission === "edit"
                    ? "border-bizzi-blue bg-bizzi-blue/10 text-bizzi-blue"
                    : "border-neutral-200 text-neutral-600 hover:bg-neutral-50 dark:border-neutral-700 dark:text-neutral-400 dark:hover:bg-neutral-800"
                }`}
              >
                Edit
              </button>
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-neutral-200 p-4 dark:border-neutral-700">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg px-4 py-2 text-sm font-medium text-neutral-700 transition-colors hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-bizzi-cyan"
          >
            Invite
          </button>
        </div>
      </div>
    </div>
  );
}
