/**
 * POST /api/account/export
 * GDPR data export: returns user data as JSON (metadata only, no file contents).
 */
import { getAdminFirestore, verifyIdToken } from "@/lib/firebase-admin";
import { checkRateLimit } from "@/lib/rate-limit";
import { writeAuditLog, getClientIp } from "@/lib/audit-log";
import { NextResponse } from "next/server";

function toJsonSafe(val: unknown): unknown {
  if (val == null) return val;
  if (typeof val === "object" && "toDate" in val && typeof (val as { toDate: () => Date }).toDate === "function") {
    return (val as { toDate: () => Date }).toDate().toISOString();
  }
  if (Array.isArray(val)) return val.map(toJsonSafe);
  if (typeof val === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      if (["password", "password_hash", "pin", "pin_hash", "token", "secret", "private_key"].includes(k)) continue;
      out[k] = toJsonSafe(v);
    }
    return out;
  }
  return val;
}

export async function POST(request: Request) {
  const authHeader = request.headers.get("Authorization");
  const token = authHeader?.startsWith("Bearer ") ? authHeader.slice(7).trim() : null;
  if (!token) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  let uid: string;
  try {
    const decoded = await verifyIdToken(token);
    uid = decoded.uid;
  } catch {
    return NextResponse.json({ error: "Invalid token" }, { status: 401 });
  }

  const rl = checkRateLimit(`export:${uid}`, 2, 60 * 60 * 1000);
  if (!rl.allowed) {
    return NextResponse.json(
      { error: "Export limit reached. Try again in an hour." },
      { status: 429, headers: { "Retry-After": String(Math.ceil((rl.resetAt - Date.now()) / 1000)) } }
    );
  }

  const db = getAdminFirestore();

  const [profileSnap, drivesSnap, filesSnap, galleriesSnap, transfersSnap, sharesSnap] = await Promise.all([
    db.collection("profiles").doc(uid).get(),
    db.collection("linked_drives").where("userId", "==", uid).get(),
    db.collection("backup_files").where("userId", "==", uid).get(),
    db.collection("galleries").where("photographer_id", "==", uid).get(),
    db.collection("transfers").where("user_id", "==", uid).get(),
    db.collection("folder_shares").where("owner_id", "==", uid).get(),
  ]);

  const profile = profileSnap.exists ? toJsonSafe(profileSnap.data()) : null;
  const drives = drivesSnap.docs.map((d) => {
    const data = toJsonSafe(d.data()) as Record<string, unknown>;
    return { id: d.id, ...data };
  });
  const files = filesSnap.docs.map((d) => {
    const data = toJsonSafe(d.data()) as Record<string, unknown>;
    return { id: d.id, ...data };
  });
  const galleries = galleriesSnap.docs.map((d) => {
    const data = toJsonSafe(d.data()) as Record<string, unknown>;
    return { id: d.id, ...data };
  });
  const transfers = transfersSnap.docs.map((d) => {
    const data = toJsonSafe(d.data()) as Record<string, unknown>;
    return { id: d.id, slug: d.id, ...data };
  });
  const shares = sharesSnap.docs.map((d) => {
    const data = toJsonSafe(d.data()) as Record<string, unknown>;
    return { id: d.id, ...data };
  });

  const exportData = {
    exported_at: new Date().toISOString(),
    profile,
    linked_drives: drives,
    backup_files: files,
    galleries,
    transfers,
    folder_shares: shares,
  };

  await writeAuditLog({
    action: "account_export",
    uid,
    ip: getClientIp(request),
    userAgent: request.headers.get("user-agent") ?? null,
    metadata: { fileCount: files.length, driveCount: drives.length },
  });

  return new NextResponse(JSON.stringify(exportData, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="bizzi-cloud-export-${uid.slice(0, 8)}-${Date.now()}.json"`,
    },
  });
}
