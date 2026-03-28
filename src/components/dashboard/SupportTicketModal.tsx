"use client";

import { useState, useEffect } from "react";
import { createPortal } from "react-dom";
import { X, Send } from "lucide-react";
import { useAuth } from "@/context/AuthContext";

interface SupportTicketModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const PRIORITIES = [
  { value: "low", label: "Low" },
  { value: "medium", label: "Medium" },
  { value: "high", label: "High" },
  { value: "urgent", label: "Urgent" },
] as const;

const ISSUE_TYPES = [
  { value: "billing", label: "Billing" },
  { value: "upload", label: "Upload issues" },
  { value: "storage", label: "Storage" },
  { value: "account", label: "Account" },
  { value: "preview", label: "Preview / playback" },
  { value: "other", label: "Other" },
] as const;

export default function SupportTicketModal({ isOpen, onClose }: SupportTicketModalProps) {
  const { user } = useAuth();
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");
  const [priority, setPriority] = useState<"low" | "medium" | "high" | "urgent">("medium");
  const [issueType, setIssueType] = useState<"billing" | "upload" | "storage" | "account" | "preview" | "other">("other");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose, submitting]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/support/submit", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          subject: subject.trim(),
          message: message.trim(),
          priority,
          issueType,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error((data as { error?: string }).error ?? "Failed to submit");
      }
      setSuccess(true);
      setSubject("");
      setMessage("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to submit ticket");
    } finally {
      setSubmitting(false);
    }
  };

  if (!isOpen) return null;

  const content = (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/50"
        onClick={() => !submitting && onClose()}
        aria-hidden
      />
      <div
        className="relative w-full max-w-lg rounded-xl border border-neutral-200 bg-white shadow-xl dark:border-neutral-700 dark:bg-neutral-900"
        role="dialog"
        aria-labelledby="support-modal-title"
        aria-modal="true"
      >
        <div className="flex items-center justify-between border-b border-neutral-200 px-6 py-4 dark:border-neutral-700">
          <h2 id="support-modal-title" className="text-lg font-semibold">
            Contact support
          </h2>
          <button
            type="button"
            onClick={() => !submitting && onClose()}
            className="rounded-lg p-1.5 text-neutral-500 hover:bg-neutral-100 hover:text-neutral-700 dark:hover:bg-neutral-800 dark:hover:text-neutral-300"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {success ? (
          <div className="px-6 py-8 text-center">
            <p className="mb-6 text-green-600 dark:text-green-400">
              ✓ Ticket submitted successfully. We&apos;ll get back to you soon.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan dark:bg-bizzi-cyan/20 dark:text-bizzi-cyan"
            >
              Close
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4 p-6">
            {error && (
              <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 dark:bg-red-950/30 dark:text-red-300">
                {error}
              </p>
            )}
            <div>
              <label htmlFor="support-subject" className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Subject
              </label>
              <input
                id="support-subject"
                type="text"
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                placeholder="Brief description of your issue"
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                required
                minLength={3}
                maxLength={200}
              />
            </div>
            <div>
              <label htmlFor="support-message" className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                Message
              </label>
              <textarea
                id="support-message"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Describe your issue in detail..."
                rows={4}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                required
                minLength={10}
                maxLength={2000}
              />
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="support-priority" className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Priority
                </label>
                <select
                  id="support-priority"
                  value={priority}
                  onChange={(e) => setPriority(e.target.value as typeof priority)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                >
                  {PRIORITIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="support-type" className="mb-1 block text-sm font-medium text-neutral-700 dark:text-neutral-300">
                  Issue type
                </label>
                <select
                  id="support-type"
                  value={issueType}
                  onChange={(e) => setIssueType(e.target.value as typeof issueType)}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm dark:border-neutral-600 dark:bg-neutral-800 dark:text-white"
                >
                  {ISSUE_TYPES.map((t) => (
                    <option key={t.value} value={t.value}>
                      {t.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={onClose}
                disabled={submitting}
                className="rounded-lg border border-neutral-200 px-4 py-2 text-sm font-medium dark:border-neutral-700 dark:hover:bg-neutral-800 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || subject.trim().length < 3 || message.trim().length < 10}
                className="flex items-center gap-2 rounded-lg bg-bizzi-blue px-4 py-2 text-sm font-medium text-white hover:bg-bizzi-cyan disabled:opacity-50 dark:bg-bizzi-cyan/20 dark:text-bizzi-cyan"
              >
                {submitting ? (
                  "Sending…"
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Send ticket
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );

  return createPortal(content, document.body);
}
