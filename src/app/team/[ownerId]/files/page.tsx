import RedirectWorkspaceHub from "@/components/dashboard/RedirectWorkspaceHub";

export default async function TeamFilesPage({
  params,
}: {
  params: Promise<{ ownerId: string }>;
}) {
  const { ownerId } = await params;
  return <RedirectWorkspaceHub href={`/team/${ownerId}`} />;
}
