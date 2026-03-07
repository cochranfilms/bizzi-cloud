"use client";

import { useEnterprise } from "@/context/EnterpriseContext";
import EnterpriseNavbar from "./EnterpriseNavbar";
import { getThemeVariables } from "@/lib/enterprise-themes";

export default function EnterpriseShell({
  children,
}: {
  children: React.ReactNode;
}) {
  const { org } = useEnterprise();
  const theme = org?.theme ?? "bizzi";
  const vars = getThemeVariables(theme);

  return (
    <div
      className="flex h-screen flex-col overflow-hidden bg-neutral-100 dark:bg-neutral-950"
      data-org-theme={theme}
      style={vars as React.CSSProperties}
    >
      <EnterpriseNavbar />
      <div className="flex min-h-0 min-w-0 flex-1 flex-col">{children}</div>
    </div>
  );
}
