import { ThemeProvider } from "@/context/ThemeContext";
import { BackupProvider } from "@/context/BackupContext";
import { CurrentFolderProvider } from "@/context/CurrentFolderContext";
import DashboardShell from "@/components/dashboard/DashboardShell";
import DashboardAuthGuard from "@/components/dashboard/DashboardAuthGuard";

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ThemeProvider>
      <BackupProvider>
        <CurrentFolderProvider>
          <DashboardAuthGuard>
            <DashboardShell>{children}</DashboardShell>
          </DashboardAuthGuard>
        </CurrentFolderProvider>
      </BackupProvider>
    </ThemeProvider>
  );
}
