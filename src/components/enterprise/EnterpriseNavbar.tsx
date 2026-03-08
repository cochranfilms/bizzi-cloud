"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  Home,
  FolderOpen,
  Share2,
  Trash2,
  Send,
  Users,
  Settings,
  Menu,
  X,
  Search,
  Film,
} from "lucide-react";
import UserMenu from "@/components/dashboard/UserMenu";
import { useEnterprise } from "@/context/EnterpriseContext";

const navItems = [
  { href: "/enterprise", label: "Home", icon: Home },
  { href: "/enterprise/files", label: "All files", icon: FolderOpen },
  { href: "/enterprise/creator", label: "Creator", icon: Film },
  { href: "/enterprise/shared", label: "Shared", icon: Share2 },
  { href: "/enterprise/transfers", label: "Transfers", icon: Send },
  { href: "/enterprise/trash", label: "Deleted files", icon: Trash2 },
  { href: "/enterprise/seats", label: "Seats", icon: Users },
  { href: "/enterprise/settings", label: "Settings", icon: Settings },
];

export default function EnterpriseNavbar() {
  const pathname = usePathname();
  const { org } = useEnterprise();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchFocused, setSearchFocused] = useState(false);

  const logoUrl = org?.logo_url;
  const theme = org?.theme ?? "bizzi";

  return (
    <header
      className="sticky top-0 z-50 flex h-14 flex-shrink-0 items-center gap-4 border-b border-neutral-200 bg-white px-4 shadow-sm dark:border-neutral-800 dark:bg-neutral-950 dark:shadow-neutral-900/50 md:gap-6 md:px-6"
      data-org-theme={theme}
    >
      <button
        type="button"
        onClick={() => setMobileOpen((o) => !o)}
        className="-ml-1 rounded-lg p-2 text-neutral-600 hover:bg-neutral-100 md:hidden dark:text-neutral-400 dark:hover:bg-neutral-800"
        aria-label={mobileOpen ? "Close menu" : "Open menu"}
      >
        {mobileOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
      </button>

      <Link
        href="/enterprise"
        className="flex flex-shrink-0 items-center gap-2"
        onClick={() => setMobileOpen(false)}
      >
        {logoUrl ? (
          <img
            src={logoUrl}
            alt={org?.name ?? "Organization"}
            width={24}
            height={24}
            className="h-6 w-6 object-contain"
          />
        ) : (
          <Image
            src="/logo.png"
            alt="Bizzi Byte"
            width={24}
            height={24}
            className="object-contain"
          />
        )}
        <span className="font-semibold text-base tracking-tight text-neutral-900 dark:text-white">
          {org?.name ?? "Enterprise"}
        </span>
      </Link>

      <nav className="hidden md:flex items-center gap-0.5">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive =
            pathname === item.href ||
            (item.href !== "/enterprise" && pathname.startsWith(item.href));
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors enterprise-nav-link ${
                isActive
                  ? "bg-[var(--enterprise-primary)]/10 font-medium text-[var(--enterprise-primary)]"
                  : "text-neutral-600 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
              }`}
            >
              <Icon className="h-4 w-4 flex-shrink-0" />
              <span className="hidden lg:inline">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div
        className={`relative flex-1 min-w-0 max-w-xl transition-all ${
          searchFocused ? "flex-[1.5]" : ""
        }`}
      >
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-neutral-400" />
        <input
          type="search"
          placeholder="Search files..."
          onFocus={() => setSearchFocused(true)}
          onBlur={() => setSearchFocused(false)}
          className="w-full rounded-lg border border-neutral-200 bg-neutral-50 py-2 pl-9 pr-3 text-sm placeholder-neutral-400 outline-none transition-colors focus:border-[var(--enterprise-primary)] focus:ring-1 focus:ring-[var(--enterprise-primary)]/20 dark:border-neutral-700 dark:bg-neutral-900 dark:text-white dark:placeholder-neutral-500"
        />
      </div>

      <div className="flex flex-shrink-0 items-center gap-2">
        <Link
          href="/dashboard"
          className="text-xs text-neutral-500 hover:text-neutral-700 dark:text-neutral-400 dark:hover:text-neutral-300"
        >
          Personal
        </Link>
        <UserMenu compact />
      </div>

      {mobileOpen && (
        <div
          className="fixed inset-0 top-14 z-40 bg-black/30 md:hidden"
          onClick={() => setMobileOpen(false)}
          aria-hidden
        />
      )}
      <nav
        className={`fixed left-0 right-0 top-14 z-50 transform border-b border-neutral-200 bg-white transition-transform duration-200 ease-out md:hidden dark:border-neutral-800 dark:bg-neutral-950 ${
          mobileOpen ? "translate-y-0" : "-translate-y-full opacity-0"
        }`}
      >
        <ul className="max-h-[calc(100vh-3.5rem)] overflow-y-auto p-3">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive =
              pathname === item.href ||
              (item.href !== "/enterprise" && pathname.startsWith(item.href));
            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  onClick={() => setMobileOpen(false)}
                  className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                    isActive
                      ? "bg-[var(--enterprise-primary)]/10 font-medium text-[var(--enterprise-primary)]"
                      : "text-neutral-700 hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-300 dark:hover:bg-neutral-800 dark:hover:text-white"
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  {item.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </header>
  );
}
