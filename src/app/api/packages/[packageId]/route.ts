/**
 * GET /api/packages/[packageId] — package container metadata for UI (info drawer).
 */
import { verifyMacosPackageAccessForUser } from "@/lib/macos-package-access";
import { verifyIdToken } from "@/lib/firebase-admin";
import { NextResponse } from "next/server";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ packageId: string }> }
) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) {
    return NextResponse.json({ error: "Missing Authorization" }, { status: 401 });
  }
  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid or expired token" }, { status: 401 });
  }

  const { packageId } = await params;
  if (!packageId?.startsWith("pkg_")) {
    return NextResponse.json({ error: "Invalid package id" }, { status: 400 });
  }

  const access = await verifyMacosPackageAccessForUser(uid, packageId);
  if (!access.ok) {
    return NextResponse.json({ error: access.message }, { status: access.status });
  }

  const d = access.data;
  return NextResponse.json({
    id: packageId,
    package_kind: d.package_kind ?? null,
    root_relative_path: d.root_relative_path ?? null,
    root_segment_name: d.root_segment_name ?? null,
    display_label: d.display_label ?? null,
    file_count: d.file_count ?? 0,
    total_bytes: d.total_bytes ?? 0,
    last_activity_at:
      d.last_activity_at?.toDate?.()?.toISOString?.() ??
      (typeof d.last_activity_at === "string" ? d.last_activity_at : null),
    linked_drive_id: d.linked_drive_id ?? null,
  });
}
