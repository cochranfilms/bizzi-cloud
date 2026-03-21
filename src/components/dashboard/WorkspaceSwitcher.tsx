"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname } from "next/navigation";
import Link from "next/link";
import { ChevronDown, User, Building2 } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { useEnterprise } from "@/context/EnterpriseContext";

interface Workspace {
  id: string;
  name: string;
  role?: string;
  status: string;
}

export default function WorkspaceSwitcher() {
  const [open, setOpen] = useState(false);
  const [workspaces, setWorkspaces] = useState<{
    personal: Workspace | null;
    organizations: Workspace[];
  } | null>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const pathname = usePathname();
  const isEnterprise = pathname?.startsWith("/enterprise") ?? false;
  const { user } = useAuth();
  const { org } = useEnterprise();

  useEffect(() => {
    if (!user) return;
    (async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch("/api/account/workspaces", {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (res.ok) {
          const data = await res.json();
          setWorkspaces({
            personal: data.personal,
            organizations: data.organizations ?? [],
          });
        }
      } catch {
        setWorkspaces({ personal: null, organizations: [] });
      }
    })();
  }, [user]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("click", handleClickOutside);
    return () => document.removeEventListener("click", handleClickOutside);
  }, []);

  const currentLabel = isEnterprise
    ? org?.name ?? "Enterprise"
    : workspaces?.personal?.name ?? "Personal Workspace";

  const hasMultiple = (workspaces?.personal ? 1 : 0) + (workspaces?.organizations?.length ?? 0) > 1;

  if (!hasMultiple) {
    if (isEnterprise && org) {
      return (
        <Link
          href="/dashboard"
          className="rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
          title="Switch to personal workspace"
        >
          Switch to Personal
        </Link>
      );
    }
    if (!isEnterprise && org) {
      return (
        <Link
          href="/enterprise"
          className="rounded-lg border border-bizzi-blue/40 bg-bizzi-blue/10 px-3 py-1.5 text-xs font-medium text-bizzi-blue transition-colors hover:bg-bizzi-blue/20 dark:border-bizzi-cyan/30 dark:bg-bizzi-blue/20 dark:text-bizzi-cyan dark:hover:bg-bizzi-blue/30"
          title="Switch to enterprise workspace"
        >
          {org.name}
        </Link>
      );
    }
    return null;
  }

  return (
    <div className="relative" ref={menuRef}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 rounded-lg border border-neutral-200 bg-white px-3 py-1.5 text-xs font-medium text-neutral-600 transition-colors hover:bg-neutral-50 hover:text-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-400 dark:hover:bg-neutral-800 dark:hover:text-white"
        aria-expanded={open}
        aria-haspopup="true"
      >
        <span className="truncate max-w-[120px]">{currentLabel}</span>
        <ChevronDown className={`h-3.5 w-3.5 flex-shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="absolute right-0 top-full z-[100] mt-1 min-w-[180px] rounded-lg border border-neutral-200 bg-white py-1 shadow-lg dark:border-neutral-700 dark:bg-neutral-800">
          {workspaces?.personal && (
            <Link
              href="/dashboard"
              onClick={() => setOpen(false)}
              className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                !isEnterprise
                  ? "bg-neutral-100 font-medium dark:bg-neutral-700"
                  : "hover:bg-neutral-50 dark:hover:bg-neutral-700"
              }`}
            >
              <User className="h-4 w-4 flex-shrink-0 text-neutral-500" />
              <span className="flex-1 truncate">{workspaces.personal.name}</span>
              {workspaces.personal.status !== "Active" && (
                <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs dark:bg-neutral-600">
                  {workspaces.personal.status}
                </span>
              )}
            </Link>
          )}
          {workspaces?.organizations?.map((orgWs) => (
            <Link
              key={orgWs.id}
              href="/enterprise"
              onClick={() => {
                setOpen(false);
                if (typeof window !== "undefined") {
                  sessionStorage.setItem("bizzi-enterprise-org", orgWs.id);
                }
              }}
              className={`flex items-center gap-2 px-3 py-2 text-sm transition-colors ${
                isEnterprise && org?.id === orgWs.id
                  ? "bg-[var(--enterprise-primary)]/10 font-medium text-[var(--enterprise-primary)]"
                  : "hover:bg-neutral-50 dark:hover:bg-neutral-700"
              }`}
            >
              <Building2 className="h-4 w-4 flex-shrink-0 text-neutral-500" />
              <span className="flex-1 truncate">{orgWs.name}</span>
              {orgWs.role === "admin" && (
                <span className="rounded bg-[var(--enterprise-primary)]/20 px-1.5 py-0.5 text-xs text-[var(--enterprise-primary)]">
                  Admin
                </span>
              )}
              {orgWs.status !== "Active" && (
                <span className="rounded bg-neutral-200 px-1.5 py-0.5 text-xs dark:bg-neutral-600">
                  {orgWs.status}
                </span>
              )}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
