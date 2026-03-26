import { redirect } from "next/navigation";

/** Legacy org admin / workspaces UI removed; send bookmarks to dashboard home. */
export default function EnterpriseAdminSunsetRedirect() {
  redirect("/enterprise");
}
