"use client";

import { useState, useRef, useEffect } from "react";
import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { ChevronDown, Settings, LogOut, Sun, Moon, Building2, Shield, Palette, Headphones } from "lucide-react";
import { useTheme } from "@/context/ThemeContext";
import { useAuth } from "@/context/AuthContext";
import { useEnterprise } from "@/context/EnterpriseContext";
import { getFirebaseAuth } from "@/lib/firebase/client";
import { signOut } from "firebase/auth";
import DashboardColorsModal from "./DashboardColorsModal";
import SupportTicketModal from "./SupportTicketModal";

interface UserMenuProps {
  compact?: boolean;
  /** When set (e.g. /desktop), settings link uses this base path */
  basePath?: string;
}

export default function UserMenu({ compact = false, basePath }: UserMenuProps) {
  const [open, setOpen] = useState(false);
  const [colorsModalOpen, setColorsModalOpen] = useState(false);
  const [supportModalOpen, setSupportModalOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const pathname = usePathname();
  const isEnterprise = pathname?.startsWith("/enterprise") ?? false;
  const { theme, setTheme } = useTheme();
  const { user } = useAuth();
  const { org } = useEnterprise();

  const displayName = user?.displayName ?? user?.email?.split("@")[0] ?? "User";
  const initials = (user?.displayName ?? user?.email ?? "U").slice(0, 2).toUpperCase();
  const photoURL = user?.photoURL ?? null;
  const email = user?.email ?? "";

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const dropdownPosition = compact
    ? "right-0 top-full mt-1"
    : "bottom-full left-0 right-0 mb-1";

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={
          compact
            ? "flex h-8 w-8 items-center justify-center overflow-hidden rounded-full bg-[var(--bizzi-accent)] text-sm font-medium text-white transition-opacity hover:opacity-90"
            : "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left transition-colors hover:bg-neutral-100 dark:hover:bg-neutral-800"
        }
      >
        {compact ? (
          photoURL ? (
            <Image
              src={photoURL}
              alt=""
              width={32}
              height={32}
              className="h-full w-full object-cover"
              unoptimized
            />
          ) : (
            initials
          )
        ) : (
          <>
            <div className="flex h-8 w-8 flex-shrink-0 items-center justify-center overflow-hidden rounded-full bg-[var(--bizzi-accent)] text-sm font-medium text-white">
              {photoURL ? (
                <Image
                  src={photoURL}
                  alt=""
                  width={32}
                  height={32}
                  className="h-full w-full object-cover"
                  unoptimized
                />
              ) : (
                initials
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium text-neutral-900 dark:text-white">
                {displayName}
              </p>
              <p className="truncate text-xs text-neutral-500 dark:text-neutral-400">
                {email || "Signed in"}
              </p>
            </div>
            <ChevronDown
              className={`h-4 w-4 flex-shrink-0 text-neutral-500 transition-transform ${open ? "rotate-180" : ""}`}
            />
          </>
        )}
      </button>

      {open && (
        <div
          className={`absolute z-[100] min-w-[200px] rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800 ${dropdownPosition}`}
        >
          <div className="border-b border-neutral-100 px-3 py-2 dark:border-neutral-700">
            <p className="text-sm font-medium text-neutral-900 dark:text-white">
              {displayName}
            </p>
            <p className="text-xs text-neutral-500 dark:text-neutral-400">
              {email || "Signed in"}
            </p>
          </div>
          {org && (
            <Link
              href="/enterprise"
              onClick={() => setOpen(false)}
              className="mx-2 mb-2 mt-2 flex items-center gap-2 rounded-lg border border-bizzi-blue/40 bg-bizzi-blue/10 px-3 py-2.5 text-sm font-medium text-bizzi-blue transition-colors hover:bg-bizzi-blue/20 hover:border-bizzi-blue/60 dark:border-bizzi-cyan/30 dark:bg-bizzi-blue/20 dark:text-bizzi-cyan dark:hover:bg-bizzi-blue/30"
            >
              <Building2 className="h-4 w-4 flex-shrink-0" />
              Enterprise dashboard
            </Link>
          )}
          <Link
            href="/admin"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            <Shield className="h-4 w-4" />
            Admin dashboard
          </Link>
          <button
            type="button"
            onClick={() => {
              setOpen(false);
              const settingsPath = basePath
                ? `${basePath}/settings`
                : isEnterprise
                  ? "/enterprise/settings"
                  : "/dashboard/settings";
              router.push(settingsPath);
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            <Settings className="h-4 w-4" />
            Settings
          </button>
          <div className="border-t border-neutral-100 dark:border-neutral-700">
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              {theme === "dark" ? (
                <Sun className="h-4 w-4" />
              ) : (
                <Moon className="h-4 w-4" />
              )}
              {theme === "dark" ? "Light theme" : "Dark theme"}
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setColorsModalOpen(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              <Palette className="h-4 w-4" />
              Customize dashboard
            </button>
            <button
              type="button"
              onClick={() => {
                setOpen(false);
                setSupportModalOpen(true);
              }}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              <Headphones className="h-4 w-4" />
              Support ticket
            </button>
            <Link
              href="/privacy"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              Privacy Policy
            </Link>
            <Link
              href="/terms"
              onClick={() => setOpen(false)}
              className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
            >
              Terms of Service
            </Link>
          </div>
          <button
            type="button"
            onClick={async () => {
              await signOut(getFirebaseAuth());
              router.push("/login");
              router.refresh();
            }}
            className="flex w-full items-center gap-2 px-3 py-2 text-sm text-neutral-700 transition-colors hover:bg-neutral-50 dark:text-neutral-300 dark:hover:bg-neutral-700"
          >
            <LogOut className="h-4 w-4" />
            Log out
          </button>
        </div>
      )}
      <DashboardColorsModal
        open={colorsModalOpen}
        onClose={() => setColorsModalOpen(false)}
      />
      <SupportTicketModal
        isOpen={supportModalOpen}
        onClose={() => setSupportModalOpen(false)}
      />
    </div>
  );
}
