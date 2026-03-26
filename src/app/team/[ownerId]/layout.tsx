import { notFound } from "next/navigation";
import TeamLayoutShell from "./TeamLayoutShell";

export default async function TeamWorkspaceLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ ownerId: string }>;
}) {
  const { ownerId } = await params;
  const teamOwnerUid = (ownerId ?? "").trim();
  if (!teamOwnerUid || teamOwnerUid.length > 128 || teamOwnerUid.includes("/")) {
    notFound();
  }

  return <TeamLayoutShell teamOwnerUid={teamOwnerUid}>{children}</TeamLayoutShell>;
}
