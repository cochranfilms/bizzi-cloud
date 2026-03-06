import { ThemeProvider } from "@/context/ThemeContext";
import { BackupProvider } from "@/context/BackupContext";
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
        <DashboardAuthGuard>
          <DashboardShell>{children}</DashboardShell>
        </DashboardAuthGuard>
      </BackupProvider>
    </ThemeProvider>
  );
}
