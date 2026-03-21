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
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-bizzi-blue text-white shadow-lg transition-all hover:scale-105 hover:bg-bizzi-cyan focus:outline-none focus:ring-2 focus:ring-bizzi-blue focus:ring-offset-2 dark:bg-bizzi-cyan/20 dark:text-bizzi-cyan dark:hover:bg-bizzi-cyan/30"
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
