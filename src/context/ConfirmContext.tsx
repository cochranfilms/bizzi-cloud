"use client";

import {
  createContext,
  useContext,
  useCallback,
  useRef,
  useState,
  useMemo,
} from "react";
import ConfirmModal from "@/components/dashboard/ConfirmModal";
import { useEnterprise } from "@/context/EnterpriseContext";
import type { EnterpriseThemeId } from "@/types/enterprise";

export interface ConfirmOptions {
  message: string;
  title?: string;
  destructive?: boolean;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface ConfirmContextValue {
  confirm: (options: ConfirmOptions) => Promise<boolean>;
}

const ConfirmContext = createContext<ConfirmContextValue | null>(null);

export function ConfirmProvider({ children }: { children: React.ReactNode }) {
  const { org } = useEnterprise();
  const enterpriseTheme: EnterpriseThemeId | null = org?.theme ?? null;

  const [open, setOpen] = useState(false);
  const [config, setConfig] = useState<ConfirmOptions | null>(null);
  const resolveRef = useRef<((value: boolean) => void) | null>(null);

  const confirm = useCallback((options: ConfirmOptions): Promise<boolean> => {
    return new Promise((resolve) => {
      resolveRef.current = resolve;
      setConfig(options);
      setOpen(true);
    });
  }, []);

  const handleClose = useCallback(() => {
    resolveRef.current?.(false);
    resolveRef.current = null;
    setOpen(false);
    setConfig(null);
  }, []);

  const handleConfirm = useCallback(() => {
    resolveRef.current?.(true);
    resolveRef.current = null;
    setOpen(false);
    setConfig(null);
  }, []);

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      {config && (
        <ConfirmModal
          open={open}
          onClose={handleClose}
          onConfirm={handleConfirm}
          title={config.title}
          message={config.message}
          confirmLabel={config.confirmLabel}
          cancelLabel={config.cancelLabel}
          destructive={config.destructive}
          enterpriseTheme={enterpriseTheme}
        />
      )}
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const ctx = useContext(ConfirmContext);
  if (!ctx) throw new Error("useConfirm must be used within ConfirmProvider");
  return ctx;
}
