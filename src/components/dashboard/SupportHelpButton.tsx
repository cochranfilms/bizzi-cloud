"use client";

import { useState } from "react";
import { HelpCircle } from "lucide-react";
import SupportTicketModal from "./SupportTicketModal";

export default function SupportHelpButton() {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setModalOpen(true)}
        className="fixed bottom-[max(5.5rem,calc(env(safe-area-inset-bottom,0px)+0.75rem))] right-[max(0.75rem,calc(env(safe-area-inset-right,0px)+0.25rem))] z-30 flex h-12 w-12 items-center justify-center rounded-full bg-bizzi-blue text-white shadow-lg transition-all hover:scale-105 hover:bg-bizzi-cyan focus:outline-none focus:ring-2 focus:ring-bizzi-blue focus:ring-offset-2 dark:bg-bizzi-cyan/20 dark:text-bizzi-cyan dark:hover:bg-bizzi-cyan/30 sm:bottom-6 sm:right-6 sm:h-14 sm:w-14"
        aria-label="Get help / Contact support"
        title="Contact support"
      >
        <HelpCircle className="h-6 w-6" />
      </button>
      <SupportTicketModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
