"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import SupportTicketModal from "@/components/dashboard/SupportTicketModal";
import {
  SUPPORT_CONTACT_EMAIL,
  parseSupportContextParam,
  supportContextBannerMessage,
} from "@/lib/support-ticket";

/**
 * Shared Help / support block for dashboard, desktop, and enterprise settings.
 * @param supportContext - from `?supportContext=` when deep-linking from notifications
 */
export default function SettingsHelpSupportSection({
  supportContext,
  primaryClassName = "bg-bizzi-blue hover:bg-bizzi-cyan text-white dark:bg-bizzi-cyan/20 dark:text-bizzi-cyan",
}: {
  supportContext?: string | null;
  /** Button classes (enterprise uses CSS var primary). */
  primaryClassName?: string;
}) {
  const [ticketOpen, setTicketOpen] = useState(false);
  const ctx = parseSupportContextParam(supportContext ?? null);
  const banner = supportContextBannerMessage(ctx);

  return (
    <>
      {banner ? (
        <div
          className="mb-6 rounded-lg border border-bizzi-blue/30 bg-bizzi-blue/10 px-4 py-3 text-sm text-neutral-800 dark:border-bizzi-cyan/30 dark:bg-bizzi-cyan/10 dark:text-neutral-100"
          role="status"
        >
          {banner}
        </div>
      ) : null}
      <section className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-700 dark:bg-neutral-900">
        <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold text-neutral-900 dark:text-white">
          <HelpCircle className="h-5 w-5 text-bizzi-blue dark:text-bizzi-cyan" />
          Help and support
        </h2>
        <p className="text-sm text-neutral-600 dark:text-neutral-400">
          Need help with your account or files? Submit a support ticket and our team will review it as
          soon as possible.
        </p>
        <p className="mt-3 text-sm text-neutral-600 dark:text-neutral-400">
          For additional support, contact{" "}
          <a
            href={`mailto:${SUPPORT_CONTACT_EMAIL}`}
            className="text-bizzi-blue hover:underline dark:text-bizzi-cyan"
          >
            {SUPPORT_CONTACT_EMAIL}
          </a>
          .
        </p>
        <button
          type="button"
          onClick={() => setTicketOpen(true)}
          className={`mt-4 rounded-lg px-4 py-2 text-sm font-medium transition-opacity hover:opacity-90 ${primaryClassName}`}
        >
          Contact support
        </button>
      </section>
      <SupportTicketModal isOpen={ticketOpen} onClose={() => setTicketOpen(false)} />
    </>
  );
}
