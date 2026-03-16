"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import { useAuth } from "@/context/AuthContext";

interface AdminDisplay {
  locale: string;
  currency: string;
}

const DEFAULT_DISPLAY: AdminDisplay = { locale: "en-US", currency: "USD" };

const AdminDisplayContext = createContext<{
  display: AdminDisplay;
  loading: boolean;
  refresh: () => Promise<void>;
}>({
  display: DEFAULT_DISPLAY,
  loading: true,
  refresh: async () => {},
});

export function AdminDisplayProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [display, setDisplay] = useState<AdminDisplay>(DEFAULT_DISPLAY);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!user) {
      setDisplay(DEFAULT_DISPLAY);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("/api/admin/settings", {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });
      if (res.ok) {
        const data = (await res.json()) as { display?: { locale?: string; currency?: string } };
        const d = data.display;
        setDisplay({
          locale: d?.locale ?? "en-US",
          currency: d?.currency ?? "USD",
        });
      } else {
        setDisplay(DEFAULT_DISPLAY);
      }
    } catch {
      setDisplay(DEFAULT_DISPLAY);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <AdminDisplayContext.Provider value={{ display, loading, refresh }}>
      {children}
    </AdminDisplayContext.Provider>
  );
}

export function useAdminDisplay() {
  return useContext(AdminDisplayContext);
}

/** Hook for admin components: formats currency using platform display settings. */
export function useAdminFormatCurrency() {
  const { display } = useAdminDisplay();
  return (value: number, currency?: string) =>
    new Intl.NumberFormat(display.locale, {
      style: "currency",
      currency: currency ?? display.currency,
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    }).format(value);
}
