"use client";

import { useState, useRef, useEffect, useMemo } from "react";
import { usePathname } from "next/navigation";
import { Bell } from "lucide-react";
import { useUnreadCount } from "@/hooks/useNotifications";
import { useEnterprise } from "@/context/EnterpriseContext";
import { clientNotificationRouting } from "@/lib/notification-routing-client";
import UnreadBadge from "./UnreadBadge";
import NotificationCenter from "./NotificationCenter";

export default function NotificationBell() {
  const pathname = usePathname();
  const { org } = useEnterprise();
  const routing = useMemo(
    () => clientNotificationRouting(pathname ?? "", org?.id ?? null),
    [pathname, org?.id]
  );
  const [open, setOpen] = useState(false);
  const { count, refresh } = useUnreadCount(routing);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="relative flex h-8 w-8 items-center justify-center rounded-lg text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
        aria-label={count > 0 ? `${count} unread notifications` : "Notifications"}
      >
        <Bell className="h-5 w-5" />
        <UnreadBadge count={count} />
      </button>
      {open && (
        <NotificationCenter
          onClose={() => setOpen(false)}
          onRefreshBadge={refresh}
          routing={routing}
        />
      )}
    </div>
  );
}
