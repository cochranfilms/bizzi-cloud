import { spawn } from "child_process";
import { createPresignedDownloadUrl, isB2Configured } from "@/lib/b2";
import { getAdminFirestore } from "@/lib/firebase-admin";
import { verifyShareAccess } from "@/lib/share-access";
import { NextResponse } from "next/server";
import ffmpegPath from "ffmpeg-static";

export const maxDuration = 60;

const VIDEO_EXT = /\.(mp4|webm|ogg|mov|m4v|avi|mxf|mts|mkv|3gp)$/i;

function isVideoFile(name: string): boolean {
  return VIDEO_EXT.test(name.toLowerCase());
}

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  if (!isB2Configured()) {
    return new NextResponse("B2 not configured", { status: 503 });
  }

  if (!ffmpegPath) {
    console.error("[share video-thumbnail] ffmpeg binary not found");
    return new NextResponse("Video thumbnail not available", { status: 503 });
  }

  const { token: shareToken } = await params;

  if (!shareToken || typeof shareToken !== "string") {
    return new NextResponse("Invalid token", { status: 400 });
  }

  const url = new URL(request.url);
  const objectKey = url.searchParams.get("object_key");
  const fileName = url.searchParams.get("name") ?? "";

  if (!objectKey || !isVideoFile(fileName || objectKey)) {
    return new NextResponse("object_key and video name required", {
      status: 400,
    });
  }

  const db = getAdminFirestore();
  const shareSnap = await db.collection("folder_shares").doc(shareToken).get();

  if (!shareSnap.exists) {
    return new NextResponse("Share not found", { status: 404 });
  }

  const share = shareSnap.data();
  if (!share) {
    return new NextResponse("Share not found", { status: 404 });
  }

  const expiresAt = share.expires_at?.toDate?.();
  if (expiresAt && expiresAt < new Date()) {
    return new NextResponse("Share expired", { status: 410 });
  }

  const authHeader = request.headers.get("Authorization");
  const access = await verifyShareAccess(
    {
      owner_id: share.owner_id as string,
      access_level: share.access_level as string | undefined,
      invited_emails: share.invited_emails as string[] | undefined,
    },
    authHeader
  );

  if (!access.allowed) {
    return new NextResponse("Access denied", { status: 403 });
  }

  const linkedDriveId = share.linked_drive_id as string;
  const ownerId = share.owner_id as string;

  const fileSnap = await db
    .collection("backup_files")
    .where("userId", "==", ownerId)
    .where("linked_drive_id", "==", linkedDriveId)
    .where("object_key", "==", objectKey)
    .limit(1)
    .get();

  if (fileSnap.empty || fileSnap.docs[0].data().deleted_at) {
    return new NextResponse("Access denied", { status: 403 });
  }

  try {
    const presignedUrl = await createPresignedDownloadUrl(objectKey, 600);

    const thumbBuffer = await new Promise<Buffer>((resolve, reject) => {
      const args = [
        "-y",
        "-ss",
        "0.5",
        "-i",
        presignedUrl,
        "-vframes",
        "1",
        "-f",
        "image2",
        "-q:v",
        "3",
        "pipe:1",
      ];

      const proc = spawn(ffmpegPath!, args, {
        stdio: ["ignore", "pipe", "pipe"],
        env: { ...process.env, FFREPORT: "file=/dev/null:level=0" },
      });

      const chunks: Buffer[] = [];
      proc.stdout?.on("data", (chunk: Buffer) => chunks.push(chunk));
      proc.stderr?.on("data", () => {});

      proc.on("close", (code) => {
        if (code === 0) {
          resolve(Buffer.concat(chunks));
        } else {
          reject(new Error(`FFmpeg exited with code ${code}`));
        }
      });
      proc.on("error", reject);
    });

    if (!thumbBuffer.length) {
      return new NextResponse("Failed to generate thumbnail", { status: 500 });
    }

    return new NextResponse(new Uint8Array(thumbBuffer), {
      status: 200,
      headers: {
        "Content-Type": "image/jpeg",
        "Cache-Control": "private, max-age=3600",
      },
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Video thumbnail failed";
    console.error("[share video-thumbnail] Error:", msg);
    return new NextResponse(msg, { status: 500 });
  }
}
